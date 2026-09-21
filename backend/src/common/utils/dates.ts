/**
 * Fechas de negocio.
 *
 * Ventas, gastos y cierres pertenecen a un DIA, no a un instante: en la BD son
 * columnas DATE y aqui las tratamos siempre como 'YYYY-MM-DD' interpretado en
 * UTC. Asi una venta del 3 de marzo sigue siendo del 3 de marzo mire quien la
 * mire, sin sorpresas por husos horarios.
 */

export type IsoDate = string; // 'YYYY-MM-DD'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' -> Date (medianoche UTC), que es lo que espera Prisma. */
export function parseBusinessDate(value: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Fecha inválida: "${value}". Se espera YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida: "${value}".`);
  }
  return date;
}

/** Date -> 'YYYY-MM-DD' (leyendo siempre en UTC). */
export function formatBusinessDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** El dia de hoy segun la zona horaria del negocio (p. ej. America/Bogota). */
export function todayInTimezone(timezone: string): IsoDate {
  // 'en-CA' formatea como YYYY-MM-DD, que es justo lo que queremos.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const result = parseBusinessDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return formatBusinessDate(result);
}

/** Lunes de la semana que contiene `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const d = parseBusinessDate(date);
  const day = d.getUTCDay(); // 0 domingo ... 6 sabado
  const diff = day === 0 ? -6 : 1 - day; // semana de lunes a domingo
  return addDays(date, diff);
}

export function endOfWeek(date: IsoDate): IsoDate {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
  const d = parseBusinessDate(date);
  // Dia 0 del mes siguiente = ultimo dia de este mes.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return formatBusinessDate(last);
}

/** Numero de dias del rango, ambos extremos incluidos. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = parseBusinessDate(to).getTime() - parseBusinessDate(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Rango inmediatamente anterior y del mismo tamano, para comparar "este mes
 * contra el anterior" en el dashboard.
 */
export function previousRange(
  from: IsoDate,
  to: IsoDate,
): { from: IsoDate; to: IsoDate } {
  const length = daysBetween(from, to);
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

export type PeriodType = 'day' | 'week' | 'month';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-09-19' -> '19 de septiembre de 2026' */
export function longDate(date: IsoDate): string {
  const [year, month, day] = date.split('-');
  return `${Number(day)} de ${MESES[Number(month) - 1]} de ${year}`;
}

/** Convierte (periodo, fecha) en el rango de dias que cubre. */
export function resolvePeriod(
  period: PeriodType,
  date: IsoDate,
): { from: IsoDate; to: IsoDate; label: string } {
  switch (period) {
    case 'day':
      return { from: date, to: date, label: longDate(date) };
    case 'week': {
      const from = startOfWeek(date);
      const to = endOfWeek(date);
      return { from, to, label: `Semana del ${longDate(from)} al ${longDate(to)}` };
    }
    case 'month': {
      const from = startOfMonth(date);
      const to = endOfMonth(date);
      const [year, month] = date.split('-');
      return { from, to, label: `${capitalizar(MESES[Number(month) - 1]!)} de ${year}` };
    }
  }
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
