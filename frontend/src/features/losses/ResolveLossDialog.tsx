import { ArrowRight } from 'lucide-react';
import { useState } from 'react';

import {
  calcularPerdida,
  useResolveLoss,
  type ResolveLossPayload,
} from './api';
import { RespuestaDelProveedor } from './LossFormDialog';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import {
  LOSS_REASON_LABELS,
  type LossResolution,
  type PaymentMethod,
  type StockLoss,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate, today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { cantidadConUnidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, Textarea } from '@/shared/ui/field';

/**
 * LossesPage lo monta solo con un caso elegido, así que el formulario arranca
 * con lo que ya hay guardado: sirve tanto para anotar como para corregir.
 */
export function ResolveLossDialog({
  open,
  onOpenChange,
  perdida,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perdida: StockLoss;
}) {
  const { currency } = useAuth();
  const resolver = useResolveLoss();

  const costoGuardado = toNumber(perdida.replacementUnitCost);
  const [respuesta, setRespuesta] = useState<LossResolution>(perdida.resolution);
  const [costoReposicion, setCostoReposicion] = useState<number | ''>(
    costoGuardado > 0 ? costoGuardado : '',
  );
  const [formaDePago, setFormaDePago] = useState<PaymentMethod>(
    perdida.paymentMethod ?? 'CASH',
  );
  const [fechaRespuesta, setFechaRespuesta] = useState(
    perdida.resolvedAt?.slice(0, 10) ?? today(),
  );
  const [notas, setNotas] = useState(perdida.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const unidades = toNumber(perdida.quantity);
  const costoUnitario = toNumber(perdida.unitCost);
  const perdidaActual = toNumber(perdida.lossAmount);
  const perdidaNueva = calcularPerdida(
    respuesta,
    unidades,
    costoUnitario,
    Number(costoReposicion || 0),
  );
  const cambia = Math.abs(perdidaNueva - perdidaActual) >= 0.005;

  async function guardar() {
    setError(null);

    if (respuesta === 'DISCOUNTED' && Number(costoReposicion || 0) <= 0) {
      setError('Si el proveedor cobra por la reposición, escribe cuánto cobra por unidad');
      return;
    }

    const datos: ResolveLossPayload = {
      resolution: respuesta,
      ...(respuesta === 'DISCOUNTED'
        ? {
            replacementUnitCost: Number(costoReposicion || 0),
            paymentMethod: formaDePago,
          }
        : {}),
      ...(respuesta === 'PENDING' ? {} : { resolvedAt: fechaRespuesta }),
      notes: notas.trim(),
    };

    try {
      await resolver.mutateAsync({ id: perdida.id, datos });
      onOpenChange(false);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError
          ? fallo.detalle
          : 'No se pudo guardar la respuesta del proveedor',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Anotar respuesta del proveedor"
      description="Según lo que haga el proveedor, cambia lo que pierdes con esta mercancía."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={resolver.isPending}>
            {resolver.isPending ? 'Guardando...' : 'Guardar respuesta'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Recordatorio del caso: han podido pasar semanas desde que se anotó. */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">{perdida.product.name}</p>
          <p className="text-xs text-slate-500">
            {cantidadConUnidad(perdida.quantity, perdida.product.unit)} ·{' '}
            {LOSS_REASON_LABELS[perdida.reason]} · {formatDate(perdida.date)}
            {perdida.supplier ? ` · ${perdida.supplier.name}` : ''}
          </p>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-600">Te costó esa mercancía</span>
            <span className="tabular text-lg font-bold text-slate-900">
              {formatMoney(unidades * costoUnitario, currency)}
            </span>
          </div>
          {perdida.notes && (
            <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
              {perdida.notes}
            </p>
          )}
        </div>

        <RespuestaDelProveedor
          titulo="¿Qué contestó el proveedor?"
          descripcion="Si aún no contesta, déjalo en «Aún no sé»: se sigue contando como pérdida total."
          valor={respuesta}
          onValorChange={setRespuesta}
          costoReposicion={costoReposicion}
          onCostoReposicionChange={setCostoReposicion}
          formaDePago={formaDePago}
          onFormaDePagoChange={setFormaDePago}
        />

        {respuesta !== 'PENDING' && (
          <Field
            label="Fecha de la respuesta"
            hint="El día en que el proveedor te dijo qué iba a hacer."
          >
            <Input
              type="date"
              value={fechaRespuesta}
              max={today()}
              onChange={(e) => setFechaRespuesta(e.target.value)}
            />
          </Field>
        )}

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Me cambia la caja el martes, factura 1234..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="rounded-lg bg-slate-900 px-4 py-3 text-white">
          <p className="text-sm">
            {cambia ? 'Así cambia esta pérdida' : 'Esta pérdida se queda igual'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-slate-400">
              Ahora figura como{' '}
              <span className="tabular font-semibold text-white">
                {formatMoney(perdidaActual, currency)}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="text-sm text-slate-400">
              pasará a ser{' '}
              <span
                className={cn(
                  'tabular text-lg font-bold',
                  perdidaNueva > 0 ? 'text-red-300' : 'text-emerald-300',
                )}
              >
                {perdidaNueva > 0 ? formatMoney(perdidaNueva, currency) : 'sin pérdida'}
              </span>
            </span>
          </div>
          <p className="mt-2 border-t border-white/15 pt-2 text-xs text-slate-300">
            {respuesta === 'FREE'
              ? 'La mercancía vuelve al inventario y no pierdes nada.'
              : respuesta === 'DISCOUNTED'
                ? 'La mercancía vuelve al inventario y solo pierdes lo que pagas por la reposición.'
                : respuesta === 'NONE'
                  ? 'No vuelve nada al inventario: pierdes todo lo que te costó.'
                  : 'Hasta que conteste se cuenta como pérdida total.'}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
