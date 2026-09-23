import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useConvertStock } from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/shared/api/client';
import type { Paginated, Product } from '@/shared/api/types';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { cantidadConUnidad, pasoCantidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, Select, Textarea } from '@/shared/ui/field';

/**
 * Dividir o reempacar: dos canastas de 30 huevos se vuelven cuatro de 15.
 * No es compra ni venta, así que ninguna compra cambia; el costo viaja con
 * la mercancía.
 */
export function ConvertDialog({
  open,
  onOpenChange,
  producto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Product | null;
}) {
  const { currency } = useAuth();
  const convertir = useConvertStock();

  const [destinoId, setDestinoId] = useState('');
  const [sale, setSale] = useState<number | ''>('');
  const [entra, setEntra] = useState<number | ''>('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const productos = useQuery({
    queryKey: ['products', 'para-convertir'],
    queryFn: () =>
      api.get<Paginated<Product>>('/products', { limit: 200, isActive: true }),
    enabled: open,
  });
  const candidatos = useMemo(
    () => (productos.data?.data ?? []).filter((p) => p.id !== producto?.id),
    [productos.data, producto],
  );
  const destino = candidatos.find((p) => p.id === destinoId) ?? null;

  useEffect(() => {
    if (!open) return;
    setDestinoId('');
    setSale('');
    setEntra('');
    setMotivo('');
    setError(null);
  }, [open, producto]);

  const stockActual = toNumber(producto?.stock);
  const pasoSale = pasoCantidad(producto?.unit);
  const pasoEntra = pasoCantidad(destino?.unit);
  // Lo que valía lo que sale, repartido entre lo que entra.
  const valor = Number(sale || 0) * toNumber(producto?.costPrice);
  const costoEntrante = Number(entra || 0) > 0 ? valor / Number(entra) : 0;

  async function guardar() {
    if (!producto) return;
    setError(null);

    if (!destinoId) {
      setError('Elige a qué producto pasa la mercancía');
      return;
    }
    if (Number(sale || 0) <= 0 || Number(entra || 0) <= 0) {
      setError('Escribe cuánto sale y cuánto entra');
      return;
    }
    if (Number(sale) > stockActual) {
      setError(`Solo hay ${cantidadConUnidad(stockActual, producto.unit)}`);
      return;
    }

    try {
      await convertir.mutateAsync({
        id: producto.id,
        datos: {
          toProductId: destinoId,
          quantity: Number(sale),
          resultingQuantity: Number(entra),
          ...(motivo.trim() ? { reason: motivo.trim() } : {}),
        },
      });
      onOpenChange(false);
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo convertir');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dividir o convertir"
      description="Pasa mercancía de este producto a otro: dividir canastas, reempacar. No cambia ninguna compra."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={convertir.isPending || !producto}>
            {convertir.isPending ? 'Guardando...' : 'Convertir'}
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
              {cantidadConUnidad(stockActual, producto?.unit)}
            </span>
          </span>
        </div>

        <Field label="Pasa a">
          <Select
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            aria-label="Producto de destino"
          >
            <option value="">Elige el producto</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {cantidadConUnidad(p.stock, p.unit)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label={`Sale (${producto?.unit ?? ''})`}>
            <Input
              type="number"
              min={pasoSale.min}
              step={pasoSale.step}
              inputMode={pasoSale.inputMode}
              className="text-right tabular"
              aria-label="Cantidad que sale"
              value={sale}
              onChange={(e) => setSale(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <ArrowRight className="mb-3 h-5 w-5 text-slate-400" aria-hidden="true" />
          <Field label={`Entra (${destino?.unit ?? '…'})`}>
            <Input
              type="number"
              min={pasoEntra.min}
              step={pasoEntra.step}
              inputMode={pasoEntra.inputMode}
              className="text-right tabular"
              aria-label="Cantidad que entra"
              value={entra}
              disabled={!destino}
              onChange={(e) => setEntra(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
        </div>

        {destino && Number(sale || 0) > 0 && Number(entra || 0) > 0 && (
          <div className="space-y-1 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="flex justify-between gap-3">
              <span>{producto?.name} quedará en</span>
              <span className="tabular font-semibold">
                {cantidadConUnidad(stockActual - Number(sale), producto?.unit)}
              </span>
            </p>
            <p className="flex justify-between gap-3">
              <span>{destino.name} quedará en</span>
              <span className="tabular font-semibold">
                {cantidadConUnidad(toNumber(destino.stock) + Number(entra), destino.unit)}
              </span>
            </p>
            <p className="flex justify-between gap-3 text-xs opacity-80">
              <span>Cada {destino.unit} que entra vale</span>
              <span className="tabular">{formatMoney(costoEntrante, currency)}</span>
            </p>
          </div>
        )}

        <Field label="Motivo (opcional)">
          <Textarea
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
            placeholder="Se dividieron dos canastas para vender sueltas..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    </Dialog>
  );
}
