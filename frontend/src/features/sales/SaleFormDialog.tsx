import { useQuery } from '@tanstack/react-query';
import { Plus, Split, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useCreateSale, useCustomers, useUpdateSale, type SaleItemPayload, type SalePayload } from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/shared/api/client';
import {
  PAYMENT_METHOD_LABELS,
  SALE_PAYMENT_METHODS,
  type Paginated,
  type PaymentMethod,
  type Product,
  type Sale,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { cantidadConUnidad, pasoCantidad } from '@/shared/lib/unidades';
import { useEnfocarNuevo } from '@/shared/lib/use-enfocar-nuevo';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

/** Valor del desplegable de cliente cuando se va a escribir uno nuevo. */
const CLIENTE_NUEVO = '__nuevo__';

/**
 * Cómo se pagó una parte del producto. Seis arepas pueden ser dos partes en
 * efectivo, dos por transferencia y dos fiadas a alguien.
 */
interface Parte {
  key: string;
  quantity: number | '';
  paymentMethod: PaymentMethod;
  customerId: string;
  customerName: string;
}

/** Un producto de la venta con su precio y sus partes. */
interface Linea {
  key: string;
  productId: string;
  description: string;
  unitPrice: number | '';
  partes: Parte[];
}

function parteVacia(paymentMethod: PaymentMethod, quantity: number | '' = ''): Parte {
  return { key: crypto.randomUUID(), quantity, paymentMethod, customerId: '', customerName: '' };
}

function lineaVacia(paymentMethod: PaymentMethod): Linea {
  return {
    key: crypto.randomUUID(),
    productId: '',
    description: '',
    unitPrice: '',
    partes: [parteVacia(paymentMethod)],
  };
}

/** Las líneas del API vienen sueltas; aquí se agrupan por producto y precio. */
function agrupar(venta: Sale): Linea[] {
  const lineas = new Map<string, Linea>();
  for (const item of venta.items) {
    const clave = `${item.productId ?? item.description}|${item.unitPrice}`;
    const linea =
      lineas.get(clave) ??
      {
        key: item.id,
        productId: item.productId ?? '',
        description: item.description,
        unitPrice: toNumber(item.unitPrice),
        partes: [],
      };
    linea.partes.push({
      key: item.id,
      quantity: toNumber(item.quantity),
      paymentMethod: item.paymentMethod,
      customerId: item.customer?.id ?? '',
      customerName: '',
    });
    lineas.set(clave, linea);
  }
  return [...lineas.values()];
}

export function SaleFormDialog({
  open,
  onOpenChange,
  venta,
  formaDePagoInicial = 'CASH',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venta?: Sale | null;
  /** Con qué arranca cada parte nueva: desde Fiados llega ya en "Fiado". */
  formaDePagoInicial?: PaymentMethod;
}) {
  const { currency } = useAuth();
  const crear = useCreateSale();
  const enfocar = useEnfocarNuevo();
  const actualizar = useUpdateSale();
  const clientes = useCustomers();

  const [fecha, setFecha] = useState(today());
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia('CASH')]);
  const [error, setError] = useState<string | null>(null);

  // Catálogo para el desplegable de productos.
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
      setNotas(venta.notes ?? '');
      setLineas(agrupar(venta));
    } else {
      setFecha(today());
      setNotas('');
      setLineas([lineaVacia(formaDePagoInicial)]);
    }
  }, [open, venta, formaDePagoInicial]);

  function cambiarLinea(key: string, cambios: Partial<Linea>) {
    setLineas((previas) =>
      previas.map((linea) => (linea.key === key ? { ...linea, ...cambios } : linea)),
    );
  }

  function cambiarParte(lineaKey: string, parteKey: string, cambios: Partial<Parte>) {
    setLineas((previas) =>
      previas.map((linea) =>
        linea.key === lineaKey
          ? {
              ...linea,
              partes: linea.partes.map((parte) =>
                parte.key === parteKey ? { ...parte, ...cambios } : parte,
              ),
            }
          : linea,
      ),
    );
  }

  /** Al elegir producto se rellena el precio de venta que ya está guardado. */
  function elegirProducto(key: string, productId: string) {
    const producto = porId.get(productId);
    cambiarLinea(key, {
      productId,
      description: producto ? '' : '',
      unitPrice: producto ? toNumber(producto.salePrice) : '',
    });
  }

  const cantidadLinea = (linea: Linea) =>
    linea.partes.reduce((suma, parte) => suma + Number(parte.quantity || 0), 0);
  const subtotalLinea = (linea: Linea) => cantidadLinea(linea) * Number(linea.unitPrice || 0);
  const total = lineas.reduce((suma, linea) => suma + subtotalLinea(linea), 0);

  /** Cuánto va por cada forma de pago, y a quién se fía. */
  const reparto = useMemo(() => {
    const porMetodo = new Map<PaymentMethod, number>();
    const fiadoA = new Map<string, number>();
    for (const linea of lineas) {
      for (const parte of linea.partes) {
        const importe = Number(parte.quantity || 0) * Number(linea.unitPrice || 0);
        porMetodo.set(parte.paymentMethod, (porMetodo.get(parte.paymentMethod) ?? 0) + importe);
        if (parte.paymentMethod === 'CREDIT') {
          const nombre =
            parte.customerId === CLIENTE_NUEVO
              ? parte.customerName.trim() || '¿quién?'
              : (clientes.data?.find((c) => c.id === parte.customerId)?.name ?? '¿quién?');
          fiadoA.set(nombre, (fiadoA.get(nombre) ?? 0) + importe);
        }
      }
    }
    return { porMetodo, fiadoA };
  }, [lineas, clientes.data]);

  async function guardar() {
    setError(null);

    const items: SaleItemPayload[] = [];
    for (const [indice, linea] of lineas.entries()) {
      if (!linea.productId && !linea.description.trim()) continue;
      if (Number(linea.unitPrice || 0) < 0) {
        setError(`El precio del producto ${indice + 1} no puede ser negativo`);
        return;
      }
      for (const parte of linea.partes) {
        if (Number(parte.quantity || 0) <= 0) {
          setError('Las cantidades deben ser mayores que cero');
          return;
        }
        if (parte.paymentMethod === 'CREDIT') {
          if (!parte.customerId || (parte.customerId === CLIENTE_NUEVO && !parte.customerName.trim())) {
            setError('Para fiar hay que decir a quién');
            return;
          }
        }
        items.push({
          ...(linea.productId ? { productId: linea.productId } : {}),
          ...(linea.description.trim() ? { description: linea.description.trim() } : {}),
          quantity: Number(parte.quantity),
          unitPrice: Number(linea.unitPrice || 0),
          paymentMethod: parte.paymentMethod,
          ...(parte.paymentMethod === 'CREDIT'
            ? parte.customerId === CLIENTE_NUEVO
              ? { customerName: parte.customerName.trim() }
              : { customerId: parte.customerId }
            : {}),
        });
      }
    }

    if (!items.length) {
      setError('Añade al menos un producto o concepto');
      return;
    }

    const datos: SalePayload = {
      date: fecha,
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
      setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar la venta');
    }
  }

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={venta ? 'Editar venta' : 'Nueva venta'}
      description="Apunta lo que se vendió y cómo se pagó cada cosa. Puede ser todo el día de una vez."
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
        <Field label="Fecha" className="sm:max-w-xs">
          <Input
            type="date"
            value={fecha}
            max={today()}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Productos</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const nueva = lineaVacia(formaDePagoInicial);
                setLineas((previas) => [...previas, nueva]);
                enfocar(nueva.key);
              }}
            >
              <Plus className="h-4 w-4" />
              Añadir producto
            </Button>
          </div>

          <div className="space-y-3">
            {lineas.map((linea) => {
              const producto = porId.get(linea.productId);
              // Los granos se venden por kilos, las cervezas de una en una.
              const paso = pasoCantidad(producto?.unit);
              const unidad = producto?.unit ?? 'ud';

              return (
                <div
                  key={linea.key}
                  data-nuevo={linea.key}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-7">
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
                            {p.name} · {cantidadConUnidad(p.stock, p.unit)}
                          </option>
                        ))}
                      </Select>
                      {!linea.productId && (
                        <Input
                          className="mt-2"
                          placeholder="Descripción (p. ej. recarga de celular)"
                          aria-label="Descripción"
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

                    <div className="sm:col-span-3">
                      <span className="mb-1 block text-xs font-medium text-slate-500 sm:hidden">
                        Precio unitario
                      </span>
                      <MoneyInput
                        aria-label="Precio unitario"
                        value={linea.unitPrice}
                        onValueChange={(valor) => cambiarLinea(linea.key, { unitPrice: valor })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <span className="text-xs text-slate-500 sm:hidden">Subtotal</span>
                      <span className="tabular text-sm font-medium text-slate-900">
                        {formatMoney(subtotalLinea(linea), currency)}
                      </span>
                      {lineas.length > 1 && (
                        <Button
                          variant="dangerGhost"
                          size="icon"
                          aria-label="Quitar producto"
                          onClick={() =>
                            setLineas((previas) => previas.filter((otra) => otra.key !== linea.key))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Las partes: cuántas y cómo se pagó cada tanda. Una sola
                      parte es lo normal; "Dividir" añade otra forma de pago. */}
                  <div className="mt-2 space-y-1.5">
                    {linea.partes.map((parte) => (
                      <div
                        key={parte.key}
                        data-nuevo={parte.key}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Input
                          type="number"
                          min={paso.min}
                          step={paso.step}
                          inputMode={paso.inputMode}
                          aria-label="Cantidad"
                          className="w-24 text-right tabular"
                          value={parte.quantity}
                          onChange={(e) =>
                            cambiarParte(linea.key, parte.key, {
                              quantity: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                        />
                        <span className="text-xs text-slate-500">{unidad} en</span>
                        <Select
                          className="w-auto"
                          value={parte.paymentMethod}
                          aria-label="Forma de pago"
                          onChange={(e) =>
                            cambiarParte(linea.key, parte.key, {
                              paymentMethod: e.target.value as PaymentMethod,
                            })
                          }
                        >
                          {SALE_PAYMENT_METHODS.map((metodo) => (
                            <option key={metodo.value} value={metodo.value}>
                              {metodo.label}
                            </option>
                          ))}
                        </Select>
                        {parte.paymentMethod === 'CREDIT' && (
                          <>
                            <span className="text-xs text-slate-500">a</span>
                            <Select
                              className="w-auto"
                              value={parte.customerId}
                              aria-label="Cliente"
                              onChange={(e) =>
                                cambiarParte(linea.key, parte.key, { customerId: e.target.value })
                              }
                            >
                              <option value="">¿A quién?</option>
                              {(clientes.data ?? []).map((cliente) => (
                                <option key={cliente.id} value={cliente.id}>
                                  {cliente.name}
                                </option>
                              ))}
                              <option value={CLIENTE_NUEVO}>+ Escribir uno nuevo</option>
                            </Select>
                            {parte.customerId === CLIENTE_NUEVO && (
                              <Input
                                className="w-44"
                                autoFocus
                                maxLength={120}
                                placeholder="Nombre del cliente"
                                aria-label="Nombre del cliente nuevo"
                                value={parte.customerName}
                                onChange={(e) =>
                                  cambiarParte(linea.key, parte.key, { customerName: e.target.value })
                                }
                              />
                            )}
                          </>
                        )}
                        {linea.partes.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Quitar parte"
                            className="text-slate-400"
                            onClick={() =>
                              cambiarLinea(linea.key, {
                                partes: linea.partes.filter((otra) => otra.key !== parte.key),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline"
                      onClick={() => {
                        const nueva = parteVacia(formaDePagoInicial);
                        cambiarLinea(linea.key, { partes: [...linea.partes, nueva] });
                        enfocar(nueva.key);
                      }}
                    >
                      <Split className="h-3.5 w-3.5" />
                      Dividir: parte en otra forma de pago
                    </button>
                    {linea.partes.length > 1 && (
                      <p className="text-xs text-slate-500">
                        En total {cantidadConUnidad(cantidadLinea(linea), unidad)}.
                      </p>
                    )}
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
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="rounded-lg bg-slate-900 px-4 py-3 text-white">
          {reparto.porMetodo.size > 1 && (
            <div className="mb-2 space-y-1 border-b border-white/15 pb-2 text-sm text-slate-300">
              {[...reparto.porMetodo.entries()].map(([metodo, importe]) => (
                <div key={metodo} className="flex items-center justify-between">
                  <span>{PAYMENT_METHOD_LABELS[metodo]}</span>
                  <span className="tabular">{formatMoney(importe, currency)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm">Total de la venta</span>
            <span className="tabular text-xl font-bold">{formatMoney(total, currency)}</span>
          </div>
          {reparto.fiadoA.size > 0 && (
            <div
              className={cn(
                'mt-2 space-y-0.5 border-t border-white/15 pt-2 text-sm text-amber-200',
              )}
            >
              {[...reparto.fiadoA.entries()].map(([nombre, importe]) => (
                <div key={nombre} className="flex items-center justify-between">
                  <span>Fiado a {nombre}</span>
                  <span className="tabular font-semibold">{formatMoney(importe, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
