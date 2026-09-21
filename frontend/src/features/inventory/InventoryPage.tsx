import {
  ArchiveRestore,
  Check,
  History,
  PackagePlus,
  PackageX,
  Pencil,
  Plus,
  Scale,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  useCreateCategory,
  useDeleteCategory,
  useDeleteProduct,
  useProductCategories,
  useProducts,
  useUpdateCategory,
  useUpdateProduct,
  type ProductFilters,
} from './api';
import { MovementsDialog } from './MovementsDialog';
import { ProductFormDialog } from './ProductFormDialog';
import { StockDialog, type ModoStock } from './StockDialog';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { Product } from '@/shared/api/types';
import { formatMoney, formatQuantity, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog, Dialog } from '@/shared/ui/dialog';
import {
  Badge,
  EmptyState,
  ErrorMessage,
  Loading,
  Pagination,
} from '@/shared/ui/feedback';
import { Input, Select } from '@/shared/ui/field';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

/** Rojo si no queda nada; ámbar si está en o por debajo del mínimo. */
function tonoStock(producto: Product): 'neutral' | 'warning' | 'danger' {
  const stock = toNumber(producto.stock);
  const minimo = toNumber(producto.minStock);
  if (stock <= 0) return 'danger';
  if (minimo > 0 && stock <= minimo) return 'warning';
  return 'neutral';
}

/** Casilla de filtro: recuadro tocable en móvil, texto suelto en escritorio. */
const CASILLA =
  'flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0';

/** En la tarjeta el color no basta: el estado también se escribe. */
function etiquetaStock(producto: Product): string {
  const tono = tonoStock(producto);
  if (tono === 'danger') return 'Agotado';
  if (tono === 'warning') return 'Bajo mínimo';
  return 'En stock';
}

export function InventoryPage() {
  const { currency } = useAuth();
  const [filtros, setFiltros] = useState<ProductFilters>({
    search: '',
    categoryId: '',
    lowStock: false,
    isActive: true,
    page: 1,
    limit: 20,
  });
  const [formulario, setFormulario] = useState<{
    abierto: boolean;
    producto: Product | null;
  }>({ abierto: false, producto: null });
  const [stock, setStock] = useState<{
    abierto: boolean;
    producto: Product | null;
    modo: ModoStock;
  }>({ abierto: false, producto: null, modo: 'entrada' });
  const [historial, setHistorial] = useState<{
    abierto: boolean;
    producto: Product | null;
  }>({ abierto: false, producto: null });
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);
  const [aBorrar, setABorrar] = useState<Product | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const productos = useProducts(filtros);
  const categorias = useProductCategories();
  const borrar = useDeleteProduct();
  const actualizar = useUpdateProduct();

  function cambiarFiltros(cambios: Partial<ProductFilters>) {
    // Cualquier cambio de filtro vuelve a la primera pagina.
    setFiltros((previos) => ({ ...previos, ...cambios, page: cambios.page ?? 1 }));
  }

  function abrirStock(producto: Product, modo: ModoStock) {
    setStock({ abierto: true, producto, modo });
  }

  async function reactivar(producto: Product) {
    await actualizar.mutateAsync({
      id: producto.id,
      datos: { name: producto.name, isActive: true },
    });
    setAviso(`"${producto.name}" vuelve a estar activo.`);
  }

  /** Las mismas acciones en la tabla y en la tarjeta. */
  function acciones(producto: Product) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Entrada de mercancía"
          title="Entrada de mercancía"
          onClick={() => abrirStock(producto, 'entrada')}
        >
          <PackagePlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ajustar stock"
          title="Ajustar stock"
          onClick={() => abrirStock(producto, 'ajuste')}
        >
          <Scale className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Registrar mercancía dañada"
          title="Registrar mercancía dañada"
          asChild
        >
          {/* Se registra desde aquí porque es mirando el inventario cuando
              uno descubre que algo se rompió o se venció. */}
          <Link to={`/perdidas?producto=${producto.id}`}>
            <PackageX className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ver movimientos"
          title="Ver movimientos"
          onClick={() => setHistorial({ abierto: true, producto })}
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editar producto"
          title="Editar producto"
          onClick={() => setFormulario({ abierto: true, producto })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {producto.isActive ? (
          <Button
            variant="dangerGhost"
            size="icon"
            aria-label="Borrar o archivar producto"
            title="Borrar o archivar producto"
            onClick={() => setABorrar(producto)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reactivar producto"
            title="Reactivar producto"
            onClick={() => reactivar(producto)}
          >
            <ArchiveRestore className="h-4 w-4" />
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Qué tienes, qué te cuesta y qué te queda"
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setCategoriasAbiertas(true)}
            >
              <Tags className="h-4 w-4" />
              Categorías
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setFormulario({ abierto: true, producto: null })}
            >
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {/* En el celular: buscador y desplegable a ancho completo, y las dos
            casillas como botones anchos que se puedan tocar con el pulgar. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            className="w-full sm:h-8 sm:w-56 sm:py-0 sm:text-xs"
            placeholder="Buscar por nombre o código"
            value={filtros.search}
            onChange={(e) => cambiarFiltros({ search: e.target.value })}
          />
          <Select
            className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
            value={filtros.categoryId}
            onChange={(e) => cambiarFiltros({ categoryId: e.target.value })}
            aria-label="Categoría"
          >
            <option value="">Todas las categorías</option>
            {(categorias.data ?? []).map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <label className={CASILLA}>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-slate-300 accent-marca-600"
                checked={!!filtros.lowStock}
                onChange={(e) => cambiarFiltros({ lowStock: e.target.checked })}
              />
              Solo bajo mínimo
            </label>
            <label className={CASILLA}>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-slate-300 accent-marca-600"
                checked={filtros.isActive === false}
                onChange={(e) => cambiarFiltros({ isActive: !e.target.checked })}
              />
              Ver archivados
            </label>
          </div>
        </div>

        {aviso && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-marca-700">
            <span>{aviso}</span>
            <button
              type="button"
              onClick={() => setAviso(null)}
              aria-label="Cerrar aviso"
              className="shrink-0 text-marca-600 hover:text-marca-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <Card>
          {productos.isLoading ? (
            <Loading rows={6} />
          ) : productos.isError ? (
            <ErrorMessage
              error={productos.error}
              onRetry={() => productos.refetch()}
            />
          ) : !productos.data?.data.length ? (
            <EmptyState
              title={
                filtros.isActive === false
                  ? 'No hay productos archivados'
                  : filtros.lowStock
                    ? 'Nada por debajo del mínimo'
                    : 'Todavía no hay productos'
              }
              message="Da de alta lo que vendes y el stock se irá descontando solo con cada venta."
              action={
                <Button
                  onClick={() => setFormulario({ abierto: true, producto: null })}
                >
                  <Plus className="h-4 w-4" />
                  Nuevo producto
                </Button>
              }
            />
          ) : (
            <>
              <MobileList>
                {productos.data.data.map((producto) => (
                  <MobileCard
                    key={producto.id}
                    title={producto.name}
                    subtitle={
                      [producto.sku, producto.category?.name]
                        .filter(Boolean)
                        .join(' · ') || 'Sin categoría'
                    }
                    amount={`${formatQuantity(producto.stock)} ${producto.unit}`}
                    amountTone={
                      toNumber(producto.stock) <= 0 ? 'negative' : 'neutral'
                    }
                    badge={
                      <>
                        <Badge tone={tonoStock(producto)}>
                          {etiquetaStock(producto)}
                        </Badge>
                        {!producto.isActive && (
                          <Badge tone="neutral">Archivado</Badge>
                        )}
                      </>
                    }
                    details={[
                      {
                        label: 'Precio venta',
                        value: formatMoney(producto.salePrice, currency),
                      },
                      {
                        label: 'Costo',
                        value: formatMoney(producto.costPrice, currency),
                      },
                      {
                        label: 'Mínimo',
                        value: `${formatQuantity(producto.minStock)} ${producto.unit}`,
                      },
                    ]}
                    actions={acciones(producto)}
                  />
                ))}
              </MobileList>

              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>Producto</Th>
                      <Th>Categoría</Th>
                      <Th align="right">Precio venta</Th>
                      <Th align="right">Costo</Th>
                      <Th align="right">Stock</Th>
                      <Th align="right">Mínimo</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {productos.data.data.map((producto) => (
                      <Tr key={producto.id}>
                        <Td>
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">
                              {producto.name}
                            </span>
                            {!producto.isActive && (
                              <Badge tone="neutral">Archivado</Badge>
                            )}
                          </span>
                          {producto.sku && (
                            <span className="block text-xs text-slate-400">
                              {producto.sku}
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-slate-500">
                          {producto.category?.name ?? '—'}
                        </Td>
                        <Td align="right" className="font-medium text-slate-900">
                          {formatMoney(producto.salePrice, currency)}
                        </Td>
                        <Td align="right" className="text-slate-500">
                          {formatMoney(producto.costPrice, currency)}
                        </Td>
                        <Td align="right">
                          <Badge tone={tonoStock(producto)}>
                            {formatQuantity(producto.stock)} {producto.unit}
                          </Badge>
                        </Td>
                        <Td align="right" className="text-slate-500">
                          {formatQuantity(producto.minStock)}
                        </Td>
                        <Td align="right">
                          <div className="flex justify-end gap-1">
                            {acciones(producto)}
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrapper>

              <Pagination
                page={productos.data.meta.page}
                totalPages={productos.data.meta.totalPages}
                total={productos.data.meta.total}
                onPageChange={(page) => cambiarFiltros({ page })}
              />
            </>
          )}
        </Card>
      </div>

      <ProductFormDialog
        open={formulario.abierto}
        producto={formulario.producto}
        onOpenChange={(abierto) =>
          setFormulario((previo) => ({ ...previo, abierto }))
        }
      />

      <StockDialog
        open={stock.abierto}
        producto={stock.producto}
        modo={stock.modo}
        onOpenChange={(abierto) => setStock((previo) => ({ ...previo, abierto }))}
      />

      <MovementsDialog
        open={historial.abierto}
        producto={historial.producto}
        onOpenChange={(abierto) =>
          setHistorial((previo) => ({ ...previo, abierto }))
        }
      />

      <DialogoCategorias
        open={categoriasAbiertas}
        onOpenChange={setCategoriasAbiertas}
      />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title={`Borrar "${aBorrar?.name ?? ''}"`}
        message="Si el producto ya tiene ventas o movimientos no se borra: se archiva para no perder el historial."
        loading={borrar.isPending}
        onConfirm={async () => {
          if (!aBorrar) return;
          const resultado = await borrar.mutateAsync(aBorrar.id);
          setAviso(resultado.message);
          setABorrar(null);
        }}
      />
    </>
  );
}

/** Alta, renombrado y borrado de las categorías de producto. */
function DialogoCategorias({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const categorias = useProductCategories();
  const crear = useCreateCategory();
  const renombrar = useUpdateCategory();
  const borrar = useDeleteCategory();

  const [nueva, setNueva] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [error, setError] = useState<string | null>(null);

  function fallo(e: unknown, porDefecto: string) {
    setError(e instanceof ApiError ? e.detalle : porDefecto);
  }

  async function anadir() {
    setError(null);
    if (!nueva.trim()) return;
    try {
      await crear.mutateAsync(nueva.trim());
      setNueva('');
    } catch (e) {
      fallo(e, 'No se pudo crear la categoría');
    }
  }

  async function guardarNombre(id: string) {
    setError(null);
    if (!nombreEditado.trim()) return;
    try {
      await renombrar.mutateAsync({ id, name: nombreEditado.trim() });
      setEditandoId(null);
    } catch (e) {
      fallo(e, 'No se pudo renombrar la categoría');
    }
  }

  async function eliminar(id: string) {
    setError(null);
    try {
      await borrar.mutateAsync(id);
    } catch (e) {
      // El API responde 409 con el número de productos que la usan.
      fallo(e, 'No se pudo borrar la categoría');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Categorías de producto"
      description="Para agrupar el inventario y ver de dónde sale el margen."
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            className="min-w-0"
            value={nueva}
            maxLength={80}
            placeholder="Nueva categoría (p. ej. Bebidas)"
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') anadir();
            }}
          />
          <Button
            className="shrink-0"
            onClick={anadir}
            disabled={crear.isPending || !nueva.trim()}
          >
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {categorias.isLoading ? (
          <Loading rows={3} />
        ) : categorias.isError ? (
          <ErrorMessage
            error={categorias.error}
            onRetry={() => categorias.refetch()}
          />
        ) : !categorias.data?.length ? (
          <EmptyState
            title="Aún no hay categorías"
            message="Con dos o tres basta: bebidas, aseo, snacks..."
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {categorias.data.map((categoria) => (
              <li
                key={categoria.id}
                className="flex items-center gap-2 px-3 py-2"
              >
                {editandoId === categoria.id ? (
                  <>
                    <Input
                      autoFocus
                      className="min-w-0 flex-1"
                      maxLength={80}
                      aria-label="Nombre de la categoría"
                      value={nombreEditado}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') guardarNombre(categoria.id);
                        if (e.key === 'Escape') setEditandoId(null);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Guardar nombre"
                      disabled={renombrar.isPending}
                      onClick={() => guardarNombre(categoria.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Cancelar"
                      onClick={() => setEditandoId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                      {categoria.name}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {categoria._count?.products ?? 0} producto
                      {(categoria._count?.products ?? 0) === 1 ? '' : 's'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Renombrar categoría"
                      onClick={() => {
                        setEditandoId(categoria.id);
                        setNombreEditado(categoria.name);
                        setError(null);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="dangerGhost"
                      size="icon"
                      aria-label="Borrar categoría"
                      disabled={borrar.isPending}
                      onClick={() => eliminar(categoria.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
