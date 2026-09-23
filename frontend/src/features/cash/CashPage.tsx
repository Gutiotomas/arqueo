import { Banknote, HandCoins, Landmark, Receipt, Trash2, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  useCashClosing,
  useCashClosings,
  useCashPreview,
  useCreateCashClosing,
  useDeleteCashClosing,
  useUpdateCashClosing,
  type CashClosingPayload,
} from './api';
import { CabeceraCierres } from './CabeceraCierres';
import { Descuadre, LineaDesglose } from './cuadre';
import { colorDescuadre, contar } from './cuadre-texto';
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
  const cobrosEfectivo = toNumber(preview.data?.cashCollections);
  const abonosEfectivo = toNumber(preview.data?.cashSupplierPayments);
  const consignado = toNumber(preview.data?.depositedToAccount);
  const traido = toNumber(preview.data?.withdrawnFromAccount);
  // Todo lo que no es la apertura lo calcula el API; aqui solo se suma la
  // apertura que se esta tecleando, para no esperar a la respuesta. Antes la
  // formula estaba repetida aqui y se olvidaba de los abonos a proveedores.
  const movimientosDelDia =
    toNumber(preview.data?.expectedCash) - toNumber(preview.data?.openingCash);
  const esperado = toNumber(apertura || 0) + movimientosDelDia;
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
      <CabeceraCierres />

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
                  {cobrosEfectivo > 0 && (
                    <LineaDesglose
                      icono={<HandCoins className="h-4 w-4" />}
                      tono="verde"
                      etiqueta="Cobros de fiados"
                      detalle={contar(
                        preview.data?.cashCollectionsCount ?? 0,
                        'cobro en efectivo',
                        'cobros en efectivo',
                      )}
                      valor={`+ ${formatMoney(cobrosEfectivo, currency)}`}
                    />
                  )}
                  {abonosEfectivo > 0 && (
                    <LineaDesglose
                      icono={<HandCoins className="h-4 w-4" />}
                      tono="naranja"
                      etiqueta="Pagos a proveedores"
                      detalle="Abonos y reposiciones pagados en efectivo"
                      valor={`− ${formatMoney(abonosEfectivo, currency)}`}
                    />
                  )}
                  {consignado > 0 && (
                    <LineaDesglose
                      icono={<Landmark className="h-4 w-4" />}
                      tono="naranja"
                      etiqueta="Consignado a la cuenta"
                      detalle="Efectivo que llevaste al banco"
                      valor={`− ${formatMoney(consignado, currency)}`}
                    />
                  )}
                  {traido > 0 && (
                    <LineaDesglose
                      icono={<Landmark className="h-4 w-4" />}
                      tono="verde"
                      etiqueta="Traído de la cuenta"
                      detalle="Lo que sacaste del banco para la caja"
                      valor={`+ ${formatMoney(traido, currency)}`}
                    />
                  )}

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
