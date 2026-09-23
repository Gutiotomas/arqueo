import { useEffect, useState } from 'react';

import { useAddCustomerPayment, type CustomerPaymentPayload } from '@/features/sales/api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import { PAYMENT_METHODS, type PaymentMethod } from '@/shared/api/types';
import { today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

/** Cobrar una parte o todo de lo que debe un cliente. */
export function CollectDialog({
  open,
  onOpenChange,
  cliente,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: { id: string; name: string; balance: string } | null;
}) {
  const { currency } = useAuth();
  const cobrar = useAddCustomerPayment();

  const [fecha, setFecha] = useState(today());
  const [importe, setImporte] = useState<number | ''>('');
  const [formaDePago, setFormaDePago] = useState<PaymentMethod>('CASH');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saldo = toNumber(cliente?.balance);

  useEffect(() => {
    if (!open) return;
    setFecha(today());
    setImporte('');
    setFormaDePago('CASH');
    setNotas('');
    setError(null);
  }, [open, cliente?.id]);

  async function guardar() {
    setError(null);
    if (!cliente) return;

    const cantidad = Number(importe || 0);
    if (cantidad <= 0) {
      setError('Escribe cuánto te pagó');
      return;
    }
    if (cantidad > saldo) {
      setError(`El cobro supera lo que debe (${formatMoney(saldo, currency)})`);
      return;
    }

    const datos: CustomerPaymentPayload = {
      date: fecha,
      amount: cantidad,
      paymentMethod: formaDePago,
      ...(notas.trim() ? { notes: notas.trim() } : {}),
    };

    try {
      await cobrar.mutateAsync({ customerId: cliente.id, datos });
      onOpenChange(false);
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo registrar el cobro');
    }
  }

  const restante = saldo - Number(importe || 0);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cobrar"
      description="Lo que el cliente paga hoy de lo que debe."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={cobrar.isPending || !cliente}>
            {cobrar.isPending ? 'Guardando...' : 'Registrar cobro'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">{cliente?.name}</p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-600">Debe</span>
            <span className="tabular text-xl font-bold text-slate-900">
              {formatMoney(saldo, currency)}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setImporte(saldo)}
          >
            Paga todo
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cuánto paga">
            <MoneyInput aria-label="Importe del cobro" value={importe} onValueChange={setImporte} />
          </Field>
          <Field label="Fecha del cobro">
            <Input
              type="date"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Con qué paga"
          hint="En efectivo entra a la caja de ese día; por transferencia o tarjeta, a la cuenta."
        >
          <Select
            value={formaDePago}
            onChange={(e) => setFormaDePago(e.target.value as PaymentMethod)}
            aria-label="Forma de pago del cobro"
          >
            {PAYMENT_METHODS.map((metodo) => (
              <option key={metodo.value} value={metodo.value}>
                {metodo.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={300}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Pagó la mamá, quedó de traer el resto el viernes..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm">{restante > 0 ? 'Seguirá debiendo' : 'Quedará al día'}</span>
          <span className="tabular text-xl font-bold">
            {formatMoney(Math.max(restante, 0), currency)}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
