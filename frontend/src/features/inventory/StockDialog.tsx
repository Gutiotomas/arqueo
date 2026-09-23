import { useEffect, useState } from 'react';

import { useAdjustStock, useProductPurchases, useStockIn } from './api';
import { cantidadConUnidad, pasoCantidad } from '@/shared/lib/unidades';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { Product } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

export type ModoStock = 'entrada' | 'ajuste';

export function StockDialog({
  open,
  onOpenChange,
  producto,
  modo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Product | null;
  modo: ModoStock;
}) {
  const { currency } = useAuth();
  const entrada = useStockIn();
  const ajuste = useAdjustStock();

  const [cantidad, setCantidad] = useState<number | ''>('');
  const [costoUnitario, setCostoUnitario] = useState<number | ''>('');
  const [contado, setContado] = useState<number | ''>('');
  const [motivo, setMotivo] = useState('');
  const [compraId, setCompraId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Las compras en las que vino el producto, por si la diferencia es de una.
  const compras = useProductPurchases(open ? (producto?.id ?? null) : null);
  const compra = (compras.data ?? []).find((c) => c.purchaseId === compraId) ?? null;

  const stockActual = toNumber(producto?.stock);
  const unidad = producto?.unit ?? 'ud';
  // Las unidades sueltas se cuentan de uno en uno; los kilos admiten decimales.
  const paso = pasoCantidad(producto?.unit);

  // El conteo arranca en el stock del sistema: casi siempre coincide.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCantidad('');
    setCostoUnitario('');
    setMotivo('');
    setCompraId('');
    setContado(toNumber(producto?.stock));
  }, [open, producto]);

  const resultante = stockActual + Number(cantidad || 0);
  const diferencia = Number(contado || 0) - stockActual;
  // Lo que cambia en la compra elegida, para verlo antes de guardar.
  const deltaCompra = modo === 'entrada' ? Number(cantidad || 0) : diferencia;
  const compraNueva = compra
    ? {
        cantidad: toNumber(compra.quantity) + deltaCompra,
        total: toNumber(compra.total) + deltaCompra * toNumber(compra.unitCost),
      }
    : null;

  async function guardar() {
    if (!producto) return;
    setError(null);

    try {
      if (modo === 'entrada') {
        const unidades = Number(cantidad || 0);
        if (unidades <= 0) {
          setError('La cantidad que entra debe ser mayor que cero');
          return;
        }
        await entrada.mutateAsync({
          id: producto.id,
          datos: {
            quantity: unidades,
            ...(costoUnitario === '' ? {} : { unitCost: Number(costoUnitario) }),
            ...(motivo.trim() ? { reason: motivo.trim() } : {}),
            ...(compraId ? { purchaseId: compraId } : {}),
          },
        });
      } else {
        if (contado === '' || Number(contado) < 0) {
          setError('Escribe el stock real que has contado');
          return;
        }
        await ajuste.mutateAsync({
          id: producto.id,
          datos: {
            stock: Number(contado),
            ...(motivo.trim() ? { reason: motivo.trim() } : {}),
            ...(compraId ? { purchaseId: compraId } : {}),
          },
        });
      }
      onOpenChange(false);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError
          ? fallo.detalle
          : 'No se pudo registrar el movimiento',
      );
    }
  }

  const guardando = entrada.isPending || ajuste.isPending;
  const esEntrada = modo === 'entrada';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={esEntrada ? 'Entrada de mercancía' : 'Ajustar stock'}
      description={
        esEntrada
          ? 'Lo que acabas de recibir del proveedor.'
          : 'Fija el stock real que has contado en la estantería.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !producto}>
            {guardando
              ? 'Guardando...'
              : esEntrada
                ? 'Registrar entrada'
                : 'Guardar ajuste'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="min-w-0 text-sm font-medium text-slate-900">
            {producto?.name}
          </span>
          <span className="text-sm text-slate-500">
            Stock actual{' '}
            <span className="tabular font-semibold text-slate-900">
              {cantidadConUnidad(stockActual, unidad)}
            </span>
          </span>
        </div>

        {esEntrada ? (
          <>
            <Field label={`Cantidad que entra (${unidad})`}>
              <Input
                type="number"
                min={paso.min}
                step={paso.step}
                inputMode={paso.inputMode}
                autoFocus
                aria-label="Cantidad que entra"
                className="text-right tabular"
                value={cantidad}
                onChange={(e) =>
                  setCantidad(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </Field>

            <Field
              label="Costo unitario de esta compra (opcional)"
              hint="Si lo escribes, pasa a ser el costo del producto."
            >
              <MoneyInput value={costoUnitario} onValueChange={setCostoUnitario} />
            </Field>

            {Number(cantidad || 0) > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span>El stock quedará en</span>
                <span className="tabular font-semibold">
                  {cantidadConUnidad(resultante, unidad)}
                </span>
              </div>
            )}

            {costoUnitario !== '' && Number(cantidad || 0) > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">
                <span>Total de la compra</span>
                <span className="tabular font-medium text-slate-900">
                  {formatMoney(
                    Number(costoUnitario) * Number(cantidad || 0),
                    currency,
                  )}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <Field
              label={`Stock real contado (${unidad})`}
              hint="El valor absoluto, no la diferencia."
            >
              <Input
                type="number"
                min={0}
                step={paso.step}
                inputMode={paso.inputMode}
                autoFocus
                aria-label="Stock real contado"
                className="text-right tabular"
                value={contado}
                onChange={(e) =>
                  setContado(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </Field>

            <div
              className={cn(
                'flex items-center justify-between rounded-lg px-4 py-3 text-sm',
                diferencia === 0
                  ? 'bg-slate-50 text-slate-600'
                  : diferencia > 0
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-red-50 text-red-700',
              )}
            >
              <span>
                {diferencia === 0
                  ? 'El conteo cuadra con el sistema'
                  : 'Diferencia que se va a registrar'}
              </span>
              <span className="tabular font-semibold">
                {diferencia > 0 ? '+' : ''}
                {cantidadConUnidad(diferencia, unidad)}
              </span>
            </div>
          </>
        )}

        {/* Si la diferencia viene de una compra mal apuntada, la compra se
            corrige con ella. Si no (una canasta dividida, una rotura), solo
            se mueve el inventario. */}
        {(compras.data?.length ?? 0) > 0 && (
          <Field
            label="¿Corrige alguna compra?"
            hint={
              compraId
                ? 'La compra cambia con este ajuste: su cantidad, su total y lo que se le debe al proveedor.'
                : 'Si eliges una, la cantidad de esa compra cambia con este ajuste. Si no, solo se mueve el inventario.'
            }
          >
            <Select
              value={compraId}
              onChange={(e) => setCompraId(e.target.value)}
              aria-label="Compra que corrige"
            >
              <option value="">No, solo el inventario</option>
              {(compras.data ?? []).map((c) => (
                <option key={c.itemId} value={c.purchaseId}>
                  {formatDate(c.date)}
                  {c.invoiceNumber ? ` · ${c.invoiceNumber}` : ''}
                  {c.supplier ? ` · ${c.supplier}` : ''} · trajo{' '}
                  {cantidadConUnidad(c.quantity, unidad)} a{' '}
                  {formatMoney(c.unitCost, currency)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {compra && compraNueva && deltaCompra !== 0 && (
          <div
            className={cn(
              'space-y-1 rounded-lg px-4 py-3 text-sm',
              compraNueva.cantidad > 0 ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-700',
            )}
          >
            <p className="flex justify-between gap-3">
              <span>La compra pasa de {cantidadConUnidad(compra.quantity, unidad)} a</span>
              <span className="tabular font-semibold">
                {cantidadConUnidad(compraNueva.cantidad, unidad)}
              </span>
            </p>
            <p className="flex justify-between gap-3">
              <span>Su total, de {formatMoney(compra.total, currency)} a</span>
              <span className="tabular font-semibold">
                {formatMoney(compraNueva.total, currency)}
              </span>
            </p>
            {compraNueva.cantidad <= 0 && (
              <p className="text-xs">
                La compra no puede quedar sin este producto: si no trajo nada, bórrala.
              </p>
            )}
          </div>
        )}

        <Field label="Motivo (opcional)">
          <Textarea
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
            placeholder={
              esEntrada
                ? 'Compra a proveedor, devolución de cliente...'
                : 'Conteo físico, rotura, caducado...'
            }
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
