import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useCreateSale, useUpdateSale, type SalePayload } from './api';
import { useAuth } from '@/features/auth/auth-context';
import { pasoCantidad } from '@/shared/lib/unidades';
import { ApiError, api } from '@/shared/api/client';
import {
  PAYMENT_METHODS,
  type Paginated,
  type PaymentMethod,
  type Product,
  type Sale,
} from '@/shared/api/types';
import { today } from '@/shared/lib/dates';
import { formatMoney, formatQuantity, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

interface Linea {
  /** Clave local para poder repintar la lista al anadir o quitar filas. */
  key: string;
  productId: string;
  description: string;
  quantity: number | '';
  unitPrice: number | '';
}

function lineaVacia(): Linea {
  return {
    key: crypto.randomUUID(),
    productId: '',
    description: '',
    quantity: 1,
    unitPrice: '',
  };
}

export function SaleFormDialog({
  open,
  onOpenChange,
  venta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venta?: Sale | null;
}) {
  const { currency } = useAuth();
  const crear = useCreateSale();
  const actualizar = useUpdateSale();

  const [fecha, setFecha] = useState(today());
  const [formaDePago, setFormaDePago] = useState<PaymentMethod>('CASH');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [error, setError] = useState<string | null>(null);

  // Catalogo para el desplegable de productos.
  const productos = useQuery({
    queryKey: ['products', 'para-venta'],
    queryFn: () =>
      api.get<Paginated<Product>>('/products', { limit: 200, isActive: true }),
    enabled: open,
  });

  const porId = useMemo(
    () => new Map((productos.data?.data ?? []).map((p) => [p.id, p])),
    [productos.data],
  );

  // Al abrir: o los datos de la venta que se edita, o un formulario limpio.
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (venta) {
      setFecha(venta.date.slice(0, 10));
      setFormaDePago(venta.paymentMethod);
      setNotas(venta.notes ?? '');
      setLineas(
        venta.items.map((item) => ({
          key: item.id,
          productId: item.productId ?? '',
          description: item.description,
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.unitPrice),
        })),
      );
    } else {
      setFecha(today());
      setFormaDePago('CASH');
      setNotas('');
      setLineas([lineaVacia()]);
    }
  }, [open, venta]);

  function cambiarLinea(key: string, cambios: Partial<Linea>) {
    setLineas((previas) =>
      previas.map((linea) => (linea.key === key ? { ...linea, ...cambios } : linea)),
    );
  }

  /** Al elegir producto se rellena el precio de venta que ya esta guardado. */
  function elegirProducto(key: string, productId: string) {
    const producto = porId.get(productId);
    cambiarLinea(key, {
      productId,
      description: producto?.name ?? '',
      unitPrice: producto ? toNumber(producto.salePrice) : '',
    });
  }

  const total = lineas.reduce(
    (suma, linea) => suma + Number(linea.quantity || 0) * Number(linea.unitPrice || 0),
    0,
  );

  async function guardar() {
    setError(null);

    const items = lineas
      .filter((linea) => linea.productId || linea.description.trim())
      .map((linea) => ({
        ...(linea.productId ? { productId: linea.productId } : {}),
        ...(linea.description.trim() ? { description: linea.description.trim() } : {}),
        quantity: Number(linea.quantity || 0),
        unitPrice: Number(linea.unitPrice || 0),
      }));

    if (!items.length) {
      setError('Añade al menos un producto o concepto');
      return;
    }
    if (items.some((item) => item.quantity <= 0)) {
      setError('Las cantidades deben ser mayores que cero');
      return;
    }

    const datos: SalePayload = {
      date: fecha,
      paymentMethod: formaDePago,
      ...(notas.trim() ? { notes: notas.trim() } : {}),
      items,
    };

    try {
      if (venta) {
        await actualizar.mutateAsync({ id: venta.id, datos });
      } else {
        await crear.mutateAsync(datos);
      }
      onOpenChange(false);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar la venta',
      );
    }
  }

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={venta ? 'Editar venta' : 'Nueva venta'}
      description="Añade productos del inventario o escribe un concepto libre."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar venta'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <Input
              type="date"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          <Field label="Cómo te pagaron">
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
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Productos</span>
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
                Number(linea.quantity || 0) * Number(linea.unitPrice || 0);
              // Los granos se venden por kilos, las cervezas de una en una.
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
                        <option value="">Concepto libre (sin inventario)</option>
                        {(productos.data?.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {formatQuantity(p.stock)} {p.unit}
                          </option>
                        ))}
                      </Select>
                      {!linea.productId && (
                        <Input
                          className="mt-2"
                          placeholder="Descripción (p. ej. recarga de celular)"
                          value={linea.description}
                          onChange={(e) =>
                            cambiarLinea(linea.key, { description: e.target.value })
                          }
                        />
                      )}
                      {producto && Number(producto.stock) <= 0 && (
                        <p className="mt-1 text-xs text-amber-700">
                          Sin stock: la venta se registra igual y el inventario
                          quedará en negativo.
                        </p>
                      )}
                    </div>

                    {/* En el celular cantidad y precio comparten línea; en
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
                          Precio
                        </span>
                        <MoneyInput
                          aria-label="Precio unitario"
                          value={linea.unitPrice}
                          onValueChange={(valor) =>
                            cambiarLinea(linea.key, { unitPrice: valor })
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

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Cliente habitual, pendiente de entrega..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm">Total de la venta</span>
          <span className="tabular text-xl font-bold">
            {formatMoney(total, currency)}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
