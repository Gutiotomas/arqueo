/** Ayudas de texto y color comunes a la caja y a la cuenta. */

/** Verde si cuadra, rojo si falta dinero y ámbar si sobra. */
export function colorDescuadre(valor: number): string {
  if (Math.abs(valor) < 0.005) return 'text-emerald-600';
  return valor < 0 ? 'text-red-600' : 'text-amber-600';
}

export function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
