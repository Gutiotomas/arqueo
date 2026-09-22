import {
  FileDown,
  FileSpreadsheet,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import {
  downloadReport,
  useReportPreview,
  type ReportFilters,
  type ReportPeriod,
} from './api';
import { PESTANAS_INFORMES } from './pestanas';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type ReportData,
} from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate, startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney, formatQuantity, toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { EmptyState, ErrorMessage, Loading } from '@/shared/ui/feedback';
import { Field, Input } from '@/shared/ui/field';
import { PageTabs } from '@/shared/ui/page-tabs';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

type Modo = ReportPeriod | 'custom';

const MODOS: { valor: Modo; label: string }[] = [
  { valor: 'day', label: 'Día' },
  { valor: 'week', label: 'Semana' },
  { valor: 'month', label: 'Mes' },
  { valor: 'custom', label: 'Rango personalizado' },
];

export function ReportsPage() {
  const { currency } = useAuth();

  const [modo, setModo] = useState<Modo>('day');
  const [fecha, setFecha] = useState(today());
  const [rango, setRango] = useState({ from: startOfMonth(), to: today() });
  const [descargando, setDescargando] = useState<'pdf' | 'xlsx' | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  const filtros: ReportFilters =
    modo === 'custom'
      ? { from: rango.from, to: rango.to }
      : { period: modo, date: fecha };

  const informe = useReportPreview(filtros);

  async function descargar(formato: 'pdf' | 'xlsx') {
    setErrorDescarga(null);
    setDescargando(formato);
    try {
      await downloadReport(formato, filtros);
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
        description="El resumen del negocio, listo para imprimir o guardar"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => descargar('xlsx')}
              disabled={descargando !== null}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {descargando === 'xlsx' ? 'Generando...' : 'Descargar Excel'}
            </Button>
            <Button onClick={() => descargar('pdf')} disabled={descargando !== null}>
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

            {modo === 'custom' ? (
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
                    onChange={(e) =>
                      e.target.value &&
                      setRango((previo) => ({ ...previo, to: e.target.value }))
                    }
                  />
                </Field>
              </div>
            ) : (
              <Field
                label="Fecha de referencia"
                hint="El informe cubre el día, la semana o el mes de esta fecha"
                className="sm:max-w-xs"
              >
                <Input
                  type="date"
                  value={fecha}
                  max={today()}
                  onChange={(e) => e.target.value && setFecha(e.target.value)}
                />
              </Field>
            )}
          </CardBody>
        </Card>

        {errorDescarga && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorDescarga}
          </p>
        )}

        {informe.isError ? (
          <Card>
            <ErrorMessage error={informe.error} onRetry={() => informe.refetch()} />
          </Card>
        ) : informe.isLoading || !informe.data ? (
          <Card>
            <Loading rows={6} />
          </Card>
        ) : (
          <VistaPrevia datos={informe.data} currency={currency} />
        )}
      </div>
    </>
  );
}

function VistaPrevia({ datos, currency }: { datos: ReportData; currency: string }) {
  const { kpis, period } = datos;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
          {period.label}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Del {formatDate(period.from)} al {formatDate(period.to)} ·{' '}
          {datos.business.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKpi
          titulo="Ventas"
          valor={formatMoney(kpis.sales, currency)}
          nota={contar(kpis.salesCount, 'venta', 'ventas')}
          icono={<TrendingUp className="h-5 w-5" />}
          tono="verde"
        />
        <TarjetaKpi
          titulo="Gastos"
          valor={formatMoney(kpis.expenses, currency)}
          nota={contar(kpis.expensesCount, 'gasto', 'gastos')}
          icono={<Receipt className="h-5 w-5" />}
          tono="naranja"
        />
        <TarjetaKpi
          titulo="Beneficio"
          valor={formatMoney(kpis.profit, currency)}
          nota={toNumber(kpis.profit) < 0 ? 'El periodo cierra en negativo' : 'Ventas menos gastos'}
          icono={<Wallet className="h-5 w-5" />}
          tono="azul"
        />
        <TarjetaKpi
          titulo="Ticket medio"
          valor={formatMoney(kpis.averageTicket, currency)}
          nota="Por venta"
          icono={<ShoppingBag className="h-5 w-5" />}
          tono="ambar"
        />
      </div>

      <Card>
        <CardHeader title="Día a día" description="Lo que entró y salió cada jornada" />
        {!datos.daily.length ? (
          <EmptyState title="Sin movimientos en este periodo" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th align="right">Ventas</Th>
                <Th align="right">Gastos</Th>
                <Th align="right">Beneficio</Th>
              </tr>
            </thead>
            <tbody>
              {datos.daily.map((dia) => (
                <Tr key={dia.date}>
                  <Td className="whitespace-nowrap font-medium text-slate-900">
                    {formatDate(dia.date)}
                  </Td>
                  <Td align="right">{formatMoney(dia.sales, currency)}</Td>
                  <Td align="right">{formatMoney(dia.expenses, currency)}</Td>
                  <Td
                    align="right"
                    className={cn(
                      'font-medium',
                      toNumber(dia.profit) < 0 ? 'text-red-600' : 'text-slate-900',
                    )}
                  >
                    {formatMoney(dia.profit, currency)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Cómo te pagaron" description="Ventas por forma de pago" />
          {!datos.byPaymentMethod.length ? (
            <EmptyState title="Sin ventas en este periodo" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Forma de pago</Th>
                  <Th align="right">Ventas</Th>
                  <Th align="right">Nº</Th>
                  <Th align="right">%</Th>
                </tr>
              </thead>
              <tbody>
                {datos.byPaymentMethod.map((fila) => (
                  <Tr key={fila.paymentMethod}>
                    <Td className="font-medium text-slate-900">
                      {PAYMENT_METHOD_LABELS[fila.paymentMethod as PaymentMethod] ??
                        fila.paymentMethod}
                    </Td>
                    <Td align="right">{formatMoney(fila.total, currency)}</Td>
                    <Td align="right">{fila.count}</Td>
                    <Td align="right" className="text-slate-500">
                      {fila.percentage}%
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="En qué se fue el dinero"
            description="Gastos por categoría"
          />
          {!datos.byExpenseCategory.length ? (
            <EmptyState title="Sin gastos en este periodo" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Categoría</Th>
                  <Th align="right">Gastos</Th>
                  <Th align="right">Nº</Th>
                  <Th align="right">%</Th>
                </tr>
              </thead>
              <tbody>
                {datos.byExpenseCategory.map((fila) => (
                  <Tr key={fila.name}>
                    <Td className="font-medium text-slate-900">{fila.name}</Td>
                    <Td align="right">{formatMoney(fila.total, currency)}</Td>
                    <Td align="right">{fila.count}</Td>
                    <Td align="right" className="text-slate-500">
                      {fila.percentage}%
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Lo que más se vendió"
          description="Productos ordenados por ingresos"
        />
        {!datos.topProducts.length ? (
          <EmptyState title="Sin ventas de productos en este periodo" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th align="right">Cantidad</Th>
                <Th align="right">Ingresos</Th>
                <Th align="right">Margen</Th>
              </tr>
            </thead>
            <tbody>
              {datos.topProducts.map((producto) => (
                <Tr key={producto.name}>
                  <Td className="font-medium text-slate-900">{producto.name}</Td>
                  <Td align="right">{formatQuantity(producto.quantity)}</Td>
                  <Td align="right">{formatMoney(producto.revenue, currency)}</Td>
                  <Td align="right">{formatMoney(producto.margin, currency)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

const TONOS = {
  verde: 'bg-emerald-50 text-emerald-600',
  naranja: 'bg-orange-50 text-orange-600',
  azul: 'bg-marca-50 text-marca-600',
  ambar: 'bg-amber-50 text-amber-600',
};

function TarjetaKpi({
  titulo,
  valor,
  nota,
  icono,
  tono,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  icono: ReactNode;
  tono: keyof typeof TONOS;
}) {
  return (
    <Card className="h-full">
      <CardBody className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{titulo}</p>
          <p className="tabular mt-1 truncate text-2xl font-bold text-slate-900">
            {valor}
          </p>
          {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
        </div>
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            TONOS[tono],
          )}
        >
          {icono}
        </span>
      </CardBody>
    </Card>
  );
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
