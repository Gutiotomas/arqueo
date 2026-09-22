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

export function esUnidadEntera(unidad: string | null | undefined): boolean {
  // Sin producto elegido se asume que se cuenta por unidades.
  if (!unidad) return true;
  const limpia = unidad.trim().toLowerCase().replace(/\.$/, '');
  // "500 gr" o "x6" es el tamaño de un paquete, y los paquetes se cuentan.
  if (/^(\d|x\s*\d)/.test(limpia)) return true;
  return UNIDADES_ENTERAS.has(limpia);
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
