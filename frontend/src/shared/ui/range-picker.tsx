import { cn } from '@/shared/lib/cn';
import {
  addDays,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  today,
  type IsoDate,
} from '@/shared/lib/dates';
import { Input } from './field';

/** Se declara como `type` y no `interface` para poder pasarlo como query. */
export type Rango = {
  from: IsoDate;
  to: IsoDate;
};

const ATAJOS: { label: string; rango: () => Rango }[] = [
  { label: 'Hoy', rango: () => ({ from: today(), to: today() }) },
  { label: '7 días', rango: () => ({ from: addDays(today(), -6), to: today() }) },
  { label: 'Esta semana', rango: () => ({ from: startOfWeek(), to: today() }) },
  { label: 'Este mes', rango: () => ({ from: startOfMonth(), to: today() }) },
  {
    label: 'Mes pasado',
    rango: () => {
      const primeroDeEste = startOfMonth();
      const finAnterior = addDays(primeroDeEste, -1);
      return { from: startOfMonth(finAnterior), to: endOfMonth(finAnterior) };
    },
  },
];

/** Atajos habituales + dos fechas sueltas para cualquier otro rango. */
export function RangePicker({
  value,
  onChange,
  className,
}: {
  value: Rango;
  onChange: (rango: Rango) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex flex-wrap gap-1">
        {ATAJOS.map((atajo) => {
          const rango = atajo.rango();
          const activo = rango.from === value.from && rango.to === value.to;
          return (
            <button
              key={atajo.label}
              type="button"
              onClick={() => onChange(rango)}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:px-2.5 sm:py-1.5',
                activo
                  ? 'bg-marca-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {atajo.label}
            </button>
          );
        })}
      </div>

      <div className="flex w-full items-center gap-1.5 sm:w-auto">
        <Input
          type="date"
          value={value.from}
          max={value.to}
          aria-label="Desde"
          className="h-10 w-full py-0 text-sm sm:h-8 sm:w-auto sm:text-xs"
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
        <span className="text-xs text-slate-400">a</span>
        <Input
          type="date"
          value={value.to}
          min={value.from}
          aria-label="Hasta"
          className="h-10 w-full py-0 text-sm sm:h-8 sm:w-auto sm:text-xs"
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
    </div>
  );
}
