/** Fechas de negocio: siempre 'YYYY-MM-DD', siempre leidas en UTC. */

export type IsoDate = string;

export function today(): IsoDate {
  return new Date().toLocaleDateString('en-CA'); // en-CA formatea YYYY-MM-DD
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(date: IsoDate = today()): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate = today()): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

/** Lunes de la semana de `date`. */
export function startOfWeek(date: IsoDate = today()): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`);
  const dia = d.getUTCDay();
  return addDays(date, dia === 0 ? -6 : 1 - dia);
}

/** '2026-09-19' -> '19/09/2026' */
export function formatDate(date: IsoDate | null | undefined): string {
  if (!date) return '';
  const [year, month, day] = date.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Para los ejes de las graficas: '19/09' */
export function formatDayMonth(date: IsoDate): string {
  const [, month, day] = date.slice(0, 10).split('-');
  return `${day}/${month}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatLongDate(date: IsoDate): string {
  const [year, month, day] = date.slice(0, 10).split('-');
  return `${Number(day)} de ${MESES[Number(month) - 1]} de ${year}`;
}

export function monthName(date: IsoDate): string {
  const mes = MESES[Number(date.slice(5, 7)) - 1] ?? '';
  return mes.charAt(0).toUpperCase() + mes.slice(1);
}
