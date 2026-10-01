import { Split, Trash2 } from 'lucide-react';

import { PAYMENT_METHODS, type PaymentMethod } from '@/shared/api/types';
import { formatMoney } from '@/shared/lib/money';
import { AddRowButton } from '@/shared/ui/add-row-button';
import { Button } from '@/shared/ui/button';
import { MoneyInput, Select } from '@/shared/ui/field';

/** Una parte de un pago: cuánto y con qué. */
export interface PartePago {
  key: string;
  amount: number | '';
  paymentMethod: PaymentMethod;
}

export function partePago(amount: number | '' = '', paymentMethod: PaymentMethod = 'CASH'): PartePago {
  return { key: crypto.randomUUID(), amount, paymentMethod };
}

export const sumaPartes = (partes: PartePago[]) =>
  partes.reduce((suma, parte) => suma + Number(parte.amount || 0), 0);

/**
 * Un pago repartido entre formas de pago: "200.000 en efectivo y 300.000 de
 * la cuenta". Lo normal es una sola parte; "Dividir" añade otra.
 */
export function PartesDePago({
  partes,
  onChange,
  currency,
  maximo,
}: {
  partes: PartePago[];
  onChange: (partes: PartePago[]) => void;
  currency: string;
  /** Lo que se puede pagar como mucho, para avisar si se pasa. */
  maximo?: number;
}) {
  const suma = sumaPartes(partes);
  const cambiar = (key: string, cambios: Partial<PartePago>) =>
    onChange(partes.map((parte) => (parte.key === key ? { ...parte, ...cambios } : parte)));

  return (
    <div className="space-y-2">
      {partes.map((parte) => (
        <div key={parte.key} className="flex items-center gap-2">
          <MoneyInput
            aria-label="Valor de la parte"
            className="min-w-0 flex-1"
            value={parte.amount}
            onValueChange={(valor) => cambiar(parte.key, { amount: valor })}
          />
          <span className="text-xs text-slate-500">en</span>
          <Select
            className="w-auto"
            aria-label="Forma de pago de la parte"
            value={parte.paymentMethod}
            onChange={(e) => cambiar(parte.key, { paymentMethod: e.target.value as PaymentMethod })}
          >
            {PAYMENT_METHODS.map((metodo) => (
              <option key={metodo.value} value={metodo.value}>
                {metodo.label}
              </option>
            ))}
          </Select>
          {partes.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Quitar parte"
              className="text-slate-400"
              onClick={() => onChange(partes.filter((otra) => otra.key !== parte.key))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {/* Un botón de verdad, no un enlace pequeño: si no se ve, no se usa. */}
      <AddRowButton
        secundario
        icon={<Split className="h-4 w-4" />}
        onClick={() => onChange([...partes, partePago()])}
      >
        {partes.length > 1 ? 'Añadir otra parte' : 'Pagué una parte de otra forma'}
      </AddRowButton>
      {partes.length > 1 && (
        <p className="text-right text-xs text-slate-500">
          Entre todas: <span className="tabular font-medium text-slate-900">{formatMoney(suma, currency)}</span>
          {maximo !== undefined && suma > maximo + 0.005 && (
            <span className="text-red-600"> · se pasa de {formatMoney(maximo, currency)}</span>
          )}
        </p>
      )}
    </div>
  );
}
