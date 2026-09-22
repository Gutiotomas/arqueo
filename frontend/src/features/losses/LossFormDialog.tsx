import { useMemo, useState } from 'react';

import {
  calcularPerdida,
  useCreateLoss,
  useProductosParaPerdida,
  useSuppliers,
  type LossPayload,
} from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import {
  LOSS_REASONS,
  LOSS_RESOLUTIONS,
  PAYMENT_METHODS,
  type LossReason,
  type LossResolution,
  type PaymentMethod,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { cantidadConUnidad, pasoCantidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

/**
 * El bloque de "qué hace el proveedor" es idéntico al registrar la pérdida y
 * al anotar la respuesta, así que vive aquí y lo reutiliza ResolveLossDialog.
 */
export function RespuestaDelProveedor({
  titulo,
  descripcion,
  valor,
  onValorChange,
  costoReposicion,
  onCostoReposicionChange,
  formaDePago,
  onFormaDePagoChange,
}: {
  titulo: string;
  descripcion: string;
  valor: LossResolution;
  onValorChange: (valor: LossResolution) => void;
  costoReposicion: number | '';
  onCostoReposicionChange: (valor: number | '') => void;
  formaDePago: PaymentMethod;
  onFormaDePagoChange: (metodo: PaymentMethod) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {LOSS_RESOLUTIONS.map((opcion) => (
          <button
            key={opcion.value}
            type="button"
            onClick={() => onValorChange(opcion.value)}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-left transition-colors',
              valor === opcion.value
                ? 'border-marca-500 bg-marca-50 text-marca-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <span className="block text-sm font-medium">{opcion.label}</span>
            <span className="block text-xs opacity-80">{opcion.hint}</span>
          </button>
        ))}
      </div>

      {valor === 'DISCOUNTED' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Cuánto te cobra por unidad">
            <MoneyInput
              aria-label="Costo de la reposición por unidad"
              value={costoReposicion}
              onValueChange={onCostoReposicionChange}
            />
          </Field>
          <Field
            label="Cómo lo pagas"
            hint="En efectivo sale de la caja de ese día."
          >
            <Select
              value={formaDePago}
              onChange={(e) => onFormaDePagoChange(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((metodo) => (
                <option key={metodo.value} value={metodo.value}>
                  {metodo.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </div>
  );
}

/**
 * Se monta solo mientras está abierto (lo hace LossesPage), así que cada vez
 * empieza en blanco: una pérdida no se edita, se borra y se vuelve a anotar.
 */
export function LossFormDialog({
  open,
  onOpenChange,
  productoInicial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Producto preseleccionado al llegar desde el inventario. */
  productoInicial?: string;
}) {
  const { currency } = useAuth();
  const crear = useCreateLoss();
  const productos = useProductosParaPerdida(open);
  const proveedores = useSuppliers();

  const [productId, setProductId] = useState(productoInicial ?? '');
  const [fecha, setFecha] = useState(today());
  const [cantidad, setCantidad] = useState<number | ''>(1);
  const [motivo, setMotivo] = useState<LossReason>('DAMAGED');
  const [respuesta, setRespuesta] = useState<LossResolution>('PENDING');
  const [costoReposicion, setCostoReposicion] = useState<number | ''>('');
  const [formaDePago, setFormaDePago] = useState<PaymentMethod>('CASH');
  const [proveedorId, setProveedorId] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  const porId = useMemo(
    () => new Map((productos.data?.data ?? []).map((p) => [p.id, p])),
    [productos.data],
  );
  const producto = porId.get(productId);

  // Los granos salen por kilos, las gaseosas de una en una.
  const paso = pasoCantidad(producto?.unit);
  const unidades = Number(cantidad || 0);
  const costoUnitario = toNumber(producto?.costPrice);
  const stock = toNumber(producto?.stock);
  const perdida = calcularPerdida(
    respuesta,
    unidades,
    costoUnitario,
    Number(costoReposicion || 0),
  );

  async function guardar() {
    setError(null);

    if (!productId) {
      setError('Elige el producto que se dañó o se perdió');
      return;
    }
    if (unidades <= 0) {
      setError('Escribe cuántas unidades salieron del inventario');
      return;
    }
    if (respuesta === 'DISCOUNTED' && Number(costoReposicion || 0) <= 0) {
      setError('Si el proveedor cobra por la reposición, escribe cuánto cobra por unidad');
      return;
    }

    const datos: LossPayload = {
      productId,
      date: fecha,
      quantity: unidades,
      reason: motivo,
      resolution: respuesta,
      ...(respuesta === 'DISCOUNTED'
        ? {
            replacementUnitCost: Number(costoReposicion || 0),
            paymentMethod: formaDePago,
          }
        : {}),
      ...(proveedorId ? { supplierId: proveedorId } : {}),
      ...(notas.trim() ? { notes: notas.trim() } : {}),
    };

    try {
      await crear.mutateAsync(datos);
      onOpenChange(false);
    } catch (fallo) {
      // El API valida lo mismo y con más detalle: su mensaje manda.
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar la pérdida',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Registrar pérdida"
      description="La mercancía sale del inventario siempre. Lo que pierdes depende del proveedor."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando...' : 'Guardar pérdida'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Producto">
          <Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Producto"
          >
            <option value="">Elige un producto</option>
            {(productos.data?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {cantidadConUnidad(p.stock, p.unit)}
              </option>
            ))}
          </Select>
          {producto && (
            <p className="mt-1 text-xs text-slate-500">
              Te quedan {cantidadConUnidad(producto.stock, producto.unit)} · te costó{' '}
              {formatMoney(producto.costPrice, currency)} por {producto.unit}
            </p>
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <Input
              type="date"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          <Field
            label={`Cantidad${producto ? ` (${producto.unit})` : ''}`}
            hint={
              producto && unidades > stock
                ? `Ojo: en inventario solo quedan ${cantidadConUnidad(stock, producto.unit)}`
                : undefined
            }
          >
            <Input
              type="number"
              min={paso.min}
              step={paso.step}
              inputMode={paso.inputMode}
              aria-label="Cantidad perdida"
              className="text-right tabular"
              value={cantidad}
              onChange={(e) =>
                setCantidad(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="¿Qué pasó?">
            <Select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as LossReason)}
              aria-label="Motivo"
            >
              {LOSS_REASONS.map((opcion) => (
                <option key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Proveedor (opcional)"
            hint="A quién le vas a reclamar la mercancía."
          >
            <Select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              aria-label="Proveedor"
            >
              <option value="">Sin proveedor</option>
              {(proveedores.data ?? []).map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <RespuestaDelProveedor
          titulo="¿Qué va a hacer el proveedor?"
          descripcion="Si aún no lo sabes, déjalo en «Aún no sé» y lo corriges cuando conteste."
          valor={respuesta}
          onValorChange={setRespuesta}
          costoReposicion={costoReposicion}
          onCostoReposicionChange={setCostoReposicion}
          formaDePago={formaDePago}
          onFormaDePagoChange={setFormaDePago}
        />

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Se rompieron al bajarlas del camión, ya avisé al proveedor..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="rounded-lg bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Lo que pierde el negocio</span>
            <span
              className={cn(
                'tabular text-xl font-bold',
                perdida > 0 ? 'text-red-300' : 'text-emerald-300',
              )}
            >
              {formatMoney(perdida, currency)}
            </span>
          </div>
          <p className="mt-2 border-t border-white/15 pt-2 text-xs text-slate-300">
            {respuesta === 'FREE'
              ? 'Te cambian unas unidades por otras: no pierdes dinero.'
              : respuesta === 'DISCOUNTED'
                ? 'Solo pierdes lo que te toca pagar por la reposición.'
                : respuesta === 'NONE'
                  ? 'Pierdes lo que te costó esa mercancía, no lo que ibas a cobrar por ella.'
                  : 'Mientras el proveedor no conteste se cuenta como pérdida total; al anotar su respuesta se corrige.'}
          </p>
          {producto && (
            <p className="mt-1 text-xs text-slate-400">
              {cantidadConUnidad(unidades, producto.unit)} salen del inventario.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
