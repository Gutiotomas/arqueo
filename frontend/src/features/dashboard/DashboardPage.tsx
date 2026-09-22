import {
  ArrowDownRight,
  ArrowUpRight,
  FileDown,
  Package,
  PackageX,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  useExpensesByCategory,
  useLosses,
  useLowStock,
  useSalesByPaymentMethod,
  useSummary,
  useTimeseries,
  useTopProducts,
} from './api';
import {
  ExpenseCategoryBars,
  IncomeExpenseChart,
  PaymentMethodDonut,
} from './charts';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { downloadFile } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney, formatPercent, formatQuantity } from '@/shared/lib/money';
import { cantidadConUnidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { Badge, EmptyState, ErrorMessage, Loading } from '@/shared/ui/feedback';
import {
  MobileCard,
  MobileList,
  TableWrapper,
} from '@/shared/ui/mobile-list';
import { RangePicker, type Rango } from '@/shared/ui/range-picker';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

export function DashboardPage() {
  const { currency } = useAuth();
  const [rango, setRango] = useState<Rango>({
    from: startOfMonth(),
    to: today(),
  });
  const [descargando, setDescargando] = useState(false);

  const resumen = useSummary(rango);
  const serie = useTimeseries(rango, 'day');
  const formasDePago = useSalesByPaymentMethod(rango);
  const categorias = useExpensesByCategory(rango);
  const topProductos = useTopProducts(rango);
  const bajoStock = useLowStock();
  const perdidas = useLosses(rango);

  async function descargarInforme() {
    setDescargando(true);
    try {
      await downloadFile('/reports/pdf', rango, 'arqueo-informe.pdf');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Cómo va el negocio en el periodo elegido"
        action={
          <Button
            variant="secondary"
            onClick={descargarInforme}
            disabled={descargando}
          >
            <FileDown className="h-4 w-4" />
            {descargando ? 'Generando...' : 'Informe PDF'}
          </Button>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <RangePicker value={rango} onChange={setRango} />

        {resumen.isError ? (
          <Card>
            <ErrorMessage
              error={resumen.error}
              onRetry={() => resumen.refetch()}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              titulo="Ventas"
              valor={
                resumen.data ? formatMoney(resumen.data.sales, currency) : '—'
              }
              nota={
                resumen.data
                  ? `${resumen.data.salesCount} venta${resumen.data.salesCount === 1 ? '' : 's'}`
                  : ''
              }
              cambio={resumen.data?.change.sales ?? null}
              icono={<TrendingUp className="h-5 w-5" />}
              tono="verde"
              cargando={resumen.isLoading}
            />
            <KpiCard
              titulo="Utilidad bruta"
              valor={
                resumen.data
                  ? formatMoney(resumen.data.grossProfit, currency)
                  : '—'
              }
              nota={
                resumen.data
                  ? `${resumen.data.grossMargin}% de margen · costo ${formatMoney(resumen.data.cogs, currency)}`
                  : ''
              }
              cambio={resumen.data?.change.grossProfit ?? null}
              icono={<Package className="h-5 w-5" />}
              tono="azul"
              cargando={resumen.isLoading}
              enlace="/contabilidad"
            />
            <KpiCard
              titulo="Gastos"
              valor={
                resumen.data
                  ? formatMoney(resumen.data.expenses, currency)
                  : '—'
              }
              nota={
                resumen.data
                  ? `${resumen.data.expensesCount} gasto${resumen.data.expensesCount === 1 ? '' : 's'} de operar`
                  : ''
              }
              cambio={resumen.data?.change.expenses ?? null}
              invertirColorCambio
              icono={<Receipt className="h-5 w-5" />}
              tono="naranja"
              cargando={resumen.isLoading}
            />
            <KpiCard
              titulo="Utilidad neta"
              valor={
                resumen.data ? formatMoney(resumen.data.profit, currency) : '—'
              }
              nota={
                resumen.data
                  ? Number(resumen.data.profit) >= 0
                    ? 'El negocio va ganando'
                    : 'El negocio va perdiendo'
                  : ''
              }
              cambio={resumen.data?.change.profit ?? null}
              icono={<Wallet className="h-5 w-5" />}
              tono={
                resumen.data && Number(resumen.data.profit) < 0
                  ? 'rojo'
                  : 'verde'
              }
              cargando={resumen.isLoading}
              enlace="/contabilidad"
            />
          </div>
        )}

        {/* Los casos sin respuesta del proveedor se olvidan: aquí no. */}
        {perdidas.data && perdidas.data.pendingCount > 0 && (
          <Link
            to="/perdidas"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100"
          >
            <span className="flex items-center gap-3">
              <PackageX className="h-5 w-5 shrink-0 text-amber-600" />
              <span className="text-sm text-amber-900">
                <span className="font-medium">
                  {perdidas.data.pendingCount} caso
                  {perdidas.data.pendingCount === 1 ? '' : 's'} de mercancía
                  dañada sin respuesta del proveedor
                </span>
                <span className="block text-xs text-amber-700">
                  Hay {formatMoney(perdidas.data.pending, currency)} en juego
                  según lo que conteste
                </span>
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-amber-800">
              Ver
            </span>
          </Link>
        )}

        <Card>
          <CardHeader
            title="Ingresos y gastos"
            description="Día a día del periodo"
          />
          <CardBody>
            {serie.isLoading ? (
              <Loading rows={4} />
            ) : serie.isError ? (
              <ErrorMessage
                error={serie.error}
                onRetry={() => serie.refetch()}
              />
            ) : (
              <IncomeExpenseChart
                data={serie.data?.data ?? []}
                currency={currency}
              />
            )}
          </CardBody>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Cómo te pagan"
              description="Reparto de las ventas"
            />
            <CardBody>
              {formasDePago.isLoading ? (
                <Loading rows={3} />
              ) : (
                <PaymentMethodDonut
                  data={formasDePago.data?.data ?? []}
                  currency={currency}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="En qué se va el dinero"
              description="Gastos por categoría"
            />
            <CardBody>
              {categorias.isLoading ? (
                <Loading rows={4} />
              ) : (
                <ExpenseCategoryBars
                  data={categorias.data?.data ?? []}
                  currency={currency}
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="Lo que más se vende"
              description="Con su margen"
            />
            {topProductos.isLoading ? (
              <Loading rows={4} />
            ) : !topProductos.data?.data.length ? (
              <EmptyState title="Sin ventas de productos en este periodo" />
            ) : (
              <>
                <MobileList>
                  {topProductos.data.data.map((producto) => (
                    <MobileCard
                      key={producto.productId}
                      title={producto.name}
                      subtitle={`${cantidadConUnidad(producto.quantity, producto.unit)} vendidas`}
                      amount={formatMoney(producto.revenue, currency)}
                      details={[
                        {
                          label: 'Margen',
                          value: `${formatMoney(producto.margin, currency)} (${producto.marginPercentage}%)`,
                        },
                      ]}
                    />
                  ))}
                </MobileList>

                <TableWrapper>
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
                      {topProductos.data.data.map((producto) => (
                        <Tr key={producto.productId}>
                          <Td className="font-medium text-slate-900">
                            {producto.name}
                          </Td>
                          <Td align="right">
                            {cantidadConUnidad(producto.quantity, producto.unit)}
                          </Td>
                          <Td align="right">
                            {formatMoney(producto.revenue, currency)}
                          </Td>
                          <Td align="right">
                            <span className="text-slate-900">
                              {formatMoney(producto.margin, currency)}
                            </span>
                            <span className="ml-1 text-xs text-slate-500">
                              ({producto.marginPercentage}%)
                            </span>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrapper>
              </>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Hay que reponer"
              description="Productos en o por debajo del mínimo"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/inventario">Ver inventario</Link>
                </Button>
              }
            />
            {bajoStock.isLoading ? (
              <Loading rows={2} />
            ) : !bajoStock.data?.length ? (
              <EmptyState
                title="Todo en orden"
                message="Ningún producto está por debajo de su mínimo."
              />
            ) : (
              <>
                <MobileList>
                  {bajoStock.data.map((producto) => (
                    <MobileCard
                      key={producto.id}
                      title={producto.name}
                      subtitle={producto.category?.name ?? 'Sin categoría'}
                      amount={`${cantidadConUnidad(producto.stock, producto.unit)}`}
                      amountTone={
                        Number(producto.stock) <= 0 ? 'negative' : 'neutral'
                      }
                      badge={
                        Number(producto.stock) <= 0 ? (
                          <Badge tone="danger">Agotado</Badge>
                        ) : (
                          <Badge tone="warning">Bajo mínimo</Badge>
                        )
                      }
                      details={[
                        {
                          label: 'Mínimo',
                          value: `${cantidadConUnidad(producto.minStock, producto.unit)}`,
                        },
                      ]}
                    />
                  ))}
                </MobileList>

                <TableWrapper>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Producto</Th>
                        <Th align="right">Stock</Th>
                        <Th align="right">Mínimo</Th>
                        <Th align="right">Estado</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {bajoStock.data.map((producto) => (
                        <Tr key={producto.id}>
                          <Td className="font-medium text-slate-900">
                            {producto.name}
                            {producto.category && (
                              <span className="block text-xs font-normal text-slate-500">
                                {producto.category.name}
                              </span>
                            )}
                          </Td>
                          <Td align="right">
                            {cantidadConUnidad(producto.stock, producto.unit)}
                          </Td>
                          <Td align="right">
                            {formatQuantity(producto.minStock)}
                          </Td>
                          <Td align="right">
                            {Number(producto.stock) <= 0 ? (
                              <Badge tone="danger">Agotado</Badge>
                            ) : (
                              <Badge tone="warning">Bajo mínimo</Badge>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrapper>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

const TONOS = {
  verde: 'bg-emerald-50 text-emerald-600',
  naranja: 'bg-orange-50 text-orange-600',
  azul: 'bg-marca-50 text-marca-600',
  ambar: 'bg-amber-50 text-amber-600',
  rojo: 'bg-red-50 text-red-600',
};

function KpiCard({
  titulo,
  valor,
  nota,
  cambio,
  invertirColorCambio,
  icono,
  tono,
  cargando,
  enlace,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  cambio?: number | null;
  invertirColorCambio?: boolean;
  icono: React.ReactNode;
  tono: keyof typeof TONOS;
  cargando?: boolean;
  enlace?: string;
}) {
  // En gastos, subir es malo: por eso se puede invertir el color.
  const positivo = (cambio ?? 0) >= 0;
  const bueno = invertirColorCambio ? !positivo : positivo;

  const contenido = (
    <Card
      className={cn('h-full', enlace && 'transition-shadow hover:shadow-md')}
    >
      <CardBody>
        {/*
          El icono va en la fila del título y no al lado del importe: con cuatro
          tarjetas en un portátil, el importe necesita todo el ancho para no
          cortarse.
        */}
        <div className="flex items-start justify-between gap-3">
          <p className="pt-1 text-sm font-medium text-slate-500">{titulo}</p>
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              TONOS[tono],
            )}
          >
            {icono}
          </span>
        </div>
        <div className="min-w-0">
          {cargando ? (
            <div className="mt-2 h-8 w-28 animate-pulse rounded bg-slate-100" />
          ) : (
            <p
              className="tabular mt-1 truncate text-2xl font-bold text-slate-900"
              title={valor}
            >
              {valor}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {nota && <p className="text-xs text-slate-500">{nota}</p>}
            {cambio !== null && cambio !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-xs font-medium',
                  bueno ? 'text-emerald-600' : 'text-red-600',
                )}
                title="Comparado con el periodo anterior"
              >
                {positivo ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {formatPercent(cambio)}
              </span>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );

  return enlace ? <Link to={enlace}>{contenido}</Link> : contenido;
}
