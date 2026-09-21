import { MessageSquareReply, PackageX, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { useDeleteLoss, useLosses, useLossSummary, type LossFilters } from './api';
import { LossFormDialog } from './LossFormDialog';
import { ResolveLossDialog } from './ResolveLossDialog';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import {
  LOSS_REASONS,
  LOSS_REASON_LABELS,
  LOSS_RESOLUTIONS,
  LOSS_RESOLUTION_LABELS,
  type LossReason,
  type LossResolution,
  type StockLoss,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate, startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney, formatQuantity, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { Badge, EmptyState, ErrorMessage, Loading, Pagination } from '@/shared/ui/feedback';
import { Select } from '@/shared/ui/field';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { RangePicker } from '@/shared/ui/range-picker';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

const TONO_RESPUESTA: Record<LossResolution, 'warning' | 'success' | 'info' | 'danger'> =
  {
    PENDING: 'warning',
    FREE: 'success',
    DISCOUNTED: 'info',
    NONE: 'danger',
  };

function filtrosIniciales(): LossFilters {
  return {
    from: startOfMonth(),
    to: today(),
    reason: '',
    resolution: '',
    page: 1,
    limit: 20,
  };
}

/** Lo perdido se lee en rojo; cuando no se pierde nada, en verde y con letras. */
function LoPerdido({ perdida }: { perdida: StockLoss }) {
  const { currency } = useAuth();
  const importe = toNumber(perdida.lossAmount);

  return importe > 0 ? (
    <span className="tabular font-semibold text-red-700">
      {formatMoney(importe, currency)}
    </span>
  ) : (
    <span className="font-semibold text-emerald-700">Sin pérdida</span>
  );
}

export function LossesPage() {
  const { currency } = useAuth();
  const [filtros, setFiltros] = useState<LossFilters>(filtrosIniciales);
  // Desde el inventario se llega con ?producto=<id> para registrar el daño
  // del producto que se estaba mirando.
  const [parametros, setParametros] = useSearchParams();
  const productoDeLaUrl = parametros.get('producto') ?? undefined;
  const [formularioAbierto, setFormularioAbierto] = useState(!!productoDeLaUrl);
  const [aResolver, setAResolver] = useState<StockLoss | null>(null);
  const [aBorrar, setABorrar] = useState<StockLoss | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const perdidas = useLosses(filtros);
  const resumen = useLossSummary({ from: filtros.from, to: filtros.to });
  const borrar = useDeleteLoss();

  function cambiarFiltros(cambios: Partial<LossFilters>) {
    // Cualquier cambio de filtro vuelve a la primera página.
    setFiltros((previos) => ({ ...previos, ...cambios, page: cambios.page ?? 1 }));
  }

  async function confirmarBorrado() {
    if (!aBorrar) return;
    setErrorAccion(null);
    try {
      await borrar.mutateAsync(aBorrar.id);
      setABorrar(null);
    } catch (fallo) {
      setErrorAccion(fallo instanceof ApiError ? fallo.detalle : 'No se pudo borrar');
      setABorrar(null);
    }
  }

  const pendientes = resumen.data?.pendingCount ?? 0;
  const hayFiltros = Boolean(filtros.reason) || Boolean(filtros.resolution);

  /** Las mismas acciones en la tabla y en la tarjeta del celular. */
  function acciones(perdida: StockLoss) {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setAResolver(perdida)}>
          <MessageSquareReply className="h-4 w-4" />
          {perdida.resolution === 'PENDING' ? 'Anotar respuesta' : 'Corregir'}
        </Button>
        <Button
          variant="dangerGhost"
          size="icon"
          aria-label="Borrar registro"
          onClick={() => setABorrar(perdida)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Pérdidas"
        description="Mercancía dañada, vencida o perdida. Lo que pierdes depende de si el proveedor te la repone."
        action={
          <Button className="w-full sm:w-auto" onClick={() => setFormularioAbierto(true)}>
            <Plus className="h-4 w-4" />
            Registrar pérdida
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {/* Lo primero: cuánto se ha perdido y qué sigue en el aire. */}
        <Card className={cn('overflow-hidden', pendientes > 0 && 'border-amber-300')}>
          {resumen.isLoading ? (
            <Loading rows={2} />
          ) : resumen.isError ? (
            <ErrorMessage error={resumen.error} onRetry={() => resumen.refetch()} />
          ) : (
            <>
              <div className="px-4 py-4 sm:px-5">
                <p className="text-sm font-medium text-slate-600">
                  Perdido en este periodo
                </p>
                <p className="tabular mt-1 text-3xl font-bold text-slate-900">
                  {formatMoney(resumen.data?.total, currency)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {resumen.data?.count ?? 0} caso
                  {resumen.data?.count === 1 ? '' : 's'} registrado
                  {resumen.data?.count === 1 ? '' : 's'}, valorado al costo de la
                  mercancía.
                </p>

                {pendientes > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5">
                    <p className="text-sm font-semibold text-amber-900">
                      {pendientes} caso{pendientes === 1 ? '' : 's'} esperando respuesta
                      del proveedor
                    </p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      Hay {formatMoney(resumen.data?.pending, currency)} en juego: por
                      ahora cuentan como pérdida total. Anota la respuesta y el número se
                      corrige.
                    </p>
                    {filtros.resolution !== 'PENDING' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-2 w-full sm:w-auto"
                        onClick={() => cambiarFiltros({ resolution: 'PENDING' })}
                      >
                        Ver esos casos
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {(resumen.data?.byReason.length ?? 0) > 0 && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {(resumen.data?.byReason ?? []).map((motivo) => (
                    <li key={motivo.reason}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
                        onClick={() => cambiarFiltros({ reason: motivo.reason })}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {LOSS_REASON_LABELS[motivo.reason]}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {formatQuantity(motivo.quantity)} unidades en {motivo.count}{' '}
                            caso{motivo.count === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-sm font-semibold text-slate-900">
                          {formatMoney(motivo.total, currency)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        {/* En el celular cada filtro ocupa su propia línea y se puede tocar. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <RangePicker
            className="w-full sm:w-auto"
            value={{ from: filtros.from, to: filtros.to }}
            onChange={(rango) => cambiarFiltros(rango)}
          />
          <Select
            className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
            value={filtros.reason}
            onChange={(e) => cambiarFiltros({ reason: e.target.value as LossReason | '' })}
            aria-label="Motivo"
          >
            <option value="">Todos los motivos</option>
            {LOSS_REASONS.map((motivo) => (
              <option key={motivo.value} value={motivo.value}>
                {motivo.label}
              </option>
            ))}
          </Select>
          <Select
            className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
            value={filtros.resolution}
            onChange={(e) =>
              cambiarFiltros({ resolution: e.target.value as LossResolution | '' })
            }
            aria-label="Respuesta del proveedor"
          >
            <option value="">Cualquier respuesta</option>
            {LOSS_RESOLUTIONS.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {LOSS_RESOLUTION_LABELS[opcion.value]}
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
          {perdidas.isLoading ? (
            <Loading rows={6} />
          ) : perdidas.isError ? (
            <ErrorMessage error={perdidas.error} onRetry={() => perdidas.refetch()} />
          ) : !perdidas.data?.data.length ? (
            <EmptyState
              icon={<PackageX className="h-9 w-9" />}
              title={
                hayFiltros
                  ? 'No hay pérdidas con estos filtros'
                  : 'No has registrado ninguna pérdida en este periodo'
              }
              message="Cuando se te dañe, se te venza o se te pierda mercancía, apúntala aquí: sale del inventario y sabrás cuánto te costó de verdad."
              action={
                <Button onClick={() => setFormularioAbierto(true)}>
                  <Plus className="h-4 w-4" />
                  Registrar pérdida
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <span className="text-xs text-slate-500">
                  Perdido con estos filtros
                </span>
                <span className="tabular text-base font-semibold text-slate-900">
                  {formatMoney(perdidas.data.summary?.total ?? 0, currency)}
                </span>
              </div>

              <MobileList>
                {perdidas.data.data.map((perdida) => (
                  <MobileCard
                    key={perdida.id}
                    title={perdida.product.name}
                    badge={
                      <Badge tone={TONO_RESPUESTA[perdida.resolution]}>
                        {LOSS_RESOLUTION_LABELS[perdida.resolution]}
                      </Badge>
                    }
                    subtitle={
                      <>
                        {formatDate(perdida.date)} ·{' '}
                        {LOSS_REASON_LABELS[perdida.reason]}
                        {perdida.supplier ? ` · ${perdida.supplier.name}` : ''}
                      </>
                    }
                    amount={<LoPerdido perdida={perdida} />}
                    details={[
                      {
                        label: 'Cantidad',
                        value: `${formatQuantity(perdida.quantity)} ${perdida.product.unit}`,
                      },
                      {
                        label: 'Te costó',
                        value: formatMoney(
                          toNumber(perdida.quantity) * toNumber(perdida.unitCost),
                          currency,
                        ),
                      },
                    ]}
                    actions={acciones(perdida)}
                  />
                ))}
              </MobileList>

              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Producto</Th>
                      <Th align="right">Cantidad</Th>
                      <Th>Motivo</Th>
                      <Th>Respuesta</Th>
                      <Th align="right">Se perdió</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {perdidas.data.data.map((perdida) => (
                      <Tr key={perdida.id}>
                        <Td className="whitespace-nowrap">{formatDate(perdida.date)}</Td>
                        <Td>
                          <span className="font-medium text-slate-900">
                            {perdida.product.name}
                          </span>
                          {perdida.supplier && (
                            <span className="block text-xs text-slate-500">
                              {perdida.supplier.name}
                            </span>
                          )}
                        </Td>
                        <Td align="right" className="whitespace-nowrap">
                          {formatQuantity(perdida.quantity)} {perdida.product.unit}
                        </Td>
                        <Td className="text-slate-500">
                          {LOSS_REASON_LABELS[perdida.reason]}
                        </Td>
                        <Td>
                          <Badge tone={TONO_RESPUESTA[perdida.resolution]}>
                            {LOSS_RESOLUTION_LABELS[perdida.resolution]}
                          </Badge>
                        </Td>
                        <Td align="right">
                          <LoPerdido perdida={perdida} />
                        </Td>
                        <Td align="right">
                          <div className="flex justify-end gap-1">{acciones(perdida)}</div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrapper>

              <Pagination
                page={perdidas.data.meta.page}
                totalPages={perdidas.data.meta.totalPages}
                total={perdidas.data.meta.total}
                onPageChange={(page) => cambiarFiltros({ page })}
              />
            </>
          )}
        </Card>
      </div>

      {/* Los diálogos se montan solo cuando hacen falta: así arrancan siempre
          con los datos del caso elegido y sin nada escrito antes. */}
      {formularioAbierto && (
        <LossFormDialog
          open
          productoInicial={productoDeLaUrl}
          onOpenChange={(abierto) => {
            setFormularioAbierto(abierto);
            // Al cerrar se limpia la URL para que recargar no vuelva a abrirlo.
            if (!abierto && productoDeLaUrl) setParametros({}, { replace: true });
          }}
        />
      )}

      {aResolver && (
        <ResolveLossDialog
          open
          perdida={aResolver}
          onOpenChange={(abierto) => !abierto && setAResolver(null)}
        />
      )}

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title="Borrar este registro"
        message={
          aBorrar && (aBorrar.resolution === 'FREE' || aBorrar.resolution === 'DISCOUNTED')
            ? 'Como el proveedor repuso la mercancía, el inventario no cambia: solo se borra el caso y deja de contar como pérdida.'
            : `Las ${formatQuantity(aBorrar?.quantity)} ${aBorrar?.product.unit ?? ''} volverán al inventario y el caso dejará de contar como pérdida.`
        }
        loading={borrar.isPending}
        onConfirm={confirmarBorrado}
      />
    </>
  );
}
