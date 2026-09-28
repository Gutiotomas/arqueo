import { useState } from 'react';
import { Link } from 'react-router';

import { useCreateDistribution, usePartners } from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import { PAYMENT_METHODS, type PaymentMethod } from '@/shared/api/types';
import { today } from '@/shared/lib/dates';
import { formatMoney, roundMoney, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/shared/ui/field';

interface Parte {
  partnerId: string;
  name: string;
  percent: number;
  amount: number | '';
  paymentMethod: PaymentMethod;
}

/**
 * Repartir ganancias. Se escribe el total y se propone lo de cada socia según
 * su porcentaje; cada parte se puede ajustar y decir cómo se le pagó.
 */
export function DistributionDialog({
  open,
  onOpenChange,
  sugerido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo que el periodo dejó en el negocio, como referencia. */
  sugerido?: number;
}) {
  const { currency } = useAuth();
  const socias = usePartners();
  const crear = useCreateDistribution();

  const [fecha, setFecha] = useState(today());
  const [total, setTotal] = useState<number | ''>('');
  const [notas, setNotas] = useState('');
  const [partes, setPartes] = useState<Parte[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activas = (socias.data ?? []).filter((socia) => socia.isActive);
  // Hasta que se toca el total, las partes salen de las socias activas.
  const filas: Parte[] =
    partes ??
    activas.map((socia) => ({
      partnerId: socia.id,
      name: socia.name,
      percent: toNumber(socia.sharePercent),
      amount: '',
      paymentMethod: 'CASH',
    }));

  function cerrar() {
    setFecha(today());
    setTotal('');
    setNotas('');
    setPartes(null);
    setError(null);
    onOpenChange(false);
  }

  /** Reparte el total según el porcentaje de cada una. */
  function repartir(valor: number | '') {
    setTotal(valor);
    setPartes(
      filas.map((fila) => ({
        ...fila,
        amount: valor === '' ? '' : roundMoney((Number(valor) * fila.percent) / 100),
      })),
    );
  }

  function cambiar(partnerId: string, cambios: Partial<Parte>) {
    setPartes(filas.map((fila) => (fila.partnerId === partnerId ? { ...fila, ...cambios } : fila)));
  }

  const suma = filas.reduce((acc, fila) => acc + Number(fila.amount || 0), 0);

  async function guardar() {
    setError(null);
    const items = filas
      .filter((fila) => Number(fila.amount || 0) > 0)
      .map((fila) => ({
        partnerId: fila.partnerId,
        amount: roundMoney(Number(fila.amount)),
        paymentMethod: fila.paymentMethod,
      }));
    if (!items.length) {
      setError('Escribe cuánto se lleva al menos una socia');
      return;
    }
    try {
      await crear.mutateAsync({ date: fecha, items, ...(notas.trim() ? { notes: notas.trim() } : {}) });
      cerrar();
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar el reparto');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => !abierto && cerrar()}
      title="Repartir ganancias"
      description="No es un gasto: la utilidad no cambia. Lo que se paga en efectivo sale de la caja y lo que se transfiere, de la cuenta."
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={crear.isPending || !activas.length}>
            {crear.isPending ? 'Guardando...' : 'Guardar reparto'}
          </Button>
        </>
      }
    >
      {!socias.isLoading && !activas.length ? (
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900">
          Primero registra las socias y su porcentaje en{' '}
          <Link to="/ajustes" className="font-medium underline" onClick={cerrar}>
            Ajustes
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Total a repartir"
              hint={
                sugerido !== undefined && sugerido > 0
                  ? `En el periodo quedaron ${formatMoney(sugerido, currency)} en el negocio.`
                  : undefined
              }
            >
              <MoneyInput aria-label="Total a repartir" value={total} onValueChange={repartir} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} max={today()} onChange={(e) => setFecha(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-700">A cada una</span>
            {filas.map((fila) => (
              <div
                key={fila.partnerId}
                className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_10rem_10rem]"
              >
                <p className="col-span-2 text-sm font-medium text-slate-900 sm:col-span-1 sm:self-center">
                  {fila.name}
                  <span className="ml-1 text-xs font-normal text-slate-500">({fila.percent} %)</span>
                </p>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-500">Se lleva</span>
                  <MoneyInput
                    aria-label={`Lo que se lleva ${fila.name}`}
                    value={fila.amount}
                    onValueChange={(valor) => cambiar(fila.partnerId, { amount: valor })}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-500">Cómo se le pagó</span>
                  <Select
                    aria-label={`Cómo se le pagó a ${fila.name}`}
                    value={fila.paymentMethod}
                    onChange={(e) => cambiar(fila.partnerId, { paymentMethod: e.target.value as PaymentMethod })}
                  >
                    {PAYMENT_METHODS.map((metodo) => (
                      <option key={metodo.value} value={metodo.value}>
                        {metodo.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              "Otro" no toca ni la caja ni la cuenta: úsalo si ese dinero salió de otro lado.
            </p>
          </div>

          <Field label="Notas (opcional)">
            <Input
              maxLength={300}
              placeholder="Ganancias de septiembre..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </Field>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
            <span className="text-sm">Se reparten</span>
            <span className="tabular text-xl font-bold">{formatMoney(suma, currency)}</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}
