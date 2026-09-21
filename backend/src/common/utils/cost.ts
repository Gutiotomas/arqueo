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
