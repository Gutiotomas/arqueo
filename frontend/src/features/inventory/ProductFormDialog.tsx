import { useEffect, useState } from 'react';

import {
  useCreateProduct,
  useProductCategories,
  useUpdateProduct,
  type ProductPayload,
} from './api';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { Product } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatMoney, formatPercent, toNumber } from '@/shared/lib/money';
import { pasoCantidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/shared/ui/field';

export function ProductFormDialog({
  open,
  onOpenChange,
  producto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto?: Product | null;
}) {
  const { currency } = useAuth();
  const categorias = useProductCategories();
  const crear = useCreateProduct();
  const actualizar = useUpdateProduct();

  const [nombre, setNombre] = useState('');
  const [sku, setSku] = useState('');
  const [unidad, setUnidad] = useState('ud');
  const [categoriaId, setCategoriaId] = useState('');
  const [costo, setCosto] = useState<number | ''>('');
  const [venta, setVenta] = useState<number | ''>('');
  const [stockInicial, setStockInicial] = useState<number | ''>('');
  const [minimo, setMinimo] = useState<number | ''>('');
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: o los datos del producto que se edita, o un formulario limpio.
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (producto) {
      setNombre(producto.name);
      setSku(producto.sku ?? '');
      setUnidad(producto.unit);
      setCategoriaId(producto.categoryId ?? '');
      setCosto(toNumber(producto.costPrice));
      setVenta(toNumber(producto.salePrice));
      setStockInicial('');
      setMinimo(toNumber(producto.minStock));
      setActivo(producto.isActive);
    } else {
      setNombre('');
      setSku('');
      setUnidad('ud');
      setCategoriaId('');
      setCosto('');
      setVenta('');
      setStockInicial('');
      setMinimo('');
      setActivo(true);
    }
  }, [open, producto]);

  // El margen es el número que de verdad le importa al dueño del negocio.
  const margen = Number(venta || 0) - Number(costo || 0);
  const porcentaje = Number(venta || 0) > 0 ? (margen / Number(venta)) * 100 : null;

  async function guardar() {
    setError(null);

    if (!nombre.trim()) {
      setError('El nombre del producto es obligatorio');
      return;
    }

    const datos: ProductPayload = {
      name: nombre.trim(),
      sku: sku.trim(),
      unit: unidad.trim() || 'ud',
      categoryId: categoriaId || null,
      costPrice: Number(costo || 0),
      salePrice: Number(venta || 0),
      minStock: Number(minimo || 0),
    };

    try {
      if (producto) {
        await actualizar.mutateAsync({
          id: producto.id,
          datos: { ...datos, isActive: activo },
        });
      } else {
        await crear.mutateAsync({ ...datos, stock: Number(stockInicial || 0) });
      }
      onOpenChange(false);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar el producto',
      );
    }
  }

  const guardando = crear.isPending || actualizar.isPending;
  // El stock se escribe en la unidad que se está poniendo arriba.
  const paso = pasoCantidad(unidad);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={producto ? 'Editar producto' : 'Nuevo producto'}
      description={
        producto
          ? 'El stock no se toca aquí: usa una entrada o un ajuste.'
          : 'Lo mínimo es el nombre; el resto lo puedes completar después.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar producto'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <Input
              value={nombre}
              placeholder="Gaseosa 1.5 L"
              onChange={(e) => setNombre(e.target.value)}
            />
          </Field>

          <Field label="Código o SKU (opcional)">
            <Input
              value={sku}
              placeholder="GAS-15"
              onChange={(e) => setSku(e.target.value)}
            />
          </Field>

          <Field label="Unidad" hint="ud, kg, lt, caja...">
            <Input
              value={unidad}
              maxLength={10}
              placeholder="ud"
              onChange={(e) => setUnidad(e.target.value)}
            />
          </Field>

          <Field label="Categoría" className="sm:col-span-2">
            <Select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Sin categoría</option>
              {(categorias.data ?? []).map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Precio de costo" hint="Lo que te cuesta a ti">
            <MoneyInput value={costo} onValueChange={setCosto} />
          </Field>

          <Field label="Precio de venta" hint="Lo que cobras al cliente">
            <MoneyInput value={venta} onValueChange={setVenta} />
          </Field>

          {!producto && (
            <Field label="Stock inicial" hint="Lo que tienes hoy en la estantería">
              <Input
                type="number"
                min="0"
                step={paso.step}
                inputMode={paso.inputMode}
                className="text-right tabular"
                value={stockInicial}
                onChange={(e) =>
                  setStockInicial(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </Field>
          )}

          <Field label="Stock mínimo" hint="Te avisamos cuando baje de aquí">
            <Input
              type="number"
              min="0"
              step={paso.step}
              inputMode={paso.inputMode}
              className="text-right tabular"
              value={minimo}
              onChange={(e) =>
                setMinimo(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </Field>
        </div>

        {producto && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-marca-600"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Producto activo (los archivados no salen en la lista ni en las ventas)
          </label>
        )}

        {margen < 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Estás vendiendo por debajo del costo: cada venta te resta dinero.
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm">Margen por {unidad.trim() || 'ud'}</span>
          <span className="flex items-baseline gap-2">
            <span className="tabular text-xl font-bold">
              {formatMoney(margen, currency)}
            </span>
            {porcentaje !== null && (
              <span
                className={cn(
                  'tabular text-sm font-medium',
                  margen >= 0 ? 'text-emerald-300' : 'text-red-300',
                )}
              >
                {formatPercent(porcentaje)}
              </span>
            )}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
