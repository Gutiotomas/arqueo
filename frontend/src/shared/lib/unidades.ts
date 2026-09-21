/**
 * El input de cantidad tenía siempre `step="0.001"`, así que las flechitas
 * subían de 1 a 1,001 en productos que se venden de uno en uno. El paso
 * depende de la unidad del producto.
 */

/** Unidades que no se parten: no existe media lata ni un cuarto de caja. */
const UNIDADES_ENTERAS = ['ud', 'und', 'unidad', 'par', 'caja', 'paq'];

export function esUnidadEntera(unidad: string | null | undefined): boolean {
  // Sin producto elegido se asume que se cuenta por unidades.
  if (!unidad) return true;
  return UNIDADES_ENTERAS.includes(unidad.trim().toLowerCase());
}

/** Paso y mínimo del input de cantidad según la unidad del producto. */
export function pasoCantidad(unidad: string | null | undefined): {
  step: number;
  min: number;
  inputMode: 'numeric' | 'decimal';
} {
  return esUnidadEntera(unidad)
    ? { step: 1, min: 1, inputMode: 'numeric' }
    : { step: 0.001, min: 0.001, inputMode: 'decimal' };
}
