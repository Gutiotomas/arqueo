import { useEffect, useState } from 'react';

import { useAddPayments, type PaymentPayload } from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { Purchase } from '@/shared/api/types';
import { formatDate, today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, Textarea } from '@/shared/ui/field';
import { PartesDePago, partePago, sumaPartes, type PartePago } from '@/shared/ui/partes-de-pago';

export function PaymentDialog({
  open,
  onOpenChange,
  compra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compra: Purchase | null;
}) {
  const { currency } = useAuth();
  const abonar = useAddPayments();

  const [fecha, setFecha] = useState(today());
  // "200.000 en efectivo y 300.000 de la cuenta": el abono puede ir por partes.
  const [partes, setPartes] = useState<PartePago[]>([partePago()]);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saldo = toNumber(compra?.balance);

  // Cada vez que se abre el diálogo se empieza de cero, con la compra elegida.
  useEffect(() => {
    if (!open) return;
    setFecha(today());
    setPartes([partePago()]);
    setNotas('');
    setError(null);
  }, [open, compra?.id]);

  async function guardar() {
    setError(null);
    if (!compra) return;

    const cantidad = sumaPartes(partes);
    if (cantidad <= 0) {
      setError('Escribe cuánto vas a abonar');
      return;
    }
    if (cantidad > saldo) {
      setError(
        `El abono supera el saldo pendiente (${formatMoney(saldo, currency)})`,
      );
      return;
    }

    const pagos: PaymentPayload[] = partes
      .filter((parte) => Number(parte.amount || 0) > 0)
      .map((parte) => ({
        date: fecha,
        amount: Number(parte.amount),
        paymentMethod: parte.paymentMethod,
        ...(notas.trim() ? { notes: notas.trim() } : {}),
      }));

    try {
      await abonar.mutateAsync({ purchaseId: compra.id, pagos });
      onOpenChange(false);
    } catch (fallo) {
      // El API sabe el saldo exacto: su mensaje manda sobre el nuestro.
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo registrar el abono',
      );
    }
  }

  const restante = saldo - sumaPartes(partes);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Abonar a la compra"
      description="Paga una parte o todo lo que le debes al proveedor."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={abonar.isPending || !compra}>
            {abonar.isPending ? 'Guardando...' : 'Registrar abono'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">
            {compra?.supplier?.name ?? 'Sin proveedor'}
          </p>
          <p className="text-xs text-slate-500">
            Compra del {formatDate(compra?.date)}
            {compra?.invoiceNumber ? ` · Factura ${compra.invoiceNumber}` : ''}
          </p>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-600">Saldo pendiente</span>
            <span className="tabular text-xl font-bold text-slate-900">
              {formatMoney(saldo, currency)}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setPartes([partePago(saldo, partes[0]?.paymentMethod)])}
          >
            Pagar todo el saldo
          </Button>
        </div>

        <Field label="Fecha del abono" className="sm:max-w-xs">
          <Input
            type="date"
            value={fecha}
            max={today()}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Field>

        <Field
          label="Cuánto y con qué"
          hint="El efectivo sale de la caja de ese día; transferencia o tarjeta, de la cuenta."
        >
          <PartesDePago partes={partes} onChange={setPartes} currency={currency} maximo={saldo} />
        </Field>

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Recibo número, quién lo recibió..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm">
            {restante > 0 ? 'Seguirás debiendo' : 'Quedará pagada del todo'}
          </span>
          <span className="tabular text-xl font-bold">
            {formatMoney(Math.max(restante, 0), currency)}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
