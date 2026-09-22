import { formatQuantity } from './money';

/**
 * Cómo se comporta el campo de cantidad según la unidad del producto.
 *
 * Las flechitas siempre suben y bajan de uno en uno (de 1 a 2, de 500 a 501).
 * Lo único que cambia con la unidad es si se puede escribir con decimales:
 * medio kilo sí, media lata no.
 *
 * Antes el paso de las unidades partibles era 0.001, y las flechitas subían
 * de 1 a 1,001: de ahí viene todo esto.
 */

/** Unidades que no se parten: no existe media lata, y el gramo ya es lo mínimo. */
const UNIDADES_ENTERAS = new Set([
  'u',
  'un',
  'ud',
  'uds',
  'und',
  'unidad',
  'unidades',
  'par',
  'pares',
  'caja',
  'cajas',
  'paq',
  'paquete',
  'paquetes',
  'bolsa',
  'bolsas',
  'botella',
  'botellas',
  'lata',
  'latas',
  'docena',
  'docenas',
  'g',
  'gr',
  'grs',
  'gramo',
  'gramos',
  'ml',
  'cc',
]);

/**
 * La unidad es el tamaño de un paquete cuando empieza por un número:
 * "5 uds" (paquete de cinco), "250 gr" (bolsa de 250 gramos).
 */
export function esPaquete(unidad: string | null | undefined): boolean {
  return /^\d/.test((unidad ?? '').trim());
}

export function esUnidadEntera(unidad: string | null | undefined): boolean {
  // Sin producto elegido se asume que se cuenta por unidades.
  if (!unidad) return true;
  const limpia = unidad.trim().toLowerCase().replace(/\.$/, '');
  // Los paquetes ("500 gr", "x6") se cuentan de uno en uno.
  if (esPaquete(limpia) || /^x\s*\d/.test(limpia)) return true;
  return UNIDADES_ENTERAS.has(limpia);
}

/**
 * Cantidad con su unidad, lista para leer. Con paquetes, pegar los dos números
 * no se entiende ("28 5 uds"), así que se separan: "28 × 5 uds".
 */
export function cantidadConUnidad(
  cantidad: string | number | null | undefined,
  unidad: string | null | undefined,
): string {
  const numero = formatQuantity(cantidad ?? 0);
  const texto = (unidad ?? '').trim();
  if (!texto) return numero;
  return esPaquete(texto) ? `${numero} × ${texto}` : `${numero} ${texto}`;
}

/** Paso y mínimo del input de cantidad según la unidad del producto. */
export function pasoCantidad(unidad: string | null | undefined): {
  step: number | 'any';
  min: number;
  inputMode: 'numeric' | 'decimal';
} {
  return esUnidadEntera(unidad)
    ? { step: 1, min: 1, inputMode: 'numeric' }
    : // Con "any" el navegador sube de uno en uno y acepta 0,75 escrito a mano.
      { step: 'any', min: 0.001, inputMode: 'decimal' };
}
