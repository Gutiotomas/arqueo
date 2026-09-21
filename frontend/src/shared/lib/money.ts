/**
 * Los importes llegan del API como texto ("1250000.00") para no perder
 * precision por el camino. Aqui se convierten y se formatean.
 */

/** El peso colombiano no usa centavos; el euro y el dolar si. */
const SIN_DECIMALES = ['COP', 'CLP', 'JPY', 'PYG', 'VND', 'KRW'];

export function decimals(currency: string): number {
  return SIN_DECIMALES.includes(currency) ? 0 : 2;
}

export function toNumber(value: string | number | null | undefined): number {
  const numero = Number(value ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

/** 1250000 -> "$ 1.250.000" */
export function formatMoney(
  value: string | number | null | undefined,
  currency = 'COP',
): string {
  const fraccion = decimals(currency);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: fraccion,
    maximumFractionDigits: fraccion,
  }).format(toNumber(value));
}

/** Version corta para los ejes de las graficas: 1250000 -> "$1,3M" */
export function formatMoneyShort(
  value: string | number | null | undefined,
  currency = 'COP',
): string {
  const numero = toNumber(value);
  const absoluto = Math.abs(numero);
  const signo = numero < 0 ? '-' : '';
  const simbolo = currency === 'COP' ? '$' : '';

  if (absoluto >= 1_000_000) {
    return `${signo}${simbolo}${redondear(absoluto / 1_000_000)}M`;
  }
  if (absoluto >= 1_000) {
    return `${signo}${simbolo}${redondear(absoluto / 1_000)}k`;
  }
  return `${signo}${simbolo}${Math.round(absoluto)}`;
}

function redondear(valor: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(valor);
}

/** Cantidades de inventario: 2.500 -> "2,5" */
export function formatQuantity(value: string | number | null | undefined): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(
    toNumber(value),
  );
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const signo = value > 0 ? '+' : '';
  return `${signo}${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)}%`;
}
