import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * En el celular una tabla obliga a arrastrar de lado para ver los importes,
 * que es justo lo que el dueño del negocio quiere mirar. Por eso las listas
 * se pintan como tarjetas en pantalla pequeña y como tabla a partir de `md`.
 *
 *   <MobileList>        (solo en movil)
 *   <TableWrapper>      (solo en pantalla grande)
 */

export function MobileList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn('divide-y divide-slate-100 md:hidden', className)}>
      {children}
    </ul>
  );
}

export function MobileCard({
  title,
  subtitle,
  amount,
  amountTone = 'neutral',
  badge,
  details,
  actions,
  onClick,
}: {
  /** Lo primero que se lee: fecha, nombre del producto, descripcion. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** El numero grande de la derecha. */
  amount?: ReactNode;
  amountTone?: 'neutral' | 'positive' | 'negative';
  badge?: ReactNode;
  /** Pares etiqueta/valor que se muestran debajo. */
  details?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  onClick?: () => void;
}) {
  const tonos = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-700',
    negative: 'text-red-700',
  };

  return (
    <li className="px-4 py-3.5">
      <div
        className={cn('flex items-start gap-3', onClick && 'cursor-pointer')}
        onClick={onClick}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-slate-900">{title}</span>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          )}
        </div>

        {amount !== undefined && (
          <span className={cn('tabular shrink-0 text-base font-semibold', tonos[amountTone])}>
            {amount}
          </span>
        )}
      </div>

      {details && details.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {details.map((detalle) => (
            <div key={detalle.label} className="flex justify-between gap-2 text-sm">
              <dt className="text-slate-500">{detalle.label}</dt>
              <dd className="tabular text-slate-700">{detalle.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {actions && (
        <div className="mt-2.5 flex justify-end gap-1">{actions}</div>
      )}
    </li>
  );
}

/** Envuelve la tabla para que solo aparezca en pantallas medianas o mayores. */
export function TableWrapper({ children }: { children: ReactNode }) {
  return <div className="hidden md:block">{children}</div>;
}
