import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HandCoins,
  Plus,
  Trash2,
} from 'lucide-react';
import { Fragment, useState } from 'react';

import {
  useDeletePayment,
  useDeletePurchase,
  usePurchases,
  useSupplierDebt,
  useSuppliers,
  type PurchaseFilters,
  type PurchaseStatusFilter,
} from './api';
import { OpeningBalanceDialog } from './OpeningBalanceDialog';
import { PaymentDialog } from './PaymentDialog';
import { PurchaseFormDialog } from './PurchaseFormDialog';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import {
  PAYMENT_METHOD_LABELS,
  type Purchase,
  type PurchasePayment,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate, startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney, formatQuantity, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import {
  Badge,
  EmptyState,
  ErrorMessage,
  Loading,
  Pagination,
} from '@/shared/ui/feedback';
import { Select } from '@/shared/ui/field';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { RangePicker } from '@/shared/ui/range-picker';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

const ESTADOS: { value: PurchaseStatusFilter | ''; label: string }[] = [
  { value: '', label: 'Todas las compras' },
  { value: 'unpaid', label: 'Las que se deben' },
  { value: 'pending', label: 'Pendientes (sin abonar)' },
  { value: 'partial', label: 'Abonadas a medias' },
  { value: 'paid', label: 'Pagadas' },
];

const ETIQUETA_ESTADO: Record<Purchase['status'], string> = {
  pending: 'Pendiente',
  partial: 'Abonada',
  paid: 'Pagada',
};

const TONO_ESTADO: Record<Purchase['status'], 'success' | 'warning' | 'danger'> = {
  pending: 'danger',
  partial: 'warning',
  paid: 'success',
};

function filtrosIniciales(): PurchaseFilters {
  return {
    from: startOfMonth(),
    to: today(),
    supplierId: '',
    status: '',
    page: 1,
    limit: 20,
  };
}

/** El proveedor ya tendría que haber cobrado y todavía se le debe algo. */
function estaVencida(compra: Purchase): boolean {
  if (!compra.dueDate || toNumber(compra.balance) <= 0) return false;
  return compra.dueDate.slice(0, 10) < today();
}

/** Lo que se compró y lo que se ha ido abonando, desplegado bajo la compra. */
function DetalleCompra({
  compra,
  onBorrarAbono,
}: {
  compra: Purchase;
  onBorrarAbono: (pago: PurchasePayment) => void;
}) {
  const { currency } = useAuth();

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      {compra.isOpeningBalance ? (
        <p className="text-sm text-slate-600">
          Deuda de antes de usar Arqueo, por mercancía que ya no está. No movió el
          inventario.
        </p>
      ) : (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Mercancía que entró al inventario
          </p>
          <ul className="space-y-1.5">
            {compra.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="text-slate-700">
                    <span className="tabular text-slate-500">
                      {formatQuantity(item.quantity)} {item.product.unit} ×
                    </span>{' '}
                    {item.product.name}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {formatMoney(item.unitCost, currency)} por {item.product.unit}
                  </span>
                </span>
                <span className="tabular shrink-0 font-medium text-slate-900">
                  {formatMoney(item.subtotal, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Abonos al proveedor
        </p>
        {compra.payments.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no has abonado nada de esta{' '}
            {compra.isOpeningBalance ? 'deuda' : 'compra'}.
          </p>
        ) : (
          <ul className="space-y-1">
            {compra.payments.map((pago) => (
              <li
                key={pago.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="text-slate-700">
                    {formatDate(pago.date)} ·{' '}
                    {PAYMENT_METHOD_LABELS[pago.paymentMethod]}
                  </span>
                  {pago.notes && (
                    <span className="block text-xs text-slate-400">{pago.notes}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="tabular font-medium text-slate-900">
                    {formatMoney(pago.amount, currency)}
                  </span>
                  <Button
                    variant="dangerGhost"
                    size="icon"
                    aria-label="Borrar abono"
                    onClick={() => onBorrarAbono(pago)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(compra.dueDate || compra.notes) && (
        <div className="border-t border-slate-200 pt-2 text-xs text-slate-500">
          {compra.dueDate && (
            <p className={cn(estaVencida(compra) && 'font-medium text-red-600')}>
              {estaVencida(compra) ? 'Venció el ' : 'Vence el '}
              {formatDate(compra.dueDate)}
            </p>
          )}
          {compra.notes && <p className="mt-0.5">{compra.notes}</p>}
        </div>
      )}
    </div>
  );
}

export function PurchasesPage() {
  const { currency } = useAuth();
  const [filtros, setFiltros] = useState<PurchaseFilters>(filtrosIniciales);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [deudaAnteriorAbierta, setDeudaAnteriorAbierta] = useState(false);
  const [aAbonar, setAAbonar] = useState<Purchase | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<
    | { tipo: 'compra'; compra: Purchase }
    | { tipo: 'abono'; compra: Purchase; pago: PurchasePayment }
    | null
  >(null);

  const compras = usePurchases(filtros);
  const deuda = useSupplierDebt();
  const proveedores = useSuppliers();
  const borrarCompra = useDeletePurchase();
  const borrarAbono = useDeletePayment();

  function cambiarFiltros(cambios: Partial<PurchaseFilters>) {
    // Cualquier cambio de filtro vuelve a la primera página.
    setFiltros((previos) => ({ ...previos, ...cambios, page: cambios.page ?? 1 }));
  }

  /** Desde la deuda se salta a las compras de ese proveedor, sin límite de fechas. */
  function verProveedor(supplierId: string | null) {
    setFiltros({
      ...filtrosIniciales(),
      from: undefined,
      to: undefined,
      supplierId: supplierId ?? '',
      status: 'unpaid',
    });
  }

  async function confirmarBorrado() {
    if (!aBorrar) return;
    setErrorAccion(null);
    try {
      if (aBorrar.tipo === 'compra') {
        await borrarCompra.mutateAsync(aBorrar.compra.id);
      } else {
        await borrarAbono.mutateAsync({
          purchaseId: aBorrar.compra.id,
          paymentId: aBorrar.pago.id,
        });
      }
      setABorrar(null);
    } catch (fallo) {
      // El API es quien sabe si la mercancía ya se vendió: se enseña su motivo.
      setErrorAccion(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo borrar',
      );
      setABorrar(null);
    }
  }

  const totalDeuda = toNumber(deuda.data?.total);
  const vencido = toNumber(deuda.data?.overdue);
  const hayFiltros =
    Boolean(filtros.supplierId) || Boolean(filtros.status) || !filtros.from;

  /** Las mismas acciones en la tabla y en la tarjeta del celular. */
  function acciones(compra: Purchase) {
    const saldo = toNumber(compra.balance);
    return (
      <>
        {saldo > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setAAbonar(compra)}>
            <HandCoins className="h-4 w-4" />
            Abonar
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={detalleId === compra.id ? 'Ocultar detalle' : 'Ver detalle'}
          onClick={() => setDetalleId(detalleId === compra.id ? null : compra.id)}
        >
          {detalleId === compra.id ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="dangerGhost"
          size="icon"
          aria-label={compra.isOpeningBalance ? 'Borrar deuda anterior' : 'Borrar compra'}
          onClick={() => setABorrar({ tipo: 'compra', compra })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </>
    );
  }

  function estados(compra: Purchase) {
    return (
      <>
        {compra.isOpeningBalance && <Badge tone="info">Deuda anterior</Badge>}
        <Badge tone={TONO_ESTADO[compra.status]}>{ETIQUETA_ESTADO[compra.status]}</Badge>
        {estaVencida(compra) && <Badge tone="danger">Vencida</Badge>}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Compras"
        description="La mercancía que compras es inventario, no gasto. Aquí también ves lo que debes."
        action={
          <Button
            className="w-full sm:w-auto"
            onClick={() => setFormularioAbierto(true)}
          >
            <Plus className="h-4 w-4" />
            Nueva compra
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {/* Lo primero que quiere saber el dueño: cuánto debe. */}
        <Card className={cn('overflow-hidden', totalDeuda > 0 && 'border-amber-300')}>
          {deuda.isLoading ? (
            <Loading rows={2} />
          ) : deuda.isError ? (
            <ErrorMessage error={deuda.error} onRetry={() => deuda.refetch()} />
          ) : totalDeuda <= 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-9 w-9 text-emerald-500" />}
              title="Estás al día con tus proveedores"
              message="No debes nada. Cuando dejes una compra a deber, el saldo aparecerá aquí."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeudaAnteriorAbierta(true)}
                >
                  <Plus className="h-4 w-4" />
                  Apuntar una deuda anterior
                </Button>
              }
            />
          ) : (
            <>
              <div className="bg-amber-50 px-4 py-4 sm:px-5">
                <p className="text-sm font-medium text-amber-900">
                  Le debes a tus proveedores
                </p>
                <p className="tabular mt-1 text-3xl font-bold text-amber-900">
                  {formatMoney(totalDeuda, currency)}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  En {deuda.data?.purchasesCount ?? 0} compra
                  {deuda.data?.purchasesCount === 1 ? '' : 's'} sin terminar de pagar.
                </p>
                {vencido > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1.5 text-sm font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Ya vencido: {formatMoney(vencido, currency)}
                  </p>
                )}
              </div>

              <ul className="divide-y divide-slate-100">
                {(deuda.data?.bySupplier ?? []).map((proveedor) => (
                  <li key={proveedor.supplierId ?? proveedor.name}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
                      onClick={() => verProveedor(proveedor.supplierId)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {proveedor.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {proveedor.purchasesCount} compra
                          {proveedor.purchasesCount === 1 ? '' : 's'} por pagar
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold text-slate-900">
                        {formatMoney(proveedor.balance, currency)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Para lo que ya se debía antes de empezar a usar Arqueo. */}
              <div className="border-t border-slate-100 px-2 py-1.5 sm:px-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeudaAnteriorAbierta(true)}
                >
                  <Plus className="h-4 w-4" />
                  Apuntar una deuda anterior
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* En el celular cada filtro ocupa su propia línea y se puede tocar. */}
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
          <Select
            className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
            value={filtros.status}
            onChange={(e) =>
              cambiarFiltros({ status: e.target.value as PurchaseStatusFilter | '' })
            }
            aria-label="Estado de la compra"
          >
            {ESTADOS.map((estado) => (
              <option key={estado.value} value={estado.value}>
                {estado.label}
              </option>
            ))}
          </Select>
          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setFiltros(filtrosIniciales())}
            >
              Quitar filtros
            </Button>
          )}
        </div>

        {errorAccion && (
          <div className="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{errorAccion}</span>
            <button
              type="button"
              className="shrink-0 font-medium underline"
              onClick={() => setErrorAccion(null)}
            >
              Cerrar
            </button>
          </div>
        )}

        <Card>
          {compras.isLoading ? (
            <Loading rows={6} />
          ) : compras.isError ? (
            <ErrorMessage error={compras.error} onRetry={() => compras.refetch()} />
          ) : !compras.data?.data.length ? (
            <EmptyState
              title="No hay compras con estos filtros"
              message="Apunta lo que le compras al proveedor: entra al inventario y, si queda a deber, verás el saldo aquí."
              action={
                <Button onClick={() => setFormularioAbierto(true)}>
                  <Plus className="h-4 w-4" />
                  Nueva compra
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-1.5 border-b border-slate-100 px-4 py-3 sm:grid-cols-3">
                {[
                  { label: 'Total', valor: compras.data.summary?.total },
                  { label: 'Abonado', valor: compras.data.summary?.paid },
                  { label: 'Saldo', valor: compras.data.summary?.balance },
                ].map((dato) => (
                  <div
                    key={dato.label}
                    className="flex items-baseline justify-between gap-2 sm:block"
                  >
                    <span className="text-xs text-slate-500">{dato.label}</span>
                    <span
                      className={cn(
                        'tabular block text-base font-semibold text-slate-900',
                        dato.label === 'Saldo' &&
                          toNumber(dato.valor) > 0 &&
                          'text-red-700',
                      )}
                    >
                      {formatMoney(dato.valor ?? 0, currency)}
                    </span>
                  </div>
                ))}
              </div>

              <MobileList>
                {compras.data.data.map((compra) => (
                  <Fragment key={compra.id}>
                    <MobileCard
                      title={compra.supplier?.name ?? 'Sin proveedor'}
                      badge={estados(compra)}
                      subtitle={
                        <>
                          {formatDate(compra.date)}
                          {compra.invoiceNumber ? ` · ${compra.invoiceNumber}` : ''}
                        </>
                      }
                      amount={formatMoney(compra.total, currency)}
                      details={[
                        {
                          label: 'Abonado',
                          value: formatMoney(compra.paidAmount, currency),
                        },
                        {
                          label: 'Saldo',
                          value: (
                            <span
                              className={cn(
                                toNumber(compra.balance) > 0 &&
                                  'font-semibold text-red-700',
                              )}
                            >
                              {formatMoney(compra.balance, currency)}
                            </span>
                          ),
                        },
                      ]}
                      actions={acciones(compra)}
                    />
                    {detalleId === compra.id && (
                      <li className="px-4 pb-3">
                        <DetalleCompra
                          compra={compra}
                          onBorrarAbono={(pago) =>
                            setABorrar({ tipo: 'abono', compra, pago })
                          }
                        />
                      </li>
                    )}
                  </Fragment>
                ))}
              </MobileList>

              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Proveedor</Th>
                      <Th>Factura</Th>
                      <Th align="right">Total</Th>
                      <Th align="right">Abonado</Th>
                      <Th align="right">Saldo</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {compras.data.data.map((compra) => (
                      <Fragment key={compra.id}>
                        <Tr>
                          <Td className="whitespace-nowrap">
                            {formatDate(compra.date)}
                          </Td>
                          <Td>
                            <span className="font-medium text-slate-900">
                              {compra.supplier?.name ?? 'Sin proveedor'}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {estados(compra)}
                            </span>
                          </Td>
                          <Td className="text-slate-500">
                            {compra.invoiceNumber ?? '—'}
                          </Td>
                          <Td align="right">{formatMoney(compra.total, currency)}</Td>
                          <Td align="right" className="text-slate-500">
                            {formatMoney(compra.paidAmount, currency)}
                          </Td>
                          <Td
                            align="right"
                            className={cn(
                              'font-semibold',
                              toNumber(compra.balance) > 0
                                ? 'text-red-700'
                                : 'text-slate-900',
                            )}
                          >
                            {formatMoney(compra.balance, currency)}
                          </Td>
                          <Td align="right">
                            <div className="flex justify-end gap-1">
                              {acciones(compra)}
                            </div>
                          </Td>
                        </Tr>
                        {detalleId === compra.id && (
                          <tr>
                            <td
                              colSpan={7}
                              className="border-b border-slate-100 px-4 pb-3"
                            >
                              <DetalleCompra
                                compra={compra}
                                onBorrarAbono={(pago) =>
                                  setABorrar({ tipo: 'abono', compra, pago })
                                }
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </Table>
              </TableWrapper>

              <Pagination
                page={compras.data.meta.page}
                totalPages={compras.data.meta.totalPages}
                total={compras.data.meta.total}
                onPageChange={(page) => cambiarFiltros({ page })}
              />
            </>
          )}
        </Card>
      </div>

      <PurchaseFormDialog
        open={formularioAbierto}
        onOpenChange={setFormularioAbierto}
      />

      <OpeningBalanceDialog
        open={deudaAnteriorAbierta}
        onOpenChange={setDeudaAnteriorAbierta}
      />

      <PaymentDialog
        open={!!aAbonar}
        compra={aAbonar}
        onOpenChange={(abierto) => !abierto && setAAbonar(null)}
      />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title={
          aBorrar?.tipo === 'abono'
            ? 'Borrar este abono'
            : aBorrar?.compra.isOpeningBalance
              ? 'Borrar esta deuda anterior'
              : 'Borrar esta compra'
        }
        message={
          aBorrar?.tipo === 'abono'
            ? 'El importe volverá a quedar como deuda con el proveedor. Si lo pagaste en efectivo, también cambiará el cierre de caja de ese día.'
            : aBorrar?.compra.isOpeningBalance
              ? 'Se borrará la deuda y sus abonos. Si algún abono fue en efectivo, también cambiará el cierre de caja de ese día.'
              : 'Se retirará del inventario la mercancía que entró, el costo de esos productos volverá a como estaba antes de la compra y se borrarán sus abonos. Solo se puede si todavía no has vendido nada de esa compra.'
        }
        loading={borrarCompra.isPending || borrarAbono.isPending}
        onConfirm={confirmarBorrado}
      />
    </>
  );
}
