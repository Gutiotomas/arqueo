/** Formato de importes y fechas para informes (mismo criterio que el frontend). */

/** El peso colombiano no usa centavos; el euro y el dolar si. */
export function currencyDecimals(currency: string): number {
  return ['COP', 'CLP', 'JPY', 'PYG', 'VND', 'KRW'].includes(currency) ? 0 : 2;
}

export function formatMoney(value: string | number, currency: string): string {
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value));
}

/** '2026-09-19' -> '19/09/2026' */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Quita ceros sobrantes: '2.500' -> '2,5' */
export function formatQuantity(value: string | number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(
    Number(value),
  );
}

/** Formato de numero para las celdas de Excel segun la moneda. */
export function excelNumberFormat(currency: string): string {
  return currencyDecimals(currency) === 0 ? '#,##0' : '#,##0.00';
}

/**
 * Momento de generacion del informe, contado en la zona horaria del negocio.
 *
 * Con `toISOString()` a las 7 de la tarde en Bogota ya es el dia siguiente en
 * UTC, y el informe salia fechado manana.
 */
export function formatDateTimeInTimezone(iso: string, timezone: string): string {
  const fecha = new Date(iso);

  const dia = new Intl.DateTimeFormat('es-CO', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha);

  const hora = new Intl.DateTimeFormat('es-CO', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);

  return `${dia} a las ${hora}`;
}

/** La fecha del negocio (sin hora) en su propia zona horaria: 'DD-MM-AAAA'. */
export function fileDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}
