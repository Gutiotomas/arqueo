import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { formatMoney } from '@/shared/lib/money';

/*
 * Piezas comunes del cierre de caja y del cierre de cuenta: las dos pantallas
 * cuadran igual (esperado frente a real) aunque el dinero sea distinto.
 */

/** Lo mismo para la caja que para la cuenta: solo cambian las palabras. */
export function Descuadre({
  valor,
  currency,
  que = 'La caja',
  pie = 'Contado menos esperado',
}: {
  valor: number;
  currency: string;
  que?: string;
  pie?: string;
}) {
  const cuadra = Math.abs(valor) < 0.005;
  const falta = valor < 0;

  const estilo = cuadra
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : falta
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div className={cn('rounded-xl border px-4 py-4 text-center', estilo)}>
      <p className="text-sm font-medium">
        {cuadra ? `${que} cuadra` : falta ? 'Falta dinero' : 'Sobra dinero'}
      </p>
      <p className="tabular mt-1 text-2xl font-bold wrap-break-word sm:text-3xl">
        {formatMoney(valor, currency)}
      </p>
      <p className="mt-1 text-xs opacity-80">{pie}</p>
    </div>
  );
}

export function LineaDesglose({
  icono,
  tono,
  etiqueta,
  detalle,
  valor,
}: {
  icono: ReactNode;
  tono: 'neutral' | 'verde' | 'naranja';
  etiqueta: string;
  detalle: string;
  valor: string;
}) {
  const tonos = {
    neutral: 'bg-slate-100 text-slate-600',
    verde: 'bg-emerald-50 text-emerald-600',
    naranja: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            tonos[tono],
          )}
        >
          {icono}
        </span>
        <span className="min-w-0">
          {/* En el celular el texto baja de línea en vez de cortarse. */}
          <span className="block text-sm font-medium text-slate-700">{etiqueta}</span>
          <span className="block text-xs text-slate-500">{detalle}</span>
        </span>
      </div>
      <span className="tabular shrink-0 text-sm font-semibold text-slate-900">
        {valor}
      </span>
    </div>
  );
}
