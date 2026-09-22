import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  HandCoins,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  downloadSupplierReport,
  useSupplierReport,
  type SupplierReportFilters,
} from './api';
import { PESTANAS_INFORMES } from './pestanas';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { useSuppliers } from '@/features/purchases/api';
import { ApiError } from '@/shared/api/client';
import type { PurchaseStatus, SupplierStatement } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate, startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { Badge, EmptyState, ErrorMessage, Loading } from '@/shared/ui/feedback';
import { Field, Input, Select } from '@/shared/ui/field';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { PageTabs } from '@/shared/ui/page-tabs';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

type Modo = 'todo' | 'mes' | 'custom';

const MODOS: { valor: Modo; label: string }[] = [
  { valor: 'todo', label: 'Todo el historial' },
  { valor: 'mes', label: 'Este mes' },
  { valor: 'custom', label: 'Rango personalizado' },
];

const ESTADO: Record<PurchaseStatus, { label: string; tono: 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'Pendiente', tono: 'danger' },
  partial: { label: 'Abonada', tono: 'warning' },
  paid: { label: 'Pagada', tono: 'success' },
};

/**
 * Estado de cuenta con un proveedor: lo que se le compró, lo que se le abonó
 * y lo que se le debe hoy. El proveedor va en la URL (?proveedor=...) para
 * poder llegar aquí directamente desde Compras.
 */
export function SupplierReportPage() {
  const { currency } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const proveedores = useSuppliers();

  const supplierId = parametros.get('proveedor') ?? '';
  const [modo, setModo] = useState<Modo>('todo');
  const [rango, setRango] = useState({ from: startOfMonth(), to: today() });
  const [descargando, setDescargando] = useState<'pdf' | 'xlsx' | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  const filtros: SupplierReportFilters = {
    supplierId,
    ...(modo === 'mes' ? { from: startOfMonth(), to: today() } : {}),
    ...(modo === 'custom' ? rango : {}),
  };
  const informe = useSupplierReport(filtros);

  async function descargar(formato: 'pdf' | 'xlsx') {
    setErrorDescarga(null);
    setDescargando(formato);
    try {
      await downloadSupplierReport(formato, filtros);
    } catch (fallo) {
      setErrorDescarga(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo generar el fichero',
      );
    } finally {
      setDescargando(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Informes"
        description="El resumen del negocio y el estado de cuenta con cada proveedor"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => descargar('xlsx')}
              disabled={!supplierId || descargando !== null}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {descargando === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
            </Button>
            <Button
              onClick={() => descargar('pdf')}
              disabled={!supplierId || descargando !== null}
            >
              <FileDown className="h-4 w-4" />
              {descargando === 'pdf' ? 'Generando...' : 'Descargar PDF'}
            </Button>
          </div>
        }
      />
      <PageTabs label="Tipo de informe" tabs={PESTANAS_INFORMES} />

      <div className="space-y-4 p-4 sm:p-6">
        <Card>
          <CardBody className="space-y-3">
            <Field label="Proveedor" className="sm:max-w-sm">
              <Select
                value={supplierId}
                onChange={(e) =>
                  setParametros(e.target.value ? { proveedor: e.target.value } : {})
                }
                aria-label="Proveedor"
              >
                <option value="">Elige un proveedor</option>
                {(proveedores.data ?? []).map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>
                    {proveedor.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex flex-wrap gap-1.5">
              {MODOS.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  onClick={() => setModo(opcion.valor)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    modo === opcion.valor
                      ? 'bg-marca-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {opcion.label}
                </button>
              ))}
            </div>

            {modo === 'custom' && (
              <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
                <Field label="Desde">
                  <Input
                    type="date"
                    value={rango.from}
                    max={rango.to}
                    onChange={(e) =>
                      e.target.value &&
                      setRango((previo) => ({ ...previo, from: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Hasta">
                  <Input
                    type="date"
                    value={rango.to}
                    min={rango.from}
                    max={today()}
                    onChange={(e) =>
                      e.target.value &&
                      setRango((previo) => ({ ...previo, to: e.target.value }))
                    }
                  />
                </Field>
              </div>
            )}
          </CardBody>
        </Card>

        {errorDescarga && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorDescarga}
          </p>
        )}

        {!supplierId ? (
          <Card>
            <EmptyState
              icon={<Truck className="h-9 w-9 text-slate-300" />}
              title="Elige un proveedor"
              message="Verás lo que le has comprado, lo que le has abonado y lo que le debes, listo para descargar en PDF o Excel."
            />
          </Card>
        ) : informe.isError ? (
          <Card>
            <ErrorMessage error={informe.error} onRetry={() => informe.refetch()} />
          </Card>
        ) : informe.isLoading || !informe.data ? (
          <Card>
            <Loading rows={6} />
          </Card>
        ) : (
          <EstadoDeCuenta datos={informe.data} currency={currency} />
        )}
      </div>
    </>
  );
}

function EstadoDeCuenta({
  datos,
  currency,
}: {
  datos: SupplierStatement;
  currency: string;
}) {
  const { summary: resumen } = datos;
  const debe = toNumber(resumen.currentBalance) > 0;
  const vencido = toNumber(resumen.overdue) > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
          {datos.supplier.name}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {datos.period.label}
          {datos.supplier.phone ? ` · Tel. ${datos.supplier.phone}` : ''}
        </p>
      </div>

      {/* Lo primero que se quiere saber: cuánto se le debe hoy. */}
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3',
          vencido
            ? 'border-red-200 bg-red-50 text-red-800'
            : debe
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800',
        )}
      >
        {debe ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <p className="text-sm">
          {debe ? (
            <>
              Hoy le debes{' '}
              <strong className="tabular">
                {formatMoney(resumen.currentBalance, currency)}
              </strong>
              {vencido && (
                <>
                  , y{' '}
                  <strong className="tabular">
                    {formatMoney(resumen.overdue, currency)}
                  </strong>{' '}
                  ya están vencidos
                </>
              )}
              .
            </>
          ) : (
            'Hoy no le debes nada: estás al día con este proveedor.'
          )}
        </p>
      </div>

      {/* Como un extracto: de dónde se parte, qué entra, qué sale y dónde queda. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra titulo="Saldo al empezar" valor={formatMoney(resumen.openingBalance, currency)} />
        <Cifra
          titulo="Compras"
          valor={`+ ${formatMoney(resumen.purchased, currency)}`}
          nota={contar(resumen.purchasesCount, 'compra', 'compras')}
        />
        <Cifra
          titulo="Abonos"
          valor={`− ${formatMoney(resumen.paid, currency)}`}
          nota={contar(resumen.paymentsCount, 'abono', 'abonos')}
        />
        <Cifra
          titulo="Saldo al final"
          valor={formatMoney(resumen.closingBalance, currency)}
          destacado
        />
      </div>

      <Card>
        <CardHeader
          title="Compras del periodo"
          description="El saldo es el de hoy, con todo lo abonado hasta ahora"
        />
        {!datos.purchases.length ? (
          <EmptyState title="No hubo compras en el periodo" />
        ) : (
          <>
            <MobileList>
              {datos.purchases.map((compra, indice) => (
                <MobileCard
                  key={`${compra.date}-${indice}`}
                  title={compra.detail || 'Compra'}
                  subtitle={`${formatDate(compra.date)}${compra.dueDate ? ` · vence ${formatDate(compra.dueDate)}` : ''}`}
                  amount={formatMoney(compra.total, currency)}
                  badge={<Badge tone={ESTADO[compra.status].tono}>{ESTADO[compra.status].label}</Badge>}
                  details={[
                    { label: 'Abonado', value: formatMoney(compra.paid, currency) },
                    { label: 'Saldo hoy', value: formatMoney(compra.balance, currency) },
                  ]}
                />
              ))}
            </MobileList>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Detalle</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Abonado</Th>
                    <Th align="right">Saldo hoy</Th>
                    <Th>Vence</Th>
                  </tr>
                </thead>
                <tbody>
                  {datos.purchases.map((compra, indice) => (
                    <Tr key={`${compra.date}-${indice}`}>
                      <Td className="whitespace-nowrap">{formatDate(compra.date)}</Td>
                      <Td>
                        <span className="text-slate-900">{compra.detail || 'Compra'}</span>
                        <span className="ml-2">
                          <Badge tone={ESTADO[compra.status].tono}>
                            {ESTADO[compra.status].label}
                          </Badge>
                        </span>
                      </Td>
                      <Td align="right">{formatMoney(compra.total, currency)}</Td>
                      <Td align="right" className="text-slate-500">
                        {formatMoney(compra.paid, currency)}
                      </Td>
                      <Td
                        align="right"
                        className={cn(
                          'font-semibold',
                          toNumber(compra.balance) > 0 ? 'text-red-700' : 'text-slate-900',
                        )}
                      >
                        {formatMoney(compra.balance, currency)}
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {compra.dueDate ? formatDate(compra.dueDate) : '—'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>
          </>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Abonos del periodo" />
          {!datos.payments.length ? (
            <EmptyState title="No hubo abonos en el periodo" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {datos.payments.map((abono, indice) => (
                <li
                  key={`${abono.date}-${indice}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <HandCoins className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {formatDate(abono.date)} · {abono.paymentMethod}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {abono.purchase}
                        {abono.notes ? ` · ${abono.notes}` : ''}
                      </span>
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold text-slate-900">
                    {formatMoney(abono.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Lo que se le debe hoy"
            description="De cualquier fecha, lo vencido primero"
          />
          {!datos.pending.length ? (
            <EmptyState
              icon={<CheckCircle2 className="h-9 w-9 text-emerald-500" />}
              title="Nada pendiente"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {datos.pending.map((compra, indice) => (
                <li
                  key={`${compra.date}-${indice}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">
                      {compra.detail || 'Compra'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatDate(compra.date)} · total {formatMoney(compra.total, currency)}
                    </span>
                    {compra.dueDate && (
                      <span
                        className={cn(
                          'block text-xs',
                          compra.daysOverdue > 0 ? 'font-medium text-red-600' : 'text-slate-500',
                        )}
                      >
                        {compra.daysOverdue > 0
                          ? `Venció el ${formatDate(compra.dueDate)} (hace ${contar(compra.daysOverdue, 'día', 'días')})`
                          : `Vence el ${formatDate(compra.dueDate)}`}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold text-red-700">
                    {formatMoney(compra.balance, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Cifra({
  titulo,
  valor,
  nota,
  destacado,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
}) {
  return (
    <Card className={cn('h-full', destacado && 'border-slate-900 bg-slate-900')}>
      <CardBody>
        <p className={cn('text-sm font-medium', destacado ? 'text-slate-300' : 'text-slate-500')}>
          {titulo}
        </p>
        <p
          className={cn(
            'tabular mt-1 text-2xl font-bold wrap-break-word',
            destacado ? 'text-white' : 'text-slate-900',
          )}
        >
          {valor}
        </p>
        {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
      </CardBody>
    </Card>
  );
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
