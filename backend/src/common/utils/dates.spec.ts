import {
  addDays,
  daysBetween,
  endOfMonth,
  endOfWeek,
  formatBusinessDate,
  longDate,
  parseBusinessDate,
  previousRange,
  resolvePeriod,
  startOfMonth,
  startOfWeek,
  todayInTimezone,
} from './dates';

describe('fechas de negocio', () => {
  it('interpreta las fechas en UTC, sin corrimientos de huso', () => {
    const fecha = parseBusinessDate('2026-09-19');
    expect(fecha.toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(formatBusinessDate(fecha)).toBe('2026-09-19');
  });

  it('rechaza formatos que no sean YYYY-MM-DD', () => {
    expect(() => parseBusinessDate('19/09/2026')).toThrow(/Fecha inválida/);
    expect(() => parseBusinessDate('2026-13-45')).toThrow(/Fecha inválida/);
  });

  it('la semana va de lunes a domingo', () => {
    // 2026-09-19 es sabado.
    expect(startOfWeek('2026-09-19')).toBe('2026-09-14');
    expect(endOfWeek('2026-09-19')).toBe('2026-09-20');
    // Un domingo pertenece a la semana que empezo el lunes anterior.
    expect(startOfWeek('2026-09-20')).toBe('2026-09-14');
    expect(endOfWeek('2026-09-20')).toBe('2026-09-20');
  });

  it('calcula el mes natural, tambien en febrero bisiesto', () => {
    expect(startOfMonth('2026-09-19')).toBe('2026-09-01');
    expect(endOfMonth('2026-09-19')).toBe('2026-09-30');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('cuenta los dias incluyendo ambos extremos', () => {
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(30);
  });

  it('el periodo anterior tiene el mismo tamano y termina justo antes', () => {
    expect(previousRange('2026-09-01', '2026-09-30')).toEqual({
      from: '2026-08-02',
      to: '2026-08-31',
    });
    expect(previousRange('2026-09-19', '2026-09-19')).toEqual({
      from: '2026-09-18',
      to: '2026-09-18',
    });
  });

  it('suma y resta dias cruzando el cambio de mes y de ano', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('resuelve los periodos del informe', () => {
    expect(resolvePeriod('day', '2026-09-19')).toEqual({
      from: '2026-09-19',
      to: '2026-09-19',
      label: '19 de septiembre de 2026',
    });
    expect(resolvePeriod('week', '2026-09-19')).toMatchObject({
      from: '2026-09-14',
      to: '2026-09-20',
    });
    expect(resolvePeriod('month', '2026-09-19')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      label: 'Septiembre de 2026',
    });
  });

  it('escribe la fecha en castellano', () => {
    expect(longDate('2026-01-01')).toBe('1 de enero de 2026');
  });

  it('da el dia de hoy en la zona horaria del negocio', () => {
    const hoy = todayInTimezone('America/Bogota');
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
