import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

import { cn } from '@/shared/lib/cn';

const controlBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus:border-marca-500 focus:outline-2 focus:outline-offset-0 focus:outline-marca-500/30 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-400';

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)}
    >
      {children}
    </label>
  );
}

/** Etiqueta + control + mensaje de error, que es el patron de todo formulario. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, 'h-10', className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlBase, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, 'py-2', className)} {...props} />;
}

/**
 * Campo de importe: el negocio teclea numeros redondos, asi que se muestra
 * con separadores de miles y se guarda como numero.
 */
export function MoneyInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | '';
  onValueChange: (value: number | '') => void;
}) {
  const id = useId();
  const texto =
    value === '' ? '' : new Intl.NumberFormat('es-CO').format(Number(value));

  return (
    <input
      {...props}
      id={props.id ?? id}
      inputMode="numeric"
      className={cn(controlBase, 'h-10 tabular text-right', className)}
      value={texto}
      onChange={(evento) => {
        const limpio = evento.target.value.replace(/[^\d]/g, '');
        onValueChange(limpio === '' ? '' : Number(limpio));
      }}
    />
  );
}
