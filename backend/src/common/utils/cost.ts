import { Prisma } from '../../generated/prisma/client';
import { money, toDecimal, type DecimalLike } from './money';

/**
 * Costo promedio ponderado.
 *
 * Si tienes 10 unidades compradas a 3.000 y entran 10 a 4.000, el costo pasa a
 * 3.500: ni el viejo ni el nuevo, la mezcla. Es lo que evita que el margen del
 * lunes se dispare porque el proveedor subio el precio el martes.
 *
 * Cuando no queda nada en existencia (o el stock esta en negativo), el costo
 * nuevo es directamente el de la mercancia que entra: no hay nada que promediar.
 */
export function costoPromedioPonderado(
  stockActual: DecimalLike,
  costoActual: DecimalLike,
  cantidadEntrante: DecimalLike,
  costoEntrante: DecimalLike,
): Prisma.Decimal {
  const stock = toDecimal(stockActual);
  const entra = toDecimal(cantidadEntrante);

  if (entra.lessThanOrEqualTo(0)) {
    return money(costoActual);
  }

  const existente = stock.greaterThan(0) ? stock : new Prisma.Decimal(0);
  const total = existente.plus(entra);

  if (total.lessThanOrEqualTo(0)) {
    return money(costoEntrante);
  }

  const valorExistente = existente.times(toDecimal(costoActual));
  const valorEntrante = entra.times(toDecimal(costoEntrante));

  return money(valorExistente.plus(valorEntrante).dividedBy(total));
}

/**
 * El costo que le queda a un producto cuando se borra una compra.
 *
 * Si despues de esa compra no entro mas mercancia, lo exacto es volver al
 * costo que tenia justo antes (`costoAnterior`), aunque entre medias se haya
 * vendido algo: las ventas no cambian el costo promedio.
 *
 * Si si entro mas, ese costo viejo ya no vale porque no incluye lo que llego
 * despues. Entonces se saca del valor del inventario lo que aporto la compra
 * y se reparte entre lo que queda. Es lo mismo que habria dado el promedio si
 * esa compra nunca hubiera existido.
 *
 * Las compras registradas antes de guardar `costoAnterior` lo traen vacio y
 * usan siempre la segunda cuenta. Si no se puede (no queda nada o saldria un
 * costo de cero o negativo), el costo no se toca.
 */
export function costoSinLaCompra({
  stockActual,
  costoActual,
  cantidad,
  valorCompra,
  costoAnterior,
  entroMasDespues,
}: {
  stockActual: DecimalLike;
  costoActual: DecimalLike;
  /** Lo que entro con la compra que se borra. */
  cantidad: DecimalLike;
  /** Cantidad por costo de esa compra (la suma si el producto venia en varias lineas). */
  valorCompra: DecimalLike;
  costoAnterior: DecimalLike | null;
  entroMasDespues: boolean;
}): Prisma.Decimal {
  const anterior = costoAnterior === null ? null : money(costoAnterior);

  if (!entroMasDespues && anterior !== null) {
    return anterior;
  }

  const stock = toDecimal(stockActual);
  const quedan = stock.minus(toDecimal(cantidad));

  if (quedan.greaterThan(0)) {
    const valorQueQueda = stock
      .times(toDecimal(costoActual))
      .minus(toDecimal(valorCompra));

    if (valorQueQueda.greaterThan(0)) {
      return money(valorQueQueda.dividedBy(quedan));
    }
  }

  return anterior ?? money(costoActual);
}
