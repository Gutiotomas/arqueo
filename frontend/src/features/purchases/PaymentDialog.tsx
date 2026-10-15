import { useEffect, useState } from 'react';

import { useAddPayments, type PaymentPayload } from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { Purchase } from '@/shared/api/types';
import { formatDate, today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Textarea } from '@/shared/ui/field';
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
  const [descuento, setDescuento] = useState<number | ''>('');
  const [motivoDescuento, setMotivoDescuento] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saldo = toNumber(compra?.balance);

  // Cada vez que se abre el diálogo se empieza de cero, con la compra elegida.
  useEffect(() => {
    if (!open) return;
    setFecha(today());
    setPartes([partePago()]);
    setDescuento('');
    setMotivoDescuento('');
    setNotas('');
    setError(null);
  }, [open, compra?.id]);

  async function guardar() {
    setError(null);
    if (!compra) return;

    const nuevoDescuento = Number(descuento || 0);
    const cantidad = sumaPartes(partes);
    if (nuevoDescuento <= 0 && cantidad <= 0) {
      setError('Escribe cuánto vas a abonar o el descuento que te dio el proveedor');
      return;
    }
    if (nuevoDescuento > saldo) {
      setError(`El descuento supera el saldo pendiente (${formatMoney(saldo, currency)})`);
      return;
    }
    if (cantidad > saldo - nuevoDescuento) {
      setError(
        `El abono supera el saldo después del descuento (${formatMoney(saldo - nuevoDescuento, currency)})`,
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
      await abonar.mutateAsync({
        purchaseId: compra.id,
        pagos,
        ...(nuevoDescuento > 0
          ? {
              discount: nuevoDescuento,
              ...(motivoDescuento.trim()
                ? { discountReason: motivoDescuento.trim() }
                : {}),
            }
          : {}),
      });
      onOpenChange(false);
    } catch (fallo) {
      // El API sabe el saldo exacto: su mensaje manda sobre el nuestro.
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo registrar el abono',
      );
    }
  }

  const saldoConDescuento = saldo - Number(descuento || 0);
  const restante = saldoConDescuento - sumaPartes(partes);
  const puedeGuardar = Number(descuento || 0) > 0 || sumaPartes(partes) > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Abonar a la compra"
      description="Registra un abono, un descuento del proveedor o ambos."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={abonar.isPending || !compra || !puedeGuardar}>
            {abonar.isPending ? 'Guardando...' : 'Guardar'}
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
          {Number(descuento || 0) > 0 && (
            <div className="mt-1 flex items-baseline justify-between gap-3 text-sm text-emerald-700">
              <span>Descuento nuevo</span>
              <span className="tabular font-semibold">
                − {formatMoney(descuento, currency)}
              </span>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-1">
            <span className="text-sm text-slate-600">Saldo tras el descuento</span>
            <span className="tabular text-sm font-semibold text-slate-900">
              {formatMoney(Math.max(saldoConDescuento, 0), currency)}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={() =>
              setPartes([partePago(Math.max(saldoConDescuento, 0), partes[0]?.paymentMethod)])
            }
          >
            Pagar todo el saldo restante
          </Button>
        </div>

        <Field label="Descuento nuevo (opcional)" hint="Lo que el proveedor te rebaja por el producto defectuoso.">
          <MoneyInput
            aria-label="Descuento nuevo del proveedor"
            value={descuento}
            onValueChange={setDescuento}
            placeholder="0"
          />
        </Field>

        {Number(descuento || 0) > 0 && (
          <Field label="Motivo del descuento (opcional)">
            <Input
              maxLength={200}
              value={motivoDescuento}
              onChange={(e) => setMotivoDescuento(e.target.value)}
              placeholder="Producto defectuoso"
            />
          </Field>
        )}

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
          <PartesDePago
            partes={partes}
            onChange={setPartes}
            currency={currency}
            maximo={Math.max(saldoConDescuento, 0)}
          />
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
