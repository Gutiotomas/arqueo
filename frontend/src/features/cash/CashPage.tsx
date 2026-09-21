import { Banknote, Receipt, Trash2, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  useCashClosing,
  useCashClosings,
  useCashPreview,
  useCreateCashClosing,
  useDeleteCashClosing,
  useUpdateCashClosing,
  type CashClosingPayload,
} from './api';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import type { CashClosing } from '@/shared/api/types';
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

export function CashPage() {
  const { currency } = useAuth();

  const [fecha, setFecha] = useState(today());
  const [apertura, setApertura] = useState<number | ''>('');
  const [contado, setContado] = useState<number | ''>('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [aBorrar, setABorrar] = useState<CashClosing | null>(null);

  const preview = useCashPreview(fecha, apertura);
  const idExistente = preview.data?.existingClosingId ?? null;
  const existente = useCashClosing(idExistente);

  const historico = useCashClosings({ from: addDays(today(), -30), to: today() });
  const crear = useCreateCashClosing();
  const actualizar = useUpdateCashClosing();
  const borrar = useDeleteCashClosing();

  // Marca el dia que ya se ha rellenado para no pisar lo que teclea el usuario.
  const rellenadoPara = useRef<string | null>(null);

  function cambiarDia(nueva: string) {
    if (!nueva) return;
    setFecha(nueva);
    setApertura('');
    setContado('');
    setNotas('');
    setError(null);
    setGuardado(false);
    rellenadoPara.current = null;
  }

  // Si el dia ya tiene cierre, el formulario arranca con lo guardado.
  useEffect(() => {
    const cierre = existente.data;
    if (!cierre || rellenadoPara.current === fecha) return;
    if (cierre.date.slice(0, 10) !== fecha) return;

    rellenadoPara.current = fecha;
    setApertura(toNumber(cierre.openingCash));
    setContado(toNumber(cierre.closingCash));
    setNotas(cierre.notes ?? '');
  }, [existente.data, fecha]);

  const ventasEfectivo = toNumber(preview.data?.cashSales);
  const gastosEfectivo = toNumber(preview.data?.cashExpenses);
  // El esperado se calcula tambien aqui para que responda al teclear la
  // apertura sin esperar a que el API conteste; la formula es la misma.
  const esperado = toNumber(apertura || 0) + ventasEfectivo - gastosEfectivo;
  const diferencia = contado === '' ? null : toNumber(contado) - esperado;

  const guardando = crear.isPending || actualizar.isPending;

  async function guardar() {
    setError(null);
    setGuardado(false);

    if (contado === '') {
      setError('Escribe cuánto efectivo hay en la caja');
      return;
    }

    const datos: CashClosingPayload = {
      date: fecha,
      openingCash: toNumber(apertura || 0),
      closingCash: toNumber(contado),
      notes: notas.trim(),
    };

    try {
      if (idExistente) {
        await actualizar.mutateAsync({ id: idExistente, datos });
      } else {
        await crear.mutateAsync(datos);
      }
      setGuardado(true);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar el cierre',
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Cierre de caja"
        description="Cuadra el efectivo al final del día"
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Efectivo esperado"
              description="Con cuánto abriste y qué pasó por la caja"
            />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Día">
                  <Input
                    type="date"
                    value={fecha}
                    max={today()}
                    onChange={(e) => cambiarDia(e.target.value)}
                  />
                </Field>
                <Field label="Efectivo de apertura">
                  <MoneyInput
                    value={apertura}
                    onValueChange={setApertura}
                    placeholder="0"
                  />
                </Field>
              </div>

              {preview.isError ? (
                <ErrorMessage
                  error={preview.error}
                  onRetry={() => preview.refetch()}
                />
              ) : preview.isLoading ? (
                <Loading rows={3} />
              ) : (
                <div
                  className={cn(
                    'space-y-2 transition-opacity',
                    preview.isFetching && 'opacity-60',
                  )}
                >
                  <LineaDesglose
                    icono={<Banknote className="h-4 w-4" />}
                    tono="neutral"
                    etiqueta="Apertura"
                    detalle={formatLongDate(fecha)}
                    valor={formatMoney(apertura || 0, currency)}
                  />
                  <LineaDesglose
                    icono={<TrendingUp className="h-4 w-4" />}
                    tono="verde"
                    etiqueta="Ventas en efectivo"
                    detalle={contar(
                      preview.data?.cashSalesCount ?? 0,
                      'venta',
                      'ventas',
                    )}
                    valor={`+ ${formatMoney(ventasEfectivo, currency)}`}
                  />
                  <LineaDesglose
                    icono={<Receipt className="h-4 w-4" />}
                    tono="naranja"
                    etiqueta="Gastos en efectivo"
                    detalle={contar(
                      preview.data?.cashExpensesCount ?? 0,
                      'gasto',
                      'gastos',
                    )}
                    valor={`− ${formatMoney(gastosEfectivo, currency)}`}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-4 py-3 text-white">
                    <span className="text-sm">Debería haber en caja</span>
                    <span className="tabular text-xl font-bold sm:text-2xl">
                      {formatMoney(esperado, currency)}
                    </span>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Cuenta la caja"
              description="Apunta lo que hay de verdad y mira el descuadre"
            />
            <CardBody className="space-y-4">
              <Field
                label="Efectivo contado"
                hint="Billetes y monedas que hay ahora mismo en la caja"
              >
                <MoneyInput
                  value={contado}
                  onValueChange={(valor) => {
                    setContado(valor);
                    setGuardado(false);
                  }}
                  placeholder="0"
                />
              </Field>

              {diferencia !== null && <Descuadre valor={diferencia} currency={currency} />}

              <Field label="Notas (opcional)">
                <Textarea
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Faltó un billete de diez mil, se pagó un domicilio..."
                />
              </Field>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              {guardado && !error && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Cierre guardado. Puedes seguir corrigiéndolo si hace falta.
                </p>
              )}

              <Button
                size="lg"
                className="w-full"
                onClick={guardar}
                disabled={guardando || contado === ''}
              >
                {guardando
                  ? 'Guardando...'
                  : idExistente
                    ? 'Actualizar cierre'
                    : 'Guardar cierre'}
              </Button>

              {idExistente && (
                <p className="text-center text-xs text-slate-500">
                  Este día ya tenía un cierre guardado: al guardar se corrige.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Cierres del último mes"
            description="Los últimos 30 días, del más reciente al más antiguo"
          />
          {historico.isLoading ? (
            <Loading rows={4} />
          ) : historico.isError ? (
            <ErrorMessage error={historico.error} onRetry={() => historico.refetch()} />
          ) : !historico.data?.length ? (
            <EmptyState
              title="Todavía no has cerrado ninguna caja"
              message="Guarda el cierre de hoy y aquí verás el histórico."
            />
          ) : (
            <>
              <MobileList>
                {historico.data.map((cierre) => {
                  const desvio = toNumber(cierre.difference);
                  const cuadra = Math.abs(desvio) < 0.005;
                  return (
                    <MobileCard
                      key={cierre.id}
                      title={formatDate(cierre.date)}
                      subtitle={`Esperado ${formatMoney(cierre.expectedCash, currency)} · Contado ${formatMoney(cierre.closingCash, currency)}`}
                      amount={formatMoney(desvio, currency)}
                      amountTone={
                        cuadra ? 'positive' : desvio < 0 ? 'negative' : 'neutral'
                      }
                      badge={
                        <Badge
                          tone={cuadra ? 'success' : desvio < 0 ? 'danger' : 'warning'}
                        >
                          {cuadra ? 'Cuadra' : desvio < 0 ? 'Falta' : 'Sobra'}
                        </Badge>
                      }
                      // Tocar la tarjeta carga ese día en el formulario de arriba.
                      onClick={() => cambiarDia(cierre.date.slice(0, 10))}
                      actions={
                        <Button
                          variant="dangerGhost"
                          size="icon"
                          aria-label="Borrar cierre"
                          onClick={() => setABorrar(cierre)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
                      <Th align="right">Apertura</Th>
                      <Th align="right">Esperado</Th>
                      <Th align="right">Contado</Th>
                      <Th align="right">Diferencia</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {historico.data.map((cierre) => {
                      const desvio = toNumber(cierre.difference);
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
                          </Td>
                          <Td align="right">
                            {formatMoney(cierre.openingCash, currency)}
                          </Td>
                          <Td align="right">
                            {formatMoney(cierre.expectedCash, currency)}
                          </Td>
                          <Td align="right">
                            {formatMoney(cierre.closingCash, currency)}
                          </Td>
                          <Td
                            align="right"
                            className={cn('font-semibold', colorDescuadre(desvio))}
                          >
                            {formatMoney(desvio, currency)}
                          </Td>
                          <Td align="right">
                            <Button
                              variant="dangerGhost"
                              size="icon"
                              aria-label="Borrar cierre"
                              onClick={() => setABorrar(cierre)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title="Borrar este cierre"
        message="Se borra solo el cuadre de caja: las ventas y los gastos del día se quedan como están."
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

/** Verde si cuadra, rojo si falta dinero y ámbar si sobra. */
function colorDescuadre(valor: number): string {
  if (Math.abs(valor) < 0.005) return 'text-emerald-600';
  return valor < 0 ? 'text-red-600' : 'text-amber-600';
}

function Descuadre({ valor, currency }: { valor: number; currency: string }) {
  const cuadra = Math.abs(valor) < 0.005;
  const falta = valor < 0;

  const estilo = cuadra
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : falta
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <div className={cn('rounded-xl border px-4 py-4 text-center', estilo)}>
      <p className="text-sm font-medium">
        {cuadra ? 'La caja cuadra' : falta ? 'Falta dinero' : 'Sobra dinero'}
      </p>
      <p className="tabular mt-1 text-2xl font-bold wrap-break-word sm:text-3xl">
        {formatMoney(valor, currency)}
      </p>
      <p className="mt-1 text-xs opacity-80">Contado menos esperado</p>
    </div>
  );
}

function LineaDesglose({
  icono,
  tono,
  etiqueta,
  detalle,
  valor,
}: {
  icono: ReactNode;
  tono: 'neutral' | 'verde' | 'naranja';
  etiqueta: string;
  detalle: string;
  valor: string;
}) {
  const tonos = {
    neutral: 'bg-slate-100 text-slate-600',
    verde: 'bg-emerald-50 text-emerald-600',
    naranja: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            tonos[tono],
          )}
        >
          {icono}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-700">
            {etiqueta}
          </span>
          <span className="block truncate text-xs text-slate-500">{detalle}</span>
        </span>
      </div>
      <span className="tabular shrink-0 text-sm font-semibold text-slate-900">
        {valor}
      </span>
    </div>
  );
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
