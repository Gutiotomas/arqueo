import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Flag,
  HandCoins,
  Landmark,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  useAccountClosing,
  useAccountClosings,
  useAccountMovements,
  useAccountPreview,
  useAccountSummary,
  useCreateAccountClosing,
  useDeleteAccountClosing,
  useDeleteAccountMovement,
  useUpdateAccountClosing,
} from './account-api';
import { AccountMovementDialog } from './AccountMovementDialog';
import { CabeceraCierres } from './CabeceraCierres';
import { Descuadre, LineaDesglose } from './cuadre';
import { colorDescuadre, contar } from './cuadre-texto';
import { ETIQUETA_MOVIMIENTO, SUMA_A_LA_CUENTA } from './movimientos';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { AccountClosing, AccountMovement } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { addDays, formatDate, formatLongDate, today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Textarea } from '@/shared/ui/field';
import { Badge, EmptyState, ErrorMessage, Loading } from '@/shared/ui/feedback';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

/**
 * La cuenta del negocio: transferencias y tarjeta. Al contrario que la caja,
 * el saldo sigue de un día para otro, así que cada cierre parte del saldo
 * real del anterior.
 */
export function AccountPage() {
  const { currency } = useAuth();

  const [fecha, setFecha] = useState(today());
  const [saldoBanco, setSaldoBanco] = useState<number | ''>('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [movimientoAbierto, setMovimientoAbierto] = useState(false);
  const [aBorrar, setABorrar] = useState<
    | { tipo: 'cierre'; cierre: AccountClosing }
    | { tipo: 'movimiento'; movimiento: AccountMovement }
    | null
  >(null);

  const resumen = useAccountSummary();
  const preview = useAccountPreview(fecha);
  const idExistente = preview.data?.existingClosingId ?? null;
  const existente = useAccountClosing(idExistente);

  const ultimoMes = { from: addDays(today(), -30), to: today() };
  const cierres = useAccountClosings(ultimoMes);
  const movimientos = useAccountMovements(ultimoMes);

  const crear = useCreateAccountClosing();
  const actualizar = useUpdateAccountClosing();
  const borrarCierre = useDeleteAccountClosing();
  const borrarMovimiento = useDeleteAccountMovement();

  // Marca el día que ya se ha rellenado para no pisar lo que teclea el usuario.
  const rellenadoPara = useRef<string | null>(null);

  function cambiarDia(nueva: string) {
    if (!nueva) return;
    setFecha(nueva);
    setSaldoBanco('');
    setNotas('');
    setError(null);
    setGuardado(false);
    rellenadoPara.current = null;
  }

  // Si el día ya tiene cierre, el formulario arranca con lo guardado.
  useEffect(() => {
    const cierre = existente.data;
    if (!cierre || rellenadoPara.current === fecha) return;
    if (cierre.date.slice(0, 10) !== fecha) return;

    rellenadoPara.current = fecha;
    setSaldoBanco(toNumber(cierre.closingBalance));
    setNotas(cierre.notes ?? '');
  }, [existente.data, fecha]);

  const datos = preview.data;
  const puntoDePartida = datos?.isStartingPoint ?? false;
  const bloqueado = Boolean(datos?.laterClosingDate);
  const esperado = toNumber(datos?.expectedBalance);
  const diferencia =
    saldoBanco === '' || puntoDePartida ? null : toNumber(saldoBanco) - esperado;
  const guardando = crear.isPending || actualizar.isPending;
  const ultimoCierreId = resumen.data?.lastClosing?.id ?? null;

  async function guardar() {
    setError(null);
    setGuardado(false);

    if (saldoBanco === '') {
      setError('Escribe cuánto dice la app del banco');
      return;
    }

    try {
      if (idExistente) {
        await actualizar.mutateAsync({
          id: idExistente,
          datos: { closingBalance: toNumber(saldoBanco), notes: notas.trim() },
        });
      } else {
        await crear.mutateAsync({
          date: fecha,
          closingBalance: toNumber(saldoBanco),
          notes: notas.trim(),
        });
      }
      setGuardado(true);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar el cierre',
      );
    }
  }

  async function confirmarBorrado() {
    if (!aBorrar) return;
    setError(null);
    try {
      if (aBorrar.tipo === 'cierre') {
        await borrarCierre.mutateAsync(aBorrar.cierre.id);
      } else {
        await borrarMovimiento.mutateAsync(aBorrar.movimiento.id);
      }
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo borrar');
    }
    setABorrar(null);
  }

  return (
    <>
      <CabeceraCierres />

      <div className="space-y-4 p-4 sm:p-6">
        <SaldoDeHoy
          resumen={resumen}
          currency={currency}
          onMovimiento={() => setMovimientoAbierto(true)}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Saldo esperado"
              description={
                puntoDePartida
                  ? 'Tu primer cierre de cuenta'
                  : 'El saldo del cierre anterior y lo que pasó desde entonces'
              }
            />
            <CardBody className="space-y-4">
              <Field label="Día">
                <Input
                  type="date"
                  value={fecha}
                  max={today()}
                  onChange={(e) => cambiarDia(e.target.value)}
                />
              </Field>

              {preview.isError ? (
                <ErrorMessage error={preview.error} onRetry={() => preview.refetch()} />
              ) : preview.isLoading || !datos ? (
                <Loading rows={3} />
              ) : puntoDePartida ? (
                <div className="rounded-lg bg-marca-50 px-4 py-3 text-sm text-marca-800">
                  <p className="flex items-center gap-2 font-medium">
                    <Flag className="h-4 w-4" />
                    Este será tu punto de partida
                  </p>
                  <p className="mt-1">
                    Escribe lo que dice hoy la app del banco. Desde ahí, Arqueo
                    suma las transferencias que recibes y resta lo que pagas por
                    la cuenta, y en el próximo cierre te dice si cuadra.
                  </p>
                </div>
              ) : (
                <DesgloseCuenta
                  datos={datos}
                  currency={currency}
                  cargando={preview.isFetching}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Saldo del banco"
              description="Lo que dice la app, para compararlo con lo esperado"
            />
            <CardBody className="space-y-4">
              {bloqueado && datos?.laterClosingDate && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Ya hay un cierre posterior ({formatDate(datos.laterClosingDate)}).
                  Los cierres de cuenta van en orden, así que este día ya no se
                  puede cambiar.
                </p>
              )}

              <Field
                label="Saldo en la app del banco"
                hint="Si tienes varias cuentas (Nequi, Bancolombia...), escribe la suma."
              >
                <MoneyInput
                  aria-label="Saldo en la app del banco"
                  value={saldoBanco}
                  disabled={bloqueado}
                  onValueChange={(valor) => {
                    setSaldoBanco(valor);
                    setGuardado(false);
                  }}
                  placeholder="0"
                />
              </Field>

              {diferencia !== null && (
                <Descuadre
                  valor={diferencia}
                  currency={currency}
                  que="La cuenta"
                  pie="Banco menos esperado"
                />
              )}

              <Field label="Notas (opcional)">
                <Textarea
                  rows={2}
                  value={notas}
                  disabled={bloqueado}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="El banco cobró la cuota de manejo, falta una transferencia..."
                />
              </Field>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              {guardado && !error && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {puntoDePartida
                    ? 'Punto de partida guardado. Desde aquí se lleva la cuenta.'
                    : 'Cierre guardado. Puedes seguir corrigiéndolo si hace falta.'}
                </p>
              )}

              <Button
                size="lg"
                className="w-full"
                onClick={guardar}
                disabled={guardando || saldoBanco === '' || bloqueado}
              >
                {guardando
                  ? 'Guardando...'
                  : idExistente
                    ? 'Actualizar cierre'
                    : puntoDePartida
                      ? 'Guardar punto de partida'
                      : 'Guardar cierre'}
              </Button>

              {idExistente && !bloqueado && (
                <p className="text-center text-xs text-slate-500">
                  Este día ya tenía un cierre guardado: al guardar se corrige.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Movimientos de la cuenta"
            description="Consignaciones, retiros y aportes de los últimos 30 días"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMovimientoAbierto(true)}
              >
                <Plus className="h-4 w-4" />
                Registrar
              </Button>
            }
          />
          {movimientos.isLoading ? (
            <Loading rows={3} />
          ) : movimientos.isError ? (
            <ErrorMessage
              error={movimientos.error}
              onRetry={() => movimientos.refetch()}
            />
          ) : !movimientos.data?.length ? (
            <EmptyState
              title="Sin movimientos"
              message="Si consignas efectivo de la caja o sacas del banco, apúntalo aquí: así cuadran las dos."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {movimientos.data.map((movimiento) => {
                const suma = SUMA_A_LA_CUENTA[movimiento.type];
                return (
                  <li
                    key={movimiento.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          suma
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-orange-50 text-orange-600',
                        )}
                      >
                        {suma ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">
                          {ETIQUETA_MOVIMIENTO[movimiento.type]}
                        </span>
                        <span className="block text-xs break-words text-slate-500">
                          {formatDate(movimiento.date)}
                          {movimiento.description ? ` · ${movimiento.description}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          'tabular text-sm font-semibold',
                          suma ? 'text-emerald-700' : 'text-slate-900',
                        )}
                      >
                        {suma ? '+' : '−'} {formatMoney(movimiento.amount, currency)}
                      </span>
                      <Button
                        variant="dangerGhost"
                        size="icon"
                        aria-label="Borrar movimiento"
                        onClick={() => setABorrar({ tipo: 'movimiento', movimiento })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Cierres de cuenta"
            description="Los últimos 30 días. Solo se puede borrar el más reciente: los demás son el punto de partida del siguiente."
          />
          {cierres.isLoading ? (
            <Loading rows={4} />
          ) : cierres.isError ? (
            <ErrorMessage error={cierres.error} onRetry={() => cierres.refetch()} />
          ) : !cierres.data?.length ? (
            <EmptyState
              title="Todavía no has cerrado la cuenta"
              message="Guarda tu punto de partida arriba y aquí verás el histórico."
            />
          ) : (
            <>
              <MobileList>
                {cierres.data.map((cierre) => {
                  const desvio = toNumber(cierre.difference);
                  return (
                    <MobileCard
                      key={cierre.id}
                      title={formatDate(cierre.date)}
                      subtitle={
                        cierre.openingBalance === null
                          ? `Banco ${formatMoney(cierre.closingBalance, currency)}`
                          : `Esperado ${formatMoney(cierre.expectedBalance, currency)} · Banco ${formatMoney(cierre.closingBalance, currency)}`
                      }
                      amount={
                        cierre.openingBalance === null
                          ? undefined
                          : formatMoney(desvio, currency)
                      }
                      amountTone={
                        Math.abs(desvio) < 0.005
                          ? 'positive'
                          : desvio < 0
                            ? 'negative'
                            : 'neutral'
                      }
                      badge={<EstadoCierre cierre={cierre} />}
                      onClick={() => cambiarDia(cierre.date.slice(0, 10))}
                      actions={
                        cierre.id === ultimoCierreId ? (
                          <Button
                            variant="dangerGhost"
                            size="icon"
                            aria-label="Borrar cierre"
                            onClick={() => setABorrar({ tipo: 'cierre', cierre })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : undefined
                      }
                    />
                  );
                })}
              </MobileList>

              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th align="right">Partida</Th>
                      <Th align="right">Esperado</Th>
                      <Th align="right">Banco</Th>
                      <Th align="right">Diferencia</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {cierres.data.map((cierre) => {
                      const desvio = toNumber(cierre.difference);
                      const esPartida = cierre.openingBalance === null;
                      return (
                        <Tr key={cierre.id}>
                          <Td className="whitespace-nowrap font-medium text-slate-900">
                            <button
                              type="button"
                              className="hover:text-marca-600 hover:underline"
                              onClick={() => cambiarDia(cierre.date.slice(0, 10))}
                            >
                              {formatDate(cierre.date)}
                            </button>
                            {esPartida && (
                              <span className="ml-2">
                                <EstadoCierre cierre={cierre} />
                              </span>
                            )}
                          </Td>
                          <Td align="right" className="text-slate-500">
                            {esPartida ? '—' : formatMoney(cierre.openingBalance ?? 0, currency)}
                          </Td>
                          <Td align="right">
                            {esPartida ? '—' : formatMoney(cierre.expectedBalance, currency)}
                          </Td>
                          <Td align="right">
                            {formatMoney(cierre.closingBalance, currency)}
                          </Td>
                          <Td
                            align="right"
                            className={cn('font-semibold', !esPartida && colorDescuadre(desvio))}
                          >
                            {esPartida ? '—' : formatMoney(desvio, currency)}
                          </Td>
                          <Td align="right">
                            {cierre.id === ultimoCierreId && (
                              <Button
                                variant="dangerGhost"
                                size="icon"
                                aria-label="Borrar cierre"
                                onClick={() => setABorrar({ tipo: 'cierre', cierre })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrapper>
            </>
          )}
        </Card>
      </div>

      <AccountMovementDialog open={movimientoAbierto} onOpenChange={setMovimientoAbierto} />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title={aBorrar?.tipo === 'movimiento' ? 'Borrar este movimiento' : 'Borrar este cierre'}
        message={
          aBorrar?.tipo === 'movimiento'
            ? 'Dejará de contar en el saldo de la cuenta y, si era una consignación o un retiro, también en la caja de ese día.'
            : 'Se borra solo el cuadre: las ventas, gastos y movimientos se quedan como están. El siguiente cierre partirá del anterior a este.'
        }
        loading={borrarCierre.isPending || borrarMovimiento.isPending}
        onConfirm={confirmarBorrado}
      />
    </>
  );
}

/** Cuánto hay hoy en la cuenta, o la invitación a empezar si aún no hay cierres. */
function SaldoDeHoy({
  resumen,
  currency,
  onMovimiento,
}: {
  resumen: ReturnType<typeof useAccountSummary>;
  currency: string;
  onMovimiento: () => void;
}) {
  const boton = (
    <Button variant="secondary" size="sm" onClick={onMovimiento}>
      <Landmark className="h-4 w-4" />
      Consignar o retirar
    </Button>
  );

  if (resumen.isLoading) {
    return (
      <Card>
        <Loading rows={2} />
      </Card>
    );
  }
  if (resumen.isError) {
    return (
      <Card>
        <ErrorMessage error={resumen.error} onRetry={() => resumen.refetch()} />
      </Card>
    );
  }

  const ultimo = resumen.data?.lastClosing;
  if (!ultimo || resumen.data?.estimatedBalance === null) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div>
          <p className="text-sm font-medium text-slate-900">
            Todavía no sabemos cuánto tienes en la cuenta
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            Haz tu primer cierre abajo con lo que dice la app del banco, y desde
            ahí se lleva la cuenta sola.
          </p>
        </div>
        {boton}
      </Card>
    );
  }

  const desde = toNumber(resumen.data?.sinceLastClosing?.net);

  return (
    <Card className="flex flex-wrap items-end justify-between gap-3 px-4 py-4 sm:px-5">
      <div>
        <p className="text-sm font-medium text-slate-500">Tienes en la cuenta (estimado)</p>
        <p className="tabular mt-1 text-3xl font-bold text-slate-900">
          {formatMoney(resumen.data?.estimatedBalance ?? 0, currency)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {formatMoney(ultimo.closingBalance, currency)} en el cierre del{' '}
          {formatDate(ultimo.date)}
          {Math.abs(desde) >= 0.005 &&
            ` ${desde > 0 ? '+' : '−'} ${formatMoney(Math.abs(desde), currency)} desde entonces`}
        </p>
      </div>
      {boton}
    </Card>
  );
}

function DesgloseCuenta({
  datos,
  currency,
  cargando,
}: {
  datos: NonNullable<ReturnType<typeof useAccountPreview>['data']>;
  currency: string;
  cargando: boolean;
}) {
  const m = datos.movements;
  if (!m || !datos.previousClosing) return null;

  const tarjetaNeta = toNumber(m.cardSales) - toNumber(m.cardFees);
  const lineas = [
    {
      mostrar: toNumber(m.collections) > 0,
      icono: <HandCoins className="h-4 w-4" />,
      tono: 'verde' as const,
      etiqueta: 'Cobros de fiados',
      detalle: contar(m.collectionsCount, 'cobro por transferencia o tarjeta', 'cobros por transferencia o tarjeta'),
      valor: `+ ${formatMoney(m.collections, currency)}`,
    },
    {
      mostrar: toNumber(m.cashDeposits) > 0,
      icono: <Landmark className="h-4 w-4" />,
      tono: 'verde' as const,
      etiqueta: 'Consignado desde la caja',
      detalle: 'Efectivo que llevaste al banco',
      valor: `+ ${formatMoney(m.cashDeposits, currency)}`,
    },
    {
      mostrar: toNumber(m.otherIn) > 0,
      icono: <ArrowDownLeft className="h-4 w-4" />,
      tono: 'verde' as const,
      etiqueta: 'Otros ingresos',
      detalle: 'Aportes, préstamos...',
      valor: `+ ${formatMoney(m.otherIn, currency)}`,
    },
    {
      mostrar: toNumber(m.supplierPayments) > 0,
      icono: <HandCoins className="h-4 w-4" />,
      tono: 'naranja' as const,
      etiqueta: 'Pagos a proveedores',
      detalle: contar(m.supplierPaymentsCount, 'pago', 'pagos'),
      valor: `− ${formatMoney(m.supplierPayments, currency)}`,
    },
    {
      mostrar: toNumber(m.cashWithdrawals) > 0,
      icono: <Landmark className="h-4 w-4" />,
      tono: 'naranja' as const,
      etiqueta: 'Sacado para la caja',
      detalle: 'Lo que retiraste del banco en efectivo',
      valor: `− ${formatMoney(m.cashWithdrawals, currency)}`,
    },
    {
      mostrar: toNumber(m.otherOut) > 0,
      icono: <ArrowUpRight className="h-4 w-4" />,
      tono: 'naranja' as const,
      etiqueta: 'Otras salidas',
      detalle: 'Retiros personales...',
      valor: `− ${formatMoney(m.otherOut, currency)}`,
    },
  ];

  return (
    <div className={cn('space-y-2 transition-opacity', cargando && 'opacity-60')}>
      <LineaDesglose
        icono={<Flag className="h-4 w-4" />}
        tono="neutral"
        etiqueta="Saldo del cierre anterior"
        detalle={formatLongDate(datos.previousClosing.date)}
        valor={formatMoney(datos.previousClosing.closingBalance, currency)}
      />
      <LineaDesglose
        icono={<TrendingUp className="h-4 w-4" />}
        tono="verde"
        etiqueta="Ventas por transferencia"
        detalle={contar(m.transferSalesCount, 'venta', 'ventas')}
        valor={`+ ${formatMoney(m.transferSales, currency)}`}
      />
      {m.cardSalesCount > 0 && (
        <LineaDesglose
          icono={<CreditCard className="h-4 w-4" />}
          tono="verde"
          etiqueta="Ventas con tarjeta"
          detalle={
            toNumber(m.cardFees) > 0
              ? `${contar(m.cardSalesCount, 'venta', 'ventas')} · el datáfono se quedó ${formatMoney(m.cardFees, currency)}`
              : contar(m.cardSalesCount, 'venta', 'ventas')
          }
          valor={`+ ${formatMoney(tarjetaNeta, currency)}`}
        />
      )}
      <LineaDesglose
        icono={<Receipt className="h-4 w-4" />}
        tono="naranja"
        etiqueta="Gastos por transferencia o tarjeta"
        detalle={contar(m.expensesCount, 'gasto', 'gastos')}
        valor={`− ${formatMoney(m.expenses, currency)}`}
      />
      {lineas
        .filter((linea) => linea.mostrar)
        .map((linea) => (
          <LineaDesglose
            key={linea.etiqueta}
            icono={linea.icono}
            tono={linea.tono}
            etiqueta={linea.etiqueta}
            detalle={linea.detalle}
            valor={linea.valor}
          />
        ))}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-4 py-3 text-white">
        <span className="text-sm">Debería haber en la cuenta</span>
        <span className="tabular text-xl font-bold sm:text-2xl">
          {formatMoney(datos.expectedBalance ?? 0, currency)}
        </span>
      </div>
    </div>
  );
}

function EstadoCierre({ cierre }: { cierre: AccountClosing }) {
  if (cierre.openingBalance === null) {
    return <Badge tone="info">Punto de partida</Badge>;
  }
  const desvio = toNumber(cierre.difference);
  const cuadra = Math.abs(desvio) < 0.005;
  return (
    <Badge tone={cuadra ? 'success' : desvio < 0 ? 'danger' : 'warning'}>
      {cuadra ? 'Cuadra' : desvio < 0 ? 'Falta' : 'Sobra'}
    </Badge>
  );
}
