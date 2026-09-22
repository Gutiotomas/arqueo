import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  HandCoins,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useAccounting, useDebt } from './api';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/shared/lib/cn';
import { startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney, formatPercent, formatQuantity } from '@/shared/lib/money';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { ErrorMessage, Loading } from '@/shared/ui/feedback';
import { RangePicker, type Rango } from '@/shared/ui/range-picker';

export function AccountingPage() {
  const { currency } = useAuth();
  const [rango, setRango] = useState<Rango>({
    from: startOfMonth(),
    to: today(),
  });

  const conta = useAccounting(rango);
  const deuda = useDebt();

  return (
    <>
      <PageHeader
        title="Contabilidad"
        description="Si el negocio gana o pierde, y por qué"
      />

      <div className="space-y-4 p-4 sm:p-6">
        <RangePicker value={rango} onChange={setRango} />

        {conta.isLoading ? (
          <Card>
            <Loading rows={6} />
          </Card>
        ) : conta.isError ? (
          <Card>
            <ErrorMessage error={conta.error} onRetry={() => conta.refetch()} />
          </Card>
        ) : conta.data ? (
          <>
            <Veredicto datos={conta.data} currency={currency} />

            <div className="grid gap-4 lg:grid-cols-2">
              <EstadoDeResultados datos={conta.data} currency={currency} />

              <div className="space-y-4">
                <Card>
                  <CardHeader
                    title="Lo que tienes y lo que debes"
                    description="A día de hoy, no del periodo"
                  />
                  <CardBody className="space-y-3">
                    <FilaPatrimonio
                      icono={<Boxes className="h-5 w-5" />}
                      tono="azul"
                      titulo="Mercancía en inventario"
                      detalle={`${formatQuantity(conta.data.inventoryUnits)} unidades, valoradas al costo`}
                      valor={formatMoney(conta.data.inventoryValue, currency)}
                    />
                    <FilaPatrimonio
                      icono={<HandCoins className="h-5 w-5" />}
                      tono={Number(conta.data.supplierDebt) > 0 ? 'rojo' : 'verde'}
                      titulo="Deuda con proveedores"
                      detalle={
                        Number(conta.data.supplierDebt) > 0
                          ? 'Mercancía recibida que aún no has pagado'
                          : 'Estás al día con tus proveedores'
                      }
                      valor={formatMoney(conta.data.supplierDebt, currency)}
                      enlace="/compras"
                    />

                    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                      <span className="text-sm text-slate-600">
                        Inventario menos deuda
                        <span className="block text-xs text-slate-500">
                          Si es negativo, debes más de lo que tienes en mercancía
                        </span>
                      </span>
                      <span
                        className={cn(
                          'tabular shrink-0 font-semibold',
                          Number(conta.data.workingCapital) >= 0
                            ? 'text-emerald-700'
                            : 'text-red-700',
                        )}
                      >
                        {formatMoney(conta.data.workingCapital, currency)}
                      </span>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Movimiento con proveedores"
                    description="En el periodo elegido"
                  />
                  <CardBody className="space-y-2 text-sm">
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">
                        Mercancía comprada
                        <span className="block text-xs text-slate-500">
                          No es un gasto: entra al inventario
                        </span>
                      </span>
                      <span className="tabular font-medium text-slate-900">
                        {formatMoney(conta.data.purchases, currency)}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-slate-600">
                        Pagado a proveedores
                        <span className="block text-xs text-slate-500">
                          Esto sí salió de la caja
                        </span>
                      </span>
                      <span className="tabular font-medium text-slate-900">
                        {formatMoney(conta.data.supplierPayments, currency)}
                      </span>
                    </p>

                    {deuda.data && deuda.data.bySupplier.length > 0 && (
                      <div className="border-t border-slate-100 pt-2">
                        <p className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">
                          A quién le debes
                        </p>
                        <ul className="space-y-1.5">
                          {deuda.data.bySupplier.map((proveedor) => (
                            <li
                              key={proveedor.supplierId ?? proveedor.name}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="truncate text-slate-600">
                                {proveedor.name}
                              </span>
                              <span className="tabular shrink-0 text-slate-900">
                                {formatMoney(proveedor.balance, currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

/** El titular: ganando, perdiendo o en la raya. */
function Veredicto({
  datos,
  currency,
}: {
  datos: NonNullable<ReturnType<typeof useAccounting>['data']>;
  currency: string;
}) {
  const estilos = {
    profit: {
      fondo: 'bg-emerald-600',
      titulo: 'El negocio está ganando',
      icono: <TrendingUp className="h-6 w-6" />,
    },
    loss: {
      fondo: 'bg-red-600',
      titulo: 'El negocio está perdiendo',
      icono: <TrendingDown className="h-6 w-6" />,
    },
    breakeven: {
      fondo: 'bg-slate-600',
      titulo: 'El negocio está en la raya',
      icono: <Minus className="h-6 w-6" />,
    },
  }[datos.verdict];

  return (
    <div className={cn('rounded-xl px-5 py-5 text-white shadow-xs', estilos.fondo)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/15">
            {estilos.icono}
          </span>
          <span>
            <span className="block text-lg font-semibold">{estilos.titulo}</span>
            <span className="block text-sm text-white/80">
              De cada $100 que vendes te quedan ${Math.round(datos.netMargin)}{' '}
              después de pagarlo todo
            </span>
          </span>
        </div>

        <div className="text-left sm:text-right">
          <span className="tabular block text-3xl font-bold">
            {formatMoney(datos.netProfit, currency)}
          </span>
          <span className="block text-sm text-white/80">
            Utilidad neta del periodo
            {datos.change.netProfit !== null && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                {datos.change.netProfit >= 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {formatPercent(datos.change.netProfit)}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * El estado de resultados de toda la vida, en cristiano: de lo que entró,
 * cuánto costó la mercancía, qué queda de margen, qué se lleva la operación.
 */
function EstadoDeResultados({
  datos,
  currency,
}: {
  datos: NonNullable<ReturnType<typeof useAccounting>['data']>;
  currency: string;
}) {
  return (
    <Card>
      <CardHeader
        title="De dónde sale ese número"
        description="Estado de resultados del periodo"
      />
      <CardBody className="space-y-1">
        <Linea
          titulo="Ventas"
          detalle={`${datos.salesCount} venta${datos.salesCount === 1 ? '' : 's'}`}
          valor={formatMoney(datos.sales, currency)}
        />
        <Linea
          titulo="Costo de lo vendido"
          detalle="Lo que te costó a ti la mercancía que vendiste"
          valor={`− ${formatMoney(datos.cogs, currency)}`}
          tono="resta"
        />
        <Linea
          titulo="Utilidad bruta"
          detalle={`${datos.grossMargin}% de margen sobre las ventas`}
          valor={formatMoney(datos.grossProfit, currency)}
          tono="subtotal"
        />
        {Number(datos.losses) > 0 && (
          <Linea
            titulo="Mercancía perdida"
            detalle={`Dañada o vencida que el proveedor no repuso (${datos.lossesCount} caso${datos.lossesCount === 1 ? '' : 's'})`}
            valor={`− ${formatMoney(datos.losses, currency)}`}
            tono="resta"
          />
        )}
        <Linea
          titulo="Gastos de operar"
          detalle={`Arriendo, servicios, nómina... (${datos.expensesCount})`}
          valor={`− ${formatMoney(datos.operatingExpenses, currency)}`}
          tono="resta"
        />
        {Number(datos.cardFees) > 0 && (
          <Linea
            titulo="Comisiones del datáfono"
            detalle="Lo que se quedó el banco de las ventas con tarjeta"
            valor={`− ${formatMoney(datos.cardFees, currency)}`}
            tono="resta"
          />
        )}
        <Linea
          titulo="Utilidad neta"
          detalle={`${datos.netMargin}% sobre las ventas`}
          valor={formatMoney(datos.netProfit, currency)}
          tono={Number(datos.netProfit) >= 0 ? 'total' : 'totalNegativo'}
        />

        <p className="pt-2 text-xs text-slate-500">
          La mercancía que compras no aparece aquí como gasto: mientras esté en
          la bodega sigue siendo tuya. Se convierte en costo cuando la vendes.
        </p>
      </CardBody>
    </Card>
  );
}

function Linea({
  titulo,
  detalle,
  valor,
  tono = 'normal',
}: {
  titulo: string;
  detalle?: string;
  valor: string;
  tono?: 'normal' | 'resta' | 'subtotal' | 'total' | 'totalNegativo';
}) {
  const estilos = {
    normal: { fila: '', titulo: 'text-slate-700', valor: 'text-slate-900' },
    resta: { fila: '', titulo: 'text-slate-600', valor: 'text-red-700' },
    subtotal: {
      fila: 'border-t border-slate-200 pt-2 mt-1',
      titulo: 'font-medium text-slate-900',
      valor: 'font-semibold text-slate-900',
    },
    total: {
      fila: 'border-t-2 border-slate-900 pt-2 mt-1',
      titulo: 'font-semibold text-slate-900',
      valor: 'text-lg font-bold text-emerald-700',
    },
    totalNegativo: {
      fila: 'border-t-2 border-slate-900 pt-2 mt-1',
      titulo: 'font-semibold text-slate-900',
      valor: 'text-lg font-bold text-red-700',
    },
  }[tono];

  return (
    <div className={cn('flex items-start justify-between gap-3 py-1', estilos.fila)}>
      <span className="min-w-0">
        <span className={cn('block text-sm', estilos.titulo)}>{titulo}</span>
        {detalle && (
          <span className="block text-xs text-slate-500">{detalle}</span>
        )}
      </span>
      <span className={cn('tabular shrink-0', estilos.valor)}>{valor}</span>
    </div>
  );
}

function FilaPatrimonio({
  icono,
  tono,
  titulo,
  detalle,
  valor,
  enlace,
}: {
  icono: React.ReactNode;
  tono: 'azul' | 'rojo' | 'verde';
  titulo: string;
  detalle: string;
  valor: string;
  enlace?: string;
}) {
  const tonos = {
    azul: 'bg-marca-50 text-marca-600',
    rojo: 'bg-red-50 text-red-600',
    verde: 'bg-emerald-50 text-emerald-600',
  };

  const contenido = (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          tonos[tono],
        )}
      >
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-slate-900">{titulo}</span>
        <span className="block text-xs text-slate-500">{detalle}</span>
      </span>
      <span className="tabular shrink-0 font-semibold text-slate-900">{valor}</span>
    </div>
  );

  return enlace ? (
    <Link to={enlace} className="block rounded-lg transition-colors hover:bg-slate-50">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}
