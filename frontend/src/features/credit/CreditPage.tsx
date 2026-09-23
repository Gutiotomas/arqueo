import { CheckCircle2, HandCoins, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { CollectDialog } from './CollectDialog';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import {
  useCustomerAccount,
  useCustomerDebt,
  useCustomers,
  useDeleteCustomerPayment,
} from '@/features/sales/api';
import { ApiError } from '@/shared/api/client';
import { PAYMENT_METHOD_LABELS, type CustomerPayment } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/dates';
import { formatMoney, formatQuantity, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card, CardHeader } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { EmptyState, ErrorMessage, Loading } from '@/shared/ui/feedback';
import { Select } from '@/shared/ui/field';

/** Días desde una fecha de negocio. */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * El cuaderno de fiados: cuánto te debe cada cliente y, al elegir uno, lo
 * que se llevó y lo que ha pagado. Lo fiado se apunta desde Ventas, en cada
 * producto; aquí se cobra.
 */
export function CreditPage() {
  const { currency } = useAuth();
  const [clienteId, setClienteId] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<CustomerPayment | null>(null);

  const deuda = useCustomerDebt();
  const clientes = useCustomers();
  const cuenta = useCustomerAccount(clienteId || null);
  const borrarCobro = useDeleteCustomerPayment();

  const totalDeuda = toNumber(deuda.data?.total);
  const elegido = cuenta.data;

  async function confirmarBorrado() {
    if (!aBorrar || !clienteId) return;
    setErrorAccion(null);
    try {
      await borrarCobro.mutateAsync({ customerId: clienteId, paymentId: aBorrar.id });
    } catch (fallo) {
      setErrorAccion(fallo instanceof ApiError ? fallo.detalle : 'No se pudo borrar');
    }
    setABorrar(null);
  }

  return (
    <>
      <PageHeader
        title="Fiados"
        description="Lo que los clientes se llevaron y todavía deben"
        action={
          <Button className="w-full sm:w-auto" asChild>
            <Link to="/ventas?nueva=fiado">
              <Plus className="h-4 w-4" />
              Fiar una venta
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Izquierda: cuánto te deben y quién. Tocar un cliente abre su cuaderno. */}
          <Card className={cn('overflow-hidden self-start', totalDeuda > 0 && 'border-amber-300')}>
            {deuda.isLoading ? (
              <Loading rows={3} />
            ) : deuda.isError ? (
              <ErrorMessage error={deuda.error} onRetry={() => deuda.refetch()} />
            ) : totalDeuda <= 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-9 w-9 text-emerald-500" />}
                title="Nadie te debe nada"
                message='Cuando fíes algo en una venta (forma de pago "Fiado" en el producto), lo que debe cada cliente aparecerá aquí.'
              />
            ) : (
              <>
                <div className="bg-amber-50 px-4 py-4 sm:px-5">
                  <p className="text-sm font-medium text-amber-900">Te deben en total</p>
                  <p className="tabular mt-1 text-3xl font-bold text-amber-900">
                    {formatMoney(totalDeuda, currency)}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {deuda.data?.customersCount} cliente
                    {deuda.data?.customersCount === 1 ? '' : 's'} con saldo pendiente.
                  </p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {(deuda.data?.byCustomer ?? []).map((cliente) => {
                    const dias = diasDesde(cliente.lastPaymentDate ?? cliente.oldestDate);
                    const activo = cliente.customerId === clienteId;
                    return (
                      <li key={cliente.customerId}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5',
                            activo && 'bg-marca-50 hover:bg-marca-50',
                          )}
                          onClick={() => setClienteId(activo ? '' : cliente.customerId)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {cliente.name}
                            </span>
                            <span
                              className={cn(
                                'block text-xs',
                                dias !== null && dias >= 30 ? 'font-medium text-red-600' : 'text-slate-500',
                              )}
                            >
                              {cliente.lastPaymentDate
                                ? `Último cobro hace ${dias} día${dias === 1 ? '' : 's'}`
                                : `Fía desde hace ${dias} día${dias === 1 ? '' : 's'}, sin cobros`}
                            </span>
                          </span>
                          <span className="tabular shrink-0 text-sm font-semibold text-slate-900">
                            {formatMoney(cliente.balance, currency)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>

          {/* Derecha: el cuaderno del cliente elegido. */}
          <Card className="self-start">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <HandCoins className="h-5 w-5 text-marca-600" />
                  {elegido ? elegido.customer.name : 'Cuaderno del cliente'}
                </span>
              }
              description={
                elegido
                  ? `Se ha llevado ${formatMoney(elegido.credited, currency)} y ha pagado ${formatMoney(elegido.paid, currency)}`
                  : 'Elige un cliente para ver lo que se llevó y lo que ha pagado'
              }
              action={
                elegido ? (
                  <div className="flex gap-1">
                    {toNumber(elegido.balance) > 0 && (
                      <Button size="sm" onClick={() => setCobrando(true)}>
                        <HandCoins className="h-4 w-4" />
                        Cobrar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Cerrar cuaderno"
                      onClick={() => setClienteId('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : undefined
              }
            />

            {!clienteId ? (
              <div className="px-4 py-4 sm:px-5">
                <Select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  aria-label="Cliente"
                  className="sm:max-w-xs"
                >
                  <option value="">Cualquier cliente, aunque esté al día</option>
                  {(clientes.data ?? []).map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : cuenta.isLoading || !elegido ? (
              <Loading rows={4} />
            ) : cuenta.isError ? (
              <ErrorMessage error={cuenta.error} onRetry={() => cuenta.refetch()} />
            ) : (
              <div className="divide-y divide-slate-100">
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3 sm:px-5',
                    toNumber(elegido.balance) > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800',
                  )}
                >
                  <span className="text-sm font-medium">
                    {toNumber(elegido.balance) > 0 ? 'Debe' : 'Está al día'}
                  </span>
                  <span className="tabular text-xl font-bold">
                    {formatMoney(elegido.balance, currency)}
                  </span>
                </div>

                {errorAccion && (
                  <p className="bg-red-50 px-4 py-2 text-sm text-red-700 sm:px-5">{errorAccion}</p>
                )}

                <div className="px-4 py-3 sm:px-5">
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Lo que se ha llevado fiado
                  </p>
                  {elegido.credits.length === 0 ? (
                    <p className="text-sm text-slate-500">Nada todavía.</p>
                  ) : (
                    <ul className="space-y-1">
                      {elegido.credits.map((linea) => (
                        <li key={linea.id} className="flex justify-between gap-3 text-sm">
                          <span className="min-w-0 text-slate-700">
                            <span className="text-slate-500">{formatDate(linea.date)}</span> ·{' '}
                            <span className="tabular">{formatQuantity(linea.quantity)} ×</span>{' '}
                            {linea.description}
                          </span>
                          <span className="tabular shrink-0 font-medium text-slate-900">
                            {formatMoney(linea.subtotal, currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="px-4 py-3 sm:px-5">
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Cobros
                  </p>
                  {elegido.payments.length === 0 ? (
                    <p className="text-sm text-slate-500">Todavía no ha pagado nada.</p>
                  ) : (
                    <ul className="space-y-1">
                      {elegido.payments.map((cobro) => (
                        <li key={cobro.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0">
                            <span className="text-slate-700">
                              {formatDate(cobro.date)} · {PAYMENT_METHOD_LABELS[cobro.paymentMethod]}
                            </span>
                            {cobro.notes && (
                              <span className="block text-xs text-slate-400">{cobro.notes}</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="tabular font-medium text-emerald-700">
                              {formatMoney(cobro.amount, currency)}
                            </span>
                            <Button
                              variant="dangerGhost"
                              size="icon"
                              aria-label="Borrar cobro"
                              onClick={() => setABorrar(cobro)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <CollectDialog
        open={cobrando}
        cliente={
          elegido
            ? { id: elegido.customer.id, name: elegido.customer.name, balance: elegido.balance }
            : null
        }
        onOpenChange={setCobrando}
      />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title="Borrar este cobro"
        message="El importe volverá a quedar como deuda del cliente. Si fue en efectivo, también cambiará el cierre de caja de ese día."
        loading={borrarCobro.isPending}
        onConfirm={confirmarBorrado}
      />
    </>
  );
}
