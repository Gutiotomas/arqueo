import { ChevronDown, ChevronUp, FileDown, PackageCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';

import { useSuppliers } from './api';
import { OrderFormDialog } from './OrderFormDialog';
import { downloadOrderPdf, useDeleteOrder, useOrders, type OrderFilters } from './orders-api';
import { PESTANAS_COMPRAS } from './pestanas';
import { PurchaseFormDialog, type CompraInicial } from './PurchaseFormDialog';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { PurchaseOrder } from '@/shared/api/types';
import { formatDate, startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { cantidadConUnidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { EmptyState, ErrorMessage, Loading, Pagination } from '@/shared/ui/feedback';
import { Select } from '@/shared/ui/field';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { PageTabs } from '@/shared/ui/page-tabs';
import { RangePicker } from '@/shared/ui/range-picker';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

/** Las líneas del pedido, como en la cuenta a mano. */
function DetallePedido({ pedido }: { pedido: PurchaseOrder }) {
  const { currency } = useAuth();
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <ul className="space-y-1">
        {pedido.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 text-slate-700">
              <span className="tabular text-slate-500">
                {cantidadConUnidad(item.quantity, item.product?.unit)} ×
              </span>{' '}
              {item.description}
              {!item.productId && (
                <span className="ml-1 text-xs text-slate-400">(sin inventario)</span>
              )}
              <span className="block text-xs text-slate-400">
                {formatMoney(item.unitPrice, currency)} la unidad
              </span>
            </span>
            <span className="tabular shrink-0 font-medium text-slate-900">
              {formatMoney(item.subtotal, currency)}
            </span>
          </li>
        ))}
      </ul>
      {pedido.notes && (
        <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">{pedido.notes}</p>
      )}
    </div>
  );
}

/**
 * Los pedidos al proveedor. Se escriben aquí, se mandan en PDF y, cuando llega
 * la mercancía, se registran como compra sin volver a teclear.
 */
export function OrdersPage() {
  const { currency } = useAuth();
  const [filtros, setFiltros] = useState<OrderFilters>({
    from: startOfMonth(),
    to: today(),
    supplierId: '',
    page: 1,
    limit: 20,
  });
  const [formulario, setFormulario] = useState<{ abierto: boolean; pedido: PurchaseOrder | null }>({
    abierto: false,
    pedido: null,
  });
  const [compra, setCompra] = useState<CompraInicial | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<PurchaseOrder | null>(null);

  const pedidos = useOrders(filtros);
  const proveedores = useSuppliers();
  const borrar = useDeleteOrder();

  function cambiarFiltros(cambios: Partial<OrderFilters>) {
    setFiltros((previos) => ({ ...previos, ...cambios, page: cambios.page ?? 1 }));
  }

  async function descargar(pedido: PurchaseOrder) {
    setErrorAccion(null);
    setDescargando(pedido.id);
    try {
      await downloadOrderPdf(pedido);
    } catch (fallo) {
      setErrorAccion(fallo instanceof ApiError ? fallo.detalle : 'No se pudo generar el PDF');
    } finally {
      setDescargando(null);
    }
  }

  /** Solo las líneas con producto del inventario pasan a la compra. */
  function registrarComoCompra(pedido: PurchaseOrder) {
    const conProducto = pedido.items.filter((item) => item.productId);
    const sueltas = pedido.items.length - conProducto.length;
    setCompra({
      supplierId: pedido.supplier?.id,
      notes: `Pedido No. ${pedido.number}${sueltas > 0 ? ` (${sueltas} línea${sueltas === 1 ? '' : 's'} sin producto en inventario no pasaron)` : ''}`,
      items: conProducto.map((item) => ({
        productId: item.productId!,
        quantity: toNumber(item.quantity),
        unitCost: toNumber(item.unitPrice),
      })),
    });
  }

  function acciones(pedido: PurchaseOrder) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => descargar(pedido)}
          disabled={descargando === pedido.id}
        >
          <FileDown className="h-4 w-4" />
          {descargando === pedido.id ? 'Generando...' : 'PDF'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Registrar como compra"
          title="Ya llegó: registrar como compra"
          onClick={() => registrarComoCompra(pedido)}
        >
          <PackageCheck className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={detalleId === pedido.id ? 'Ocultar detalle' : 'Ver detalle'}
          onClick={() => setDetalleId(detalleId === pedido.id ? null : pedido.id)}
        >
          {detalleId === pedido.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editar pedido"
          onClick={() => setFormulario({ abierto: true, pedido })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="dangerGhost"
          size="icon"
          aria-label="Borrar pedido"
          onClick={() => setABorrar(pedido)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Compras"
        description="Lo que le pides al proveedor, listo para mandárselo en PDF"
        action={
          <Button className="w-full sm:w-auto" onClick={() => setFormulario({ abierto: true, pedido: null })}>
            <Plus className="h-4 w-4" />
            Nuevo pedido
          </Button>
        }
      />
      <PageTabs label="Compras o pedidos" tabs={PESTANAS_COMPRAS} />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <RangePicker
            className="w-full sm:w-auto"
            value={{ from: filtros.from ?? '', to: filtros.to ?? '' }}
            onChange={(rango) => cambiarFiltros(rango)}
          />
          <Select
            className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
            value={filtros.supplierId}
            onChange={(e) => cambiarFiltros({ supplierId: e.target.value })}
            aria-label="Proveedor"
          >
            <option value="">Todos los proveedores</option>
            {(proveedores.data ?? []).map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.name}
              </option>
            ))}
          </Select>
        </div>

        {errorAccion && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorAccion}</p>
        )}

        <Card>
          {pedidos.isLoading ? (
            <Loading rows={5} />
          ) : pedidos.isError ? (
            <ErrorMessage error={pedidos.error} onRetry={() => pedidos.refetch()} />
          ) : !pedidos.data?.data.length ? (
            <EmptyState
              title="No hay pedidos con estos filtros"
              message="Escribe lo que necesitas pedir, con cantidades y precios, y descárgalo en PDF para el proveedor."
              action={
                <Button onClick={() => setFormulario({ abierto: true, pedido: null })}>
                  <Plus className="h-4 w-4" />
                  Nuevo pedido
                </Button>
              }
            />
          ) : (
            <>
              <MobileList>
                {pedidos.data.data.map((pedido) => (
                  <Fragment key={pedido.id}>
                    <MobileCard
                      title={`Pedido No. ${pedido.number}`}
                      subtitle={`${formatDate(pedido.date)} · ${pedido.supplier?.name ?? 'Sin proveedor'} · ${pedido.items.length} producto${pedido.items.length === 1 ? '' : 's'}`}
                      amount={formatMoney(pedido.total, currency)}
                      actions={acciones(pedido)}
                    />
                    {detalleId === pedido.id && (
                      <li className="px-4 pb-3">
                        <DetallePedido pedido={pedido} />
                      </li>
                    )}
                  </Fragment>
                ))}
              </MobileList>

              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>No.</Th>
                      <Th>Fecha</Th>
                      <Th>Proveedor</Th>
                      <Th align="right">Productos</Th>
                      <Th align="right">Total</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.data.data.map((pedido) => (
                      <Fragment key={pedido.id}>
                        <Tr>
                          <Td className="font-medium text-slate-900">{pedido.number}</Td>
                          <Td className="whitespace-nowrap">{formatDate(pedido.date)}</Td>
                          <Td>{pedido.supplier?.name ?? <span className="text-slate-400">Sin proveedor</span>}</Td>
                          <Td align="right">{pedido.items.length}</Td>
                          <Td align="right" className="font-semibold text-slate-900">
                            {formatMoney(pedido.total, currency)}
                          </Td>
                          <Td align="right">
                            <div className="flex justify-end gap-1">{acciones(pedido)}</div>
                          </Td>
                        </Tr>
                        {detalleId === pedido.id && (
                          <tr>
                            <td colSpan={6} className="border-b border-slate-100 px-4 pb-3">
                              <DetallePedido pedido={pedido} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </Table>
              </TableWrapper>

              <Pagination
                page={pedidos.data.meta.page}
                totalPages={pedidos.data.meta.totalPages}
                total={pedidos.data.meta.total}
                onPageChange={(page) => cambiarFiltros({ page })}
              />
            </>
          )}
        </Card>
      </div>

      <OrderFormDialog
        open={formulario.abierto}
        pedido={formulario.pedido}
        onOpenChange={(abierto) => setFormulario((previo) => ({ ...previo, abierto }))}
      />

      <PurchaseFormDialog
        open={!!compra}
        inicial={compra}
        onOpenChange={(abierto) => !abierto && setCompra(null)}
      />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title={`Borrar el pedido No. ${aBorrar?.number ?? ''}`}
        message="Solo se borra el pedido. Si ya lo registraste como compra, la compra se queda."
        loading={borrar.isPending}
        onConfirm={async () => {
          if (!aBorrar) return;
          await borrar.mutateAsync(aBorrar.id);
          setABorrar(null);
        }}
      />
    </>
  );
}
