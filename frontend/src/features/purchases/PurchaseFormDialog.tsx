import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useCreatePurchase, useSuppliers, type PurchasePayload } from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/shared/api/client';
import {
  PAYMENT_METHODS,
  type Paginated,
  type PaymentMethod,
  type Product,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { cantidadConUnidad, pasoCantidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

/** Valor del desplegable de proveedor cuando se va a escribir uno nuevo. */
const PROVEEDOR_NUEVO = '__nuevo__';

type ComoPago = 'total' | 'parcial' | 'nada';

const OPCIONES_PAGO: { valor: ComoPago; titulo: string; pie: string }[] = [
  { valor: 'total', titulo: 'Pagué todo', pie: 'No queda deuda' },
  { valor: 'parcial', titulo: 'Abono parcial', pie: 'Pagas una parte' },
  { valor: 'nada', titulo: 'Queda a deber', pie: 'Lo pagas después' },
];

interface Linea {
  /** Clave local para poder repintar la lista al añadir o quitar filas. */
  key: string;
  productId: string;
  quantity: number | '';
  unitCost: number | '';
}

function lineaVacia(): Linea {
  return { key: crypto.randomUUID(), productId: '', quantity: 1, unitCost: '' };
}

/** Lo que llega de un pedido para no volver a teclearlo. */
export interface CompraInicial {
  supplierId?: string;
  notes?: string;
  items: { productId: string; quantity: number; unitCost: number }[];
}

export function PurchaseFormDialog({
  open,
  onOpenChange,
  inicial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Al registrar como compra un pedido, viene ya relleno. */
  inicial?: CompraInicial | null;
}) {
  const { currency } = useAuth();
  const crear = useCreatePurchase();
  const proveedores = useSuppliers();

  const [fecha, setFecha] = useState(today());
  const [proveedorId, setProveedorId] = useState('');
  const [proveedorNuevo, setProveedorNuevo] = useState('');
  const [factura, setFactura] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [descuento, setDescuento] = useState<number | ''>('');
  const [motivoDescuento, setMotivoDescuento] = useState('');
  const [comoPago, setComoPago] = useState<ComoPago>('nada');
  const [abono, setAbono] = useState<number | ''>('');
  const [formaDePago, setFormaDePago] = useState<PaymentMethod>('CASH');
  const [error, setError] = useState<string | null>(null);

  // Catálogo para el desplegable de productos.
  const productos = useQuery({
    queryKey: ['products', 'para-compra'],
    queryFn: () =>
      api.get<Paginated<Product>>('/products', { limit: 200, isActive: true }),
    enabled: open,
  });

  const porId = useMemo(
    () => new Map((productos.data?.data ?? []).map((p) => [p.id, p])),
    [productos.data],
  );

  // Al abrir, formulario limpio: una compra no se edita, se borra y se rehace.
  useEffect(() => {
    if (!open) return;
    setFecha(today());
    setProveedorId(inicial?.supplierId ?? '');
    setProveedorNuevo('');
    setFactura('');
    setVencimiento('');
    setNotas(inicial?.notes ?? '');
    setLineas(
      inicial?.items.length
        ? inicial.items.map((item) => ({
            key: crypto.randomUUID(),
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          }))
        : [lineaVacia()],
    );
    setDescuento('');
    setMotivoDescuento('');
    setComoPago('nada');
    setAbono('');
    setFormaDePago('CASH');
    setError(null);
  }, [open, inicial]);

  function cambiarLinea(key: string, cambios: Partial<Linea>) {
    setLineas((previas) =>
      previas.map((linea) => (linea.key === key ? { ...linea, ...cambios } : linea)),
    );
  }

  /** Al elegir producto se propone el costo que ya está guardado en inventario. */
  function elegirProducto(key: string, productId: string) {
    const producto = porId.get(productId);
    cambiarLinea(key, {
      productId,
      unitCost: producto ? toNumber(producto.costPrice) : '',
    });
  }

  const subtotal = lineas.reduce(
    (suma, linea) => suma + Number(linea.quantity || 0) * Number(linea.unitCost || 0),
    0,
  );
  const total = subtotal - Number(descuento || 0);

  const pagadoAhora =
    comoPago === 'total' ? total : comoPago === 'parcial' ? Number(abono || 0) : 0;
  const quedaADeber = total - pagadoAhora;

  async function guardar() {
    setError(null);

    const items = lineas
      .filter((linea) => linea.productId)
      .map((linea) => ({
        productId: linea.productId,
        quantity: Number(linea.quantity || 0),
        unitCost: Number(linea.unitCost || 0),
      }));

    if (!items.length) {
      setError('Añade al menos un producto del inventario');
      return;
    }
    if (items.some((item) => item.quantity <= 0)) {
      setError('Las cantidades deben ser mayores que cero');
      return;
    }
    if (items.some((item) => item.unitCost <= 0)) {
      setError('Escribe cuánto te costó cada producto');
      return;
    }
    if (proveedorId === PROVEEDOR_NUEVO && !proveedorNuevo.trim()) {
      setError('Escribe el nombre del proveedor nuevo');
      return;
    }
    if (Number(descuento || 0) > subtotal) {
      setError('El descuento no puede ser mayor que la suma de los productos');
      return;
    }
    if (comoPago === 'parcial' && Number(abono || 0) <= 0) {
      setError('Escribe cuánto pagaste ahora');
      return;
    }
    if (comoPago === 'parcial' && Number(abono || 0) > total) {
      setError('El abono no puede ser mayor que el total de la compra');
      return;
    }

    const datos: PurchasePayload = {
      date: fecha,
      ...(proveedorId === PROVEEDOR_NUEVO
        ? { supplierName: proveedorNuevo.trim() }
        : proveedorId
          ? { supplierId: proveedorId }
          : {}),
      ...(factura.trim() ? { invoiceNumber: factura.trim() } : {}),
      ...(vencimiento ? { dueDate: vencimiento } : {}),
      ...(notas.trim() ? { notes: notas.trim() } : {}),
      items,
      ...(Number(descuento || 0) > 0
        ? {
            discount: Number(descuento),
            ...(motivoDescuento.trim() ? { discountReason: motivoDescuento.trim() } : {}),
          }
        : {}),
      ...(pagadoAhora > 0
        ? {
            initialPayment: {
              date: fecha,
              amount: pagadoAhora,
              paymentMethod: formaDePago,
            },
          }
        : {}),
    };

    try {
      await crear.mutateAsync(datos);
      onOpenChange(false);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar la compra',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Nueva compra"
      description="Lo que compras entra al inventario: todavía no es un gasto."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando...' : 'Guardar compra'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha de la compra">
            <Input
              type="date"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          <Field label="Proveedor">
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
              <option value={PROVEEDOR_NUEVO}>+ Escribir uno nuevo</option>
            </Select>
            {proveedorId === PROVEEDOR_NUEVO && (
              <Input
                className="mt-2"
                autoFocus
                maxLength={120}
                placeholder="Nombre del proveedor"
                value={proveedorNuevo}
                onChange={(e) => setProveedorNuevo(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nº de factura (opcional)">
            <Input
              maxLength={60}
              placeholder="FV-1234"
              value={factura}
              onChange={(e) => setFactura(e.target.value)}
            />
          </Field>
          <Field
            label="Fecha de vencimiento (opcional)"
            hint="El día en que el proveedor espera cobrar."
          >
            <Input
              type="date"
              value={vencimiento}
              min={fecha}
              onChange={(e) => setVencimiento(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Mercancía comprada
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLineas((previas) => [...previas, lineaVacia()])}
            >
              <Plus className="h-4 w-4" />
              Añadir producto
            </Button>
          </div>

          <div className="space-y-3">
            {lineas.map((linea) => {
              const producto = porId.get(linea.productId);
              const subtotal =
                Number(linea.quantity || 0) * Number(linea.unitCost || 0);
              // Los granos se compran por kilos, las gaseosas de una en una.
              const paso = pasoCantidad(producto?.unit);

              return (
                <div
                  key={linea.key}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <span className="mb-1 block text-xs font-medium text-slate-500 sm:hidden">
                        Producto
                      </span>
                      <Select
                        value={linea.productId}
                        onChange={(e) => elegirProducto(linea.key, e.target.value)}
                        aria-label="Producto"
                      >
                        <option value="">Elige un producto</option>
                        {(productos.data?.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {cantidadConUnidad(p.stock, p.unit)}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {/* En el celular cantidad y costo comparten línea; en
                        escritorio vuelven a ser columnas de la rejilla. */}
                    <div className="grid grid-cols-2 gap-2 sm:contents">
                      <div className="sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-slate-500 sm:hidden">
                          Cantidad
                        </span>
                        <Input
                          type="number"
                          min={paso.min}
                          step={paso.step}
                          inputMode={paso.inputMode}
                          aria-label="Cantidad"
                          className="text-right tabular"
                          value={linea.quantity}
                          onChange={(e) =>
                            cambiarLinea(linea.key, {
                              quantity:
                                e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <span className="mb-1 block text-xs font-medium text-slate-500 sm:hidden">
                          Costo
                        </span>
                        <MoneyInput
                          aria-label="Costo unitario"
                          value={linea.unitCost}
                          onValueChange={(valor) =>
                            cambiarLinea(linea.key, { unitCost: valor })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <span className="text-xs text-slate-500 sm:hidden">Subtotal</span>
                      <span className="tabular text-sm font-medium text-slate-900">
                        {formatMoney(subtotal, currency)}
                      </span>
                      {lineas.length > 1 && (
                        <Button
                          variant="dangerGhost"
                          size="icon"
                          aria-label="Quitar producto"
                          onClick={() =>
                            setLineas((previas) =>
                              previas.filter((otra) => otra.key !== linea.key),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Un cruce, una devolución, una promoción: el proveedor resta del total. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Descuento del proveedor (opcional)"
            hint="Lo que te restó del total. No cambia el costo de los productos."
          >
            <MoneyInput
              aria-label="Descuento"
              value={descuento}
              onValueChange={setDescuento}
            />
          </Field>
          {Number(descuento || 0) > 0 && (
            <Field label="Por qué te lo descontó">
              <Input
                maxLength={200}
                placeholder="Cruce por las gaseosas vencidas..."
                value={motivoDescuento}
                onChange={(e) => setMotivoDescuento(e.target.value)}
              />
            </Field>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-700">¿Pagaste algo ahora?</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Lo que no pagues hoy queda como deuda con el proveedor.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {OPCIONES_PAGO.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => setComoPago(opcion.valor)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  comoPago === opcion.valor
                    ? 'border-marca-500 bg-marca-50 text-marca-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                <span className="block text-sm font-medium">{opcion.titulo}</span>
                <span className="block text-xs opacity-80">{opcion.pie}</span>
              </button>
            ))}
          </div>

          {comoPago === 'parcial' && (
            <Field className="mt-3" label="Cuánto pagaste ahora">
              <MoneyInput
                aria-label="Abono inicial"
                value={abono}
                onValueChange={setAbono}
              />
            </Field>
          )}

          {pagadoAhora > 0 && (
            <Field
              className="mt-3"
              label="Cómo lo pagaste"
              hint="En efectivo sale de la caja del día."
            >
              <Select
                value={formaDePago}
                onChange={(e) => setFormaDePago(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((metodo) => (
                  <option key={metodo.value} value={metodo.value}>
                    {metodo.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Pedido por teléfono, falta una caja..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="rounded-lg bg-slate-900 px-4 py-3 text-white">
          {Number(descuento || 0) > 0 && (
            <div className="mb-2 space-y-1 border-b border-white/15 pb-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Mercancía</span>
                <span className="tabular">{formatMoney(subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Descuento del proveedor</span>
                <span className="tabular">− {formatMoney(Number(descuento), currency)}</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm">Total de la compra</span>
            <span className="tabular text-xl font-bold">
              {formatMoney(Math.max(total, 0), currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/15 pt-2 text-sm">
            <span className="text-slate-300">
              {quedaADeber > 0 ? 'Quedas debiendo' : 'No queda deuda'}
            </span>
            <span className="tabular font-semibold">
              {formatMoney(Math.max(quedaADeber, 0), currency)}
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
