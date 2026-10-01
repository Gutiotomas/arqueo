import { useQuery } from '@tanstack/react-query';
import { Minus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useSuppliers } from './api';
import { useCreateOrder, useUpdateOrder, type OrderPayload } from './orders-api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, api } from '@/shared/api/client';
import type { Paginated, Product, PurchaseOrder } from '@/shared/api/types';
import { today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { cantidadConUnidad, pasoCantidad } from '@/shared/lib/unidades';
import { useEnfocarNuevo } from '@/shared/lib/use-enfocar-nuevo';
import { ELEGIR_PRODUCTO, ETIQUETA_PRODUCTO_LIBRE, PRODUCTO_LIBRE } from '@/shared/lib/productos';
import { AddRowButton } from '@/shared/ui/add-row-button';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';
import { cn } from '@/shared/lib/cn';

/** Etiqueta pequeña de cada campo de la tarjeta de producto. */
const ETIQUETA = 'mb-1 block text-xs font-medium text-slate-500';

/** Valor del desplegable de proveedor cuando se va a escribir uno nuevo. */
const PROVEEDOR_NUEVO = '__nuevo__';

interface Linea {
  key: string;
  productId: string;
  description: string;
  quantity: number | '';
  unitPrice: number | '';
}

function lineaVacia(): Linea {
  return { key: crypto.randomUUID(), productId: '', description: '', quantity: '', unitPrice: '' };
}

/** Las dos listas del pedido: lo que se pide y lo que el proveedor descuenta. */
type Lista = 'pedido' | 'descuento';

/**
 * El pedido al proveedor, como la cuenta a mano: cantidad, producto (del
 * inventario o libre), valor unitario y total. Debajo, con el mismo detalle,
 * lo que el proveedor descuenta (un cruce, una devolución, una promoción):
 * el PDF es la cuenta de lo que se le va a pagar, así que tiene que verse.
 * No mueve inventario ni deuda.
 */
export function OrderFormDialog({
  open,
  onOpenChange,
  pedido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedido?: PurchaseOrder | null;
}) {
  const { currency } = useAuth();
  const crear = useCreateOrder();
  const enfocar = useEnfocarNuevo();
  const actualizar = useUpdateOrder();
  const proveedores = useSuppliers();

  const [fecha, setFecha] = useState(today());
  const [proveedorId, setProveedorId] = useState('');
  const [proveedorNuevo, setProveedorNuevo] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [descuentos, setDescuentos] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);

  const productos = useQuery({
    queryKey: ['products', 'para-pedido'],
    queryFn: () =>
      api.get<Paginated<Product>>('/products', { limit: 200, isActive: true }),
    enabled: open,
  });
  const porId = useMemo(
    () => new Map((productos.data?.data ?? []).map((p) => [p.id, p])),
    [productos.data],
  );

  // Productos de pedido que ya no están activos en el inventario (se
  // archivaron después). Siguen en el desplegable para que al editar no se
  // pierda qué producto era.
  const archivados = useMemo(() => {
    if (!productos.data) return [];
    const vistos = new Map<string, { id: string; name: string; unit: string }>();
    for (const item of pedido?.items ?? []) {
      if (item.product && !porId.has(item.product.id)) vistos.set(item.product.id, item.product);
    }
    return [...vistos.values()];
  }, [pedido, productos.data, porId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (pedido) {
      setFecha(pedido.date.slice(0, 10));
      setProveedorId(pedido.supplier?.id ?? '');
      setProveedorNuevo('');
      setNotas(pedido.notes ?? '');
      const aLinea = (item: PurchaseOrder['items'][number]): Linea => ({
        key: item.id,
        productId: item.productId ?? PRODUCTO_LIBRE,
        description: item.productId ? '' : item.description,
        quantity: toNumber(item.quantity),
        unitPrice: toNumber(item.unitPrice),
      });
      setLineas(pedido.items.filter((item) => !item.isDiscount).map(aLinea));
      setDescuentos(pedido.items.filter((item) => item.isDiscount).map(aLinea));
    } else {
      setFecha(today());
      setProveedorId('');
      setProveedorNuevo('');
      setNotas('');
      setLineas([lineaVacia()]);
      setDescuentos([]);
    }
  }, [open, pedido]);

  const setDe = (lista: Lista) => (lista === 'pedido' ? setLineas : setDescuentos);

  function cambiarLinea(lista: Lista, key: string, cambios: Partial<Linea>) {
    setDe(lista)((previas) =>
      previas.map((linea) => (linea.key === key ? { ...linea, ...cambios } : linea)),
    );
  }

  /** Al elegir producto se propone el costo que ya está guardado en inventario. */
  function elegirProducto(lista: Lista, key: string, productId: string) {
    const producto = porId.get(productId);
    cambiarLinea(lista, key, {
      productId,
      description: '',
      unitPrice: producto ? toNumber(producto.costPrice) : '',
    });
  }

  const subtotal = (linea: Linea) => Number(linea.quantity || 0) * Number(linea.unitPrice || 0);
  const suma = lineas.reduce((acumulado, linea) => acumulado + subtotal(linea), 0);
  const descuento = descuentos.reduce((acumulado, linea) => acumulado + subtotal(linea), 0);
  const total = suma - descuento;

  async function guardar() {
    setError(null);

    // Sin elegir nada, la tarjeta vacía no cuenta.
    const elegidas = lineas.filter((linea) => linea.productId);
    const descontadas = descuentos.filter((linea) => linea.productId);
    const sinNombre = [...elegidas, ...descontadas].find(
      (linea) => linea.productId === PRODUCTO_LIBRE && !linea.description.trim(),
    );
    if (sinNombre) {
      setError(
        descontadas.includes(sinNombre)
          ? 'Escribe qué es lo que te descuenta'
          : `Escribe qué es el producto ${lineas.indexOf(sinNombre) + 1}`,
      );
      return;
    }
    const aItem = (linea: Linea, isDiscount: boolean) => ({
      ...(linea.productId === PRODUCTO_LIBRE
        ? { description: linea.description.trim() }
        : { productId: linea.productId }),
      quantity: Number(linea.quantity || 0),
      unitPrice: Number(linea.unitPrice || 0),
      ...(isDiscount ? { isDiscount: true } : {}),
    });
    const items = [
      ...elegidas.map((linea) => aItem(linea, false)),
      ...descontadas.map((linea) => aItem(linea, true)),
    ];

    if (!elegidas.length) {
      setError('Añade al menos un producto');
      return;
    }
    if (items.some((item) => item.quantity <= 0)) {
      setError('Las cantidades deben ser mayores que cero');
      return;
    }
    if (proveedorId === PROVEEDOR_NUEVO && !proveedorNuevo.trim()) {
      setError('Escribe el nombre del proveedor nuevo');
      return;
    }
    if (descuento > suma) {
      setError('Lo que te descuenta no puede ser mayor que la suma de lo que pides');
      return;
    }

    const datos: OrderPayload = {
      date: fecha,
      ...(proveedorId === PROVEEDOR_NUEVO
        ? { supplierName: proveedorNuevo.trim() }
        : proveedorId
          ? { supplierId: proveedorId }
          : {}),
      ...(notas.trim() ? { notes: notas.trim() } : {}),
      items,
    };

    try {
      if (pedido) {
        await actualizar.mutateAsync({ id: pedido.id, datos });
      } else {
        await crear.mutateAsync(datos);
      }
      onOpenChange(false);
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar el pedido');
    }
  }

  /** Una tarjeta de línea: igual para lo que se pide y para lo que descuenta. */
  function tarjeta(lista: Lista, linea: Linea, indice: number) {
    const producto = porId.get(linea.productId);
    const archivado = archivados.find((a) => a.id === linea.productId);
    const paso = pasoCantidad(producto?.unit ?? archivado?.unit);
    
    const unidad = producto?.unit ?? archivado?.unit ?? 'ud';
    return (
      <div
        key={linea.key}
        data-nuevo={linea.key}
        className={cn(
          'rounded-lg border p-3',
          lista === 'descuento'
            ? 'border-emerald-200 bg-emerald-50/50'
            : 'border-slate-200 bg-slate-50/60',
        )}
      >
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-12">
            <div className="col-span-2 sm:col-span-6">
              <span className={ETIQUETA}>
                {lista === 'descuento' ? 'Qué te descuenta' : `Producto ${lineas.length > 1 ? indice + 1 : ''}`}
              </span>
              <Select
                value={linea.productId}
                onChange={(e) => elegirProducto(lista, linea.key, e.target.value)}
                aria-label="Producto"
              >
                <option value="">{ELEGIR_PRODUCTO}</option>
                {(productos.data?.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · quedan {cantidadConUnidad(p.stock, p.unit)}
                  </option>
                ))}
                {archivados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (archivado)
                  </option>
                ))}
                <option value={PRODUCTO_LIBRE}>{ETIQUETA_PRODUCTO_LIBRE}</option>
              </Select>
              {linea.productId === PRODUCTO_LIBRE && (
                <Input
                  className="mt-2"
                  placeholder="¿Qué es? (p. ej. Quesito hoja)"
                  aria-label="Descripción"
                  value={linea.description}
                  onChange={(e) => cambiarLinea(lista, linea.key, { description: e.target.value })}
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <span className={ETIQUETA}>Cantidad</span>
              <Input
                type="number"
                min={paso.min}
                step={paso.step}
                inputMode={paso.inputMode}
                aria-label="Cantidad"
                placeholder={unidad}
                className="text-right tabular"
                value={linea.quantity}
                onChange={(e) =>
                  cambiarLinea(lista, linea.key, {
                    quantity: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="sm:col-span-4">
              <span className={ETIQUETA}>Vr. unidad</span>
              <MoneyInput
                aria-label="Valor unitario"
                value={linea.unitPrice}
                onValueChange={(valor) => cambiarLinea(lista, linea.key, { unitPrice: valor })}
              />
            </div>
          </div>
          {(lista === 'descuento' || lineas.length > 1) && (
            <Button
              variant="dangerGhost"
              size="icon"
              className="mt-5 shrink-0"
              aria-label={lista === 'descuento' ? 'Quitar descuento' : 'Quitar producto'}
              onClick={() =>
                setDe(lista)((previas) => previas.filter((otra) => otra.key !== linea.key))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
          <span className="text-slate-500">
            {lista === 'descuento' ? 'Te descuenta' : 'Vr. total'}
          </span>
          <span className="tabular font-semibold text-slate-900">
            {lista === 'descuento' ? '− ' : ''}
            {formatMoney(subtotal(linea), currency)}
          </span>
        </div>
      </div>
    );
  }

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={pedido ? `Editar pedido No. ${pedido.number}` : 'Nuevo pedido'}
      description="Lo que le vas a pedir al proveedor. No mueve el inventario: eso pasa cuando llega y registras la compra."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar pedido'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
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
                aria-label="Nombre del proveedor nuevo"
                value={proveedorNuevo}
                onChange={(e) => setProveedorNuevo(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Lo que pides</span>

          <div className="space-y-3">
            {lineas.map((linea, indice) => tarjeta('pedido', linea, indice))}

            <AddRowButton
              onClick={() => {
                const nueva = lineaVacia();
                setLineas((previas) => [...previas, nueva]);
                enfocar(nueva.key);
              }}
            >
              Añadir producto
            </AddRowButton>
          </div>
        </div>

        {/* La cuenta que se le manda al proveedor: lo que te descuenta va con
            el mismo detalle (producto o descripción, cantidad y valor). */}
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Lo que te descuenta (opcional)
          </span>
          <p className="mb-2 text-xs text-slate-500">
            Un cruce, una devolución, una promoción: se resta del total y sale en el PDF.
          </p>
          <div className="space-y-3">
            {descuentos.map((linea, indice) => tarjeta('descuento', linea, indice))}
            <AddRowButton
              secundario
              icon={<Minus className="h-4 w-4" />}
              onClick={() => {
                const nueva = lineaVacia();
                setDescuentos((previas) => [...previas, nueva]);
                enfocar(nueva.key);
              }}
            >
              {descuentos.length ? 'Añadir otro descuento' : 'El proveedor me descuenta algo'}
            </AddRowButton>
          </div>
        </div>

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Para el lunes, dejar en la tienda..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="rounded-lg bg-slate-900 px-4 py-3 text-white">
          {descuento > 0 && (
            <div className="mb-2 space-y-1 border-b border-white/15 pb-2 text-sm text-slate-300">
              <div className="flex justify-between">
                <span>Suma de lo que pides</span>
                <span className="tabular">{formatMoney(suma, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Te descuenta</span>
                <span className="tabular">− {formatMoney(descuento, currency)}</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm">Total del pedido</span>
            <span className="tabular text-xl font-bold">{formatMoney(total, currency)}</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
