import { FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDeleteSale, useSales, type SaleFilters } from './api';
import { SaleFormDialog } from './SaleFormDialog';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { downloadFile } from '@/shared/api/client';
import {
  SALE_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type Sale,
} from '@/shared/api/types';
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
import { Input, Select } from '@/shared/ui/field';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { RangePicker } from '@/shared/ui/range-picker';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

/** En la tarjeta del celular no cabe una lista: "2 × Cerveza lata, 1 × Recarga". */
function resumenProductos(venta: Sale): string {
  return venta.items
    .map((item) => `${formatQuantity(item.quantity)} × ${item.description}`)
    .join(', ');
}

/** Cómo se pagó la venta, línea a línea: "Efectivo $6.000 · Fiado a Marta $6.000". */
function EstadoPago({ venta, currency }: { venta: Sale; currency: string }) {
  const porMetodo = new Map<PaymentMethod, number>();
  const fiadoA = new Map<string, number>();
  for (const item of venta.items) {
    porMetodo.set(item.paymentMethod, (porMetodo.get(item.paymentMethod) ?? 0) + toNumber(item.subtotal));
    if (item.paymentMethod === 'CREDIT') {
      const nombre = item.customer?.name ?? 'Sin nombre';
      fiadoA.set(nombre, (fiadoA.get(nombre) ?? 0) + toNumber(item.subtotal));
    }
  }
  const unica = porMetodo.size === 1;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {[...porMetodo.entries()].map(([metodo, importe]) => (
        <Badge
          key={metodo}
          tone={metodo === 'CREDIT' ? 'warning' : metodo === 'CASH' ? 'success' : 'info'}
        >
          {PAYMENT_METHOD_LABELS[metodo]}
          {!unica && <span className="tabular ml-1">{formatMoney(importe, currency)}</span>}
        </Badge>
      ))}
      {fiadoA.size > 0 && (
        <span className="text-xs text-slate-500">
          a {[...fiadoA.keys()].join(', ')}
        </span>
      )}
    </span>
  );
}

export function SalesPage() {
  const { currency } = useAuth();
  const [filtros, setFiltros] = useState<SaleFilters>({
    from: startOfMonth(),
    to: today(),
    paymentMethod: '',
    search: '',
    page: 1,
    limit: 20,
  });
  // Desde Fiados se llega con ?nueva=fiado: el formulario abre ya en "Fiado".
  const [parametros, setParametros] = useSearchParams();
  const [formulario, setFormulario] = useState<{ abierto: boolean; venta: Sale | null }>(
    { abierto: parametros.get('nueva') === 'fiado', venta: null },
  );
  const formaInicial: PaymentMethod = parametros.get('nueva') === 'fiado' ? 'CREDIT' : 'CASH';
  const [aBorrar, setABorrar] = useState<Sale | null>(null);
  const [descargando, setDescargando] = useState(false);

  const ventas = useSales(filtros);
  const borrar = useDeleteSale();

  function cambiarFiltros(cambios: Partial<SaleFilters>) {
    // Cualquier cambio de filtro vuelve a la primera pagina.
    setFiltros((previos) => ({ ...previos, ...cambios, page: cambios.page ?? 1 }));
  }

  async function exportar() {
    setDescargando(true);
    try {
      await downloadFile(
        '/reports/xlsx',
        { from: filtros.from, to: filtros.to },
        'arqueo-ventas.xlsx',
      );
    } finally {
      setDescargando(false);
    }
  }

  /** Las mismas acciones en la tabla y en la tarjeta. */
  function acciones(venta: Sale) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editar venta"
          onClick={() => setFormulario({ abierto: true, venta })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="dangerGhost"
          size="icon"
          aria-label="Borrar venta"
          onClick={() => setABorrar(venta)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Lo que entra cada día"
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={exportar}
              disabled={descargando}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {descargando ? 'Generando...' : 'Exportar Excel'}
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setFormulario({ abierto: true, venta: null })}
            >
              <Plus className="h-4 w-4" />
              Nueva venta
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {/* En el celular cada filtro ocupa su propia línea y se puede tocar. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <RangePicker
            className="w-full sm:w-auto"
            value={{ from: filtros.from ?? '', to: filtros.to ?? '' }}
            onChange={(rango) => cambiarFiltros(rango)}
          />
          <Select
            className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
            value={filtros.paymentMethod}
            onChange={(e) =>
              cambiarFiltros({ paymentMethod: e.target.value as PaymentMethod | '' })
            }
            aria-label="Forma de pago"
          >
            <option value="">Todas las formas de pago</option>
            {SALE_PAYMENT_METHODS.map((metodo) => (
              <option key={metodo.value} value={metodo.value}>
                {metodo.label}
              </option>
            ))}
          </Select>
          <Input
            className="w-full sm:h-8 sm:w-48 sm:py-0 sm:text-xs"
            placeholder="Buscar concepto o nota"
            value={filtros.search}
            onChange={(e) => cambiarFiltros({ search: e.target.value })}
          />
        </div>

        <Card>
          {ventas.isLoading ? (
            <Loading rows={6} />
          ) : ventas.isError ? (
            <ErrorMessage error={ventas.error} onRetry={() => ventas.refetch()} />
          ) : !ventas.data?.data.length ? (
            <EmptyState
              title="Aún no hay ventas en este periodo"
              message="Registra la primera venta del día y aparecerá aquí."
              action={
                <Button onClick={() => setFormulario({ abierto: true, venta: null })}>
                  <Plus className="h-4 w-4" />
                  Nueva venta
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <span className="text-sm text-slate-500">
                  Total del periodo filtrado
                </span>
                <span className="tabular text-lg font-semibold text-slate-900">
                  {formatMoney(ventas.data.summary?.total ?? 0, currency)}
                </span>
              </div>

              <MobileList>
                {ventas.data.data.map((venta) => (
                  <MobileCard
                    key={venta.id}
                    title={formatDate(venta.date)}
                    subtitle={
                      <>
                        {resumenProductos(venta)}
                        {venta.notes && (
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {venta.notes}
                          </span>
                        )}
                      </>
                    }
                    amount={formatMoney(venta.total, currency)}
                    badge={<EstadoPago venta={venta} currency={currency} />}
                    actions={acciones(venta)}
                  />
                ))}
              </MobileList>

              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Concepto</Th>
                      <Th>Pago</Th>
                      <Th align="right">Total</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.data.data.map((venta) => (
                      <Tr key={venta.id}>
                        <Td className="whitespace-nowrap">{formatDate(venta.date)}</Td>
                        <Td>
                          <ul className="space-y-0.5">
                            {venta.items.map((item) => (
                              <li key={item.id} className="text-slate-700">
                                <span className="tabular text-slate-500">
                                  {formatQuantity(item.quantity)} ×
                                </span>{' '}
                                {item.description}
                                {!item.productId && (
                                  <span className="ml-1 text-xs text-slate-400">
                                    (concepto libre)
                                  </span>
                                )}
                                {item.paymentMethod === 'CREDIT' && (
                                  <span className="ml-1 text-xs text-amber-700">
                                    (fiado a {item.customer?.name ?? 'sin nombre'})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {venta.notes && (
                            <p className="mt-1 text-xs text-slate-500">{venta.notes}</p>
                          )}
                        </Td>
                        <Td>
                          <EstadoPago venta={venta} currency={currency} />
                        </Td>
                        <Td align="right" className="font-medium text-slate-900">
                          {formatMoney(venta.total, currency)}
                        </Td>
                        <Td align="right">
                          <div className="flex justify-end gap-1">{acciones(venta)}</div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrapper>

              <Pagination
                page={ventas.data.meta.page}
                totalPages={ventas.data.meta.totalPages}
                total={ventas.data.meta.total}
                onPageChange={(page) => cambiarFiltros({ page })}
              />
            </>
          )}
        </Card>
      </div>

      <SaleFormDialog
        open={formulario.abierto}
        venta={formulario.venta}
        formaDePagoInicial={formaInicial}
        onOpenChange={(abierto) => {
          setFormulario((previo) => ({ ...previo, abierto }));
          // Al cerrar, el enlace desde Fiados ya cumplió su función.
          if (!abierto && parametros.has('nueva')) setParametros({});
        }}
      />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title="Borrar esta venta"
        message="Se devolverá al inventario el stock que descontó. Esta acción no se puede deshacer."
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
