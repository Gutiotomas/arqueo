import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from 'recharts';

import { formatDayMonth, formatDate } from '@/shared/lib/dates';
import { formatMoney, formatMoneyShort, toNumber } from '@/shared/lib/money';
import type {
  CategorySlice,
  PaymentMethodSlice,
  TimeseriesPoint,
} from '@/shared/api/types';
import { PAYMENT_METHOD_LABELS } from '@/shared/api/types';
import { EmptyState } from '@/shared/ui/feedback';

/*
 * Colores de una paleta validada para daltonismo y contraste sobre fondo
 * claro. No se eligieron "a ojo": el verde y el naranja mantienen distancia
 * suficiente tambien en vision deuteranope y protanope.
 */
const COLOR_VENTAS = '#1baf7a';
const COLOR_GASTOS = '#eb6834';
const COLORES_PAGO = ['#2a78d6', '#eb6834', '#1baf7a', '#94a3b8', '#b45309'];
const EJE = '#94a3b8';
const REJILLA = '#e2e8f0';

const estiloTooltip = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  fontSize: 13,
  boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)',
};

/** Ingresos contra gastos a lo largo del tiempo. */
export function IncomeExpenseChart({
  data,
  currency,
}: {
  data: TimeseriesPoint[];
  currency: string;
}) {
  if (!data.length) {
    return <EmptyState title="Sin datos en este periodo" />;
  }

  const puntos = data.map((punto) => ({
    fecha: punto.bucket,
    etiqueta: formatDayMonth(punto.bucket),
    ventas: toNumber(punto.sales),
    gastos: toNumber(punto.expenses),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={puntos} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="relleno-ventas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_VENTAS} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COLOR_VENTAS} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="relleno-gastos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_GASTOS} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COLOR_GASTOS} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={REJILLA} vertical={false} />
        <XAxis
          dataKey="etiqueta"
          tick={{ fontSize: 11, fill: EJE }}
          tickLine={false}
          axisLine={{ stroke: REJILLA }}
          minTickGap={16}
        />
        <YAxis
          tick={{ fontSize: 11, fill: EJE }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(valor: number) => formatMoneyShort(valor, currency)}
        />
        <Tooltip
          contentStyle={estiloTooltip}
          cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
          formatter={(valor, nombre) => [
            formatMoney(Number(valor), currency),
            String(nombre),
          ]}
          labelFormatter={(_etiqueta, carga) =>
            formatDate(carga?.[0]?.payload?.fecha ?? '')
          }
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, color: '#475569' }}
        />
        <Area
          type="monotone"
          dataKey="ventas"
          name="Ventas"
          stroke={COLOR_VENTAS}
          strokeWidth={2}
          fill="url(#relleno-ventas)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
        />
        <Area
          type="monotone"
          dataKey="gastos"
          name="Gastos"
          stroke={COLOR_GASTOS}
          strokeWidth={2}
          fill="url(#relleno-gastos)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Reparto de las ventas por forma de cobro.
 *
 * La dona ocupa el ancho entero de la tarjeta y lleva el total en el centro;
 * la leyenda va debajo, no al lado, que es lo que la estrangulaba en pantallas
 * estrechas.
 */
export function PaymentMethodDonut({
  data,
  currency,
}: {
  data: PaymentMethodSlice[];
  currency: string;
}) {
  if (!data.length) {
    return <EmptyState title="Sin ventas en este periodo" />;
  }

  const porciones = data.map((fila) => ({
    nombre: PAYMENT_METHOD_LABELS[fila.paymentMethod] ?? fila.paymentMethod,
    valor: toNumber(fila.total),
    porcentaje: fila.percentage,
    veces: fila.count,
  }));

  const total = porciones.reduce((suma, porcion) => suma + porcion.valor, 0);

  return (
    // La leyenda se decide por el ancho de la tarjeta, no de la pantalla: con
    // el menú lateral, una pantalla ancha puede dejar la tarjeta estrecha.
    <div className="@container">
      <div className="relative">
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie
              data={porciones}
              dataKey="valor"
              nameKey="nombre"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
            >
              {porciones.map((_, indice) => (
                <Cell
                  key={indice}
                  fill={COLORES_PAGO[indice % COLORES_PAGO.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={estiloTooltip}
              formatter={(valor, nombre) => [
                formatMoney(Number(valor), currency),
                String(nombre),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* El total va dentro del agujero de la dona, no en una etiqueta aparte. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-slate-500">Total vendido</span>
          <span className="tabular text-lg font-bold text-slate-900">
            {formatMoneyShort(total, currency)}
          </span>
        </div>
      </div>

      {/* La leyenda lleva los valores: el color nunca es la única pista. */}
      <ul className="mt-3 grid gap-x-4 gap-y-2 @md:grid-cols-2">
        {porciones.map((porcion, indice) => (
          <li
            key={porcion.nombre}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORES_PAGO[indice % COLORES_PAGO.length] }}
              />
              <span className="truncate">{porcion.nombre}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="tabular block font-medium text-slate-900">
                {formatMoney(porcion.valor, currency)}
              </span>
              <span className="block text-xs text-slate-500">
                {porcion.porcentaje}% · {porcion.veces} venta
                {porcion.veces === 1 ? '' : 's'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Gastos por categoría: una sola serie, asi que basta un color. */
export function ExpenseCategoryBars({
  data,
  currency,
}: {
  data: CategorySlice[];
  currency: string;
}) {
  if (!data.length) {
    return <EmptyState title="Sin gastos en este periodo" />;
  }

  const filas = data.slice(0, 7).map((fila) => ({
    nombre: fila.name,
    valor: toNumber(fila.total),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, filas.length * 42)}>
      <BarChart
        data={filas}
        layout="vertical"
        margin={{ top: 4, right: 76, left: 4, bottom: 4 }}
      >
        <CartesianGrid stroke={REJILLA} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="nombre"
          width={120}
          tick={{ fontSize: 12, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={estiloTooltip}
          cursor={{ fill: '#f1f5f9' }}
          formatter={(valor) => [formatMoney(Number(valor), currency), 'Gastos']}
        />
        <Bar dataKey="valor" fill={COLOR_GASTOS} radius={[0, 4, 4, 0]} barSize={16}>
          <LabelList
            dataKey="valor"
            position="right"
            className="tabular"
            style={{ fontSize: 12, fill: '#334155' }}
            formatter={(valor) => formatMoneyShort(Number(valor), currency)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
