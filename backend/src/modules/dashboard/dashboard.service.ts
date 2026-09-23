import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { PaymentMethod } from '../../generated/prisma/enums';
import {
  parseBusinessDate,
  previousRange,
  todayInTimezone,
  type IsoDate,
} from '../../common/utils/dates';
import { money } from '../../common/utils/money';

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** Una fila de la serie temporal: un dia (o semana/mes) con sus totales. */
export interface TimeseriesPoint {
  bucket: IsoDate;
  sales: string;
  expenses: string;
  profit: string;
}

export type Granularity = 'day' | 'week' | 'month';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Si no mandan rango, el mes en curso segun la zona horaria del negocio. */
  async resolveRange(
    businessId: string,
    from?: string,
    to?: string,
  ): Promise<DateRange> {
    if (from && to) return { from, to };

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const hoy = todayInTimezone(business.timezone);

    return { from: from ?? `${hoy.slice(0, 7)}-01`, to: to ?? hoy };
  }

  /**
   * Los numeros grandes de la cabecera, con su variacion respecto al periodo
   * anterior del mismo tamano.
   */
  async summary(businessId: string, range: DateRange) {
    const anterior = previousRange(range.from, range.to);

    const [actual, previo, lowStockCount] = await Promise.all([
      this.totals(businessId, range),
      this.totals(businessId, anterior),
      this.prisma.product.count({
        where: {
          businessId,
          isActive: true,
          minStock: { gt: 0 },
          stock: { lte: this.prisma.product.fields.minStock },
        },
      }),
    ]);

    return {
      range,
      sales: actual.sales.toFixed(2),
      expenses: actual.expenses.toFixed(2),
      cogs: actual.cogs.toFixed(2),
      grossProfit: actual.grossProfit.toFixed(2),
      losses: actual.losses.toFixed(2),
      grossMargin: actual.sales.isZero()
        ? 0
        : Number(
            actual.grossProfit.dividedBy(actual.sales).times(100).toFixed(1),
          ),
      /** Utilidad neta: bruta menos los gastos de operar. */
      profit: actual.profit.toFixed(2),
      salesCount: actual.salesCount,
      expensesCount: actual.expensesCount,
      averageTicket: actual.averageTicket.toFixed(2),
      lowStockCount,
      previous: {
        range: anterior,
        sales: previo.sales.toFixed(2),
        expenses: previo.expenses.toFixed(2),
        grossProfit: previo.grossProfit.toFixed(2),
        profit: previo.profit.toFixed(2),
      },
      change: {
        sales: percentChange(previo.sales, actual.sales),
        expenses: percentChange(previo.expenses, actual.expenses),
        grossProfit: percentChange(previo.grossProfit, actual.grossProfit),
        profit: percentChange(previo.profit, actual.profit),
      },
    };
  }

  private async totals(businessId: string, range: DateRange) {
    const where = {
      businessId,
      date: {
        gte: parseBusinessDate(range.from),
        lte: parseBusinessDate(range.to),
      },
    };

    const [ventas, gastos, costo, merma, descuentos] = await Promise.all([
      this.prisma.sale.aggregate({
        where,
        _sum: { total: true, cardFee: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.costoDeLoVendido(businessId, range),
      this.prisma.stockLoss.aggregate({ where, _sum: { lossAmount: true } }),
      this.prisma.purchase.aggregate({ where, _sum: { discount: true } }),
    ]);

    const sales = money(ventas._sum.total ?? 0);
    const expenses = money(gastos._sum.amount ?? 0);
    const losses = money(merma._sum.lossAmount ?? 0);
    const cardFees = money(ventas._sum.cardFee ?? 0);
    // Utilidad bruta: lo que dejan las ventas descontando lo que costo la
    // mercancia. La neta ademas resta la merma, los gastos de operar y lo que
    // se quedo el datafono.
    const grossProfit = money(sales.minus(costo));

    return {
      sales,
      expenses,
      cogs: costo,
      grossProfit,
      losses,
      // Los descuentos de proveedores suman: no bajan el costo, son ingreso.
      profit: money(
        grossProfit
          .minus(losses)
          .minus(expenses)
          .minus(cardFees)
          .plus(descuentos._sum.discount ?? 0),
      ),
      salesCount: ventas._count,
      expensesCount: gastos._count,
      averageTicket: ventas._count
        ? money(sales.dividedBy(ventas._count))
        : new Prisma.Decimal(0),
    };
  }

  /** Costo congelado en cada linea de venta, no el costo de hoy. */
  private async costoDeLoVendido(businessId: string, range: DateRange) {
    const [fila] = await this.prisma.$queryRaw<{ cogs: Prisma.Decimal | null }[]>`
      SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0) AS cogs
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.business_id = ${businessId}::uuid
        AND s.date BETWEEN ${parseBusinessDate(range.from)} AND ${parseBusinessDate(range.to)}
    `;

    return money(fila?.cogs ?? 0);
  }

  /**
   * Serie de ingresos y gastos SIN HUECOS: generate_series crea todos los
   * dias del rango aunque no haya movimientos, que es justo lo que necesita
   * una grafica para no mentir.
   */
  async timeseries(
    businessId: string,
    range: DateRange,
    granularity: Granularity = 'day',
  ): Promise<TimeseriesPoint[]> {
    const step = { day: '1 day', week: '1 week', month: '1 month' }[granularity];
    const unit = granularity; // date_trunc acepta 'day' | 'week' | 'month'

    const rows = await this.prisma.$queryRaw<
      { bucket: Date; sales: Prisma.Decimal; expenses: Prisma.Decimal }[]
    >`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${unit}, ${parseBusinessDate(range.from)}::timestamp),
          date_trunc(${unit}, ${parseBusinessDate(range.to)}::timestamp),
          ${step}::interval
        ) AS bucket
      ),
      ventas AS (
        SELECT date_trunc(${unit}, date::timestamp) AS bucket, SUM(total) AS total
        FROM sales
        WHERE business_id = ${businessId}::uuid
          AND date BETWEEN ${parseBusinessDate(range.from)} AND ${parseBusinessDate(range.to)}
        GROUP BY 1
      ),
      gastos AS (
        SELECT date_trunc(${unit}, date::timestamp) AS bucket, SUM(amount) AS total
        FROM expenses
        WHERE business_id = ${businessId}::uuid
          AND date BETWEEN ${parseBusinessDate(range.from)} AND ${parseBusinessDate(range.to)}
        GROUP BY 1
      )
      SELECT
        b.bucket,
        COALESCE(v.total, 0) AS sales,
        COALESCE(g.total, 0) AS expenses
      FROM buckets b
      LEFT JOIN ventas v ON v.bucket = b.bucket
      LEFT JOIN gastos g ON g.bucket = b.bucket
      ORDER BY b.bucket ASC
    `;

    return rows.map((row) => {
      const sales = money(row.sales);
      const expenses = money(row.expenses);
      return {
        bucket: row.bucket.toISOString().slice(0, 10),
        sales: sales.toFixed(2),
        expenses: expenses.toFixed(2),
        profit: money(sales.minus(expenses)).toFixed(2),
      };
    });
  }

  /** Reparto de ventas por forma de pago (el donut del dashboard). */
  async salesByPaymentMethod(businessId: string, range: DateRange) {
    // La forma de pago va en cada linea: una venta puede ser mitad efectivo,
    // mitad fiada.
    const rows = await this.prisma.saleItem.groupBy({
      by: ['paymentMethod'],
      where: {
        sale: {
          businessId,
          date: {
            gte: parseBusinessDate(range.from),
            lte: parseBusinessDate(range.to),
          },
        },
      },
      _sum: { subtotal: true },
      _count: true,
    });

    const total = rows.reduce(
      (acc, row) => acc.plus(row._sum.subtotal ?? 0),
      new Prisma.Decimal(0),
    );

    return rows
      .map((row) => {
        const amount = money(row._sum.subtotal ?? 0);
        return {
          paymentMethod: row.paymentMethod as PaymentMethod,
          total: amount.toFixed(2),
          count: row._count,
          percentage: total.isZero()
            ? 0
            : Number(amount.dividedBy(total).times(100).toFixed(1)),
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));
  }

  /** Gastos agrupados por categoría (las barras del dashboard). */
  async expensesByCategory(businessId: string, range: DateRange) {
    const rows = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        businessId,
        date: {
          gte: parseBusinessDate(range.from),
          lte: parseBusinessDate(range.to),
        },
      },
      _sum: { amount: true },
      _count: true,
    });

    const categorias = await this.prisma.expenseCategory.findMany({
      where: { businessId },
      select: { id: true, name: true },
    });
    const nombre = new Map(categorias.map((c) => [c.id, c.name]));

    const total = rows.reduce(
      (acc, row) => acc.plus(row._sum.amount ?? 0),
      new Prisma.Decimal(0),
    );

    return rows
      .map((row) => {
        const amount = money(row._sum.amount ?? 0);
        return {
          categoryId: row.categoryId,
          name: row.categoryId
            ? (nombre.get(row.categoryId) ?? 'Categoría eliminada')
            : 'Sin categoría',
          total: amount.toFixed(2),
          count: row._count,
          percentage: total.isZero()
            ? 0
            : Number(amount.dividedBy(total).times(100).toFixed(1)),
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));
  }

  /**
   * Productos más vendidos del periodo, con su margen. Solo cuenta lineas
   * ligadas a un producto: los conceptos libres no son inventario.
   */
  async topProducts(businessId: string, range: DateRange, limit = 10) {
    const rows = await this.prisma.$queryRaw<
      {
        product_id: string;
        name: string;
        unit: string;
        quantity: Prisma.Decimal;
        revenue: Prisma.Decimal;
        cost: Prisma.Decimal;
      }[]
    >`
      SELECT
        p.id   AS product_id,
        p.name AS name,
        p.unit AS unit,
        SUM(si.quantity)                  AS quantity,
        SUM(si.subtotal)                  AS revenue,
        SUM(si.unit_cost * si.quantity)   AS cost
      FROM sale_items si
      JOIN sales s    ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.business_id = ${businessId}::uuid
        AND s.date BETWEEN ${parseBusinessDate(range.from)} AND ${parseBusinessDate(range.to)}
      GROUP BY p.id, p.name, p.unit
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => {
      const revenue = money(row.revenue);
      const cost = money(row.cost);
      return {
        productId: row.product_id,
        name: row.name,
        unit: row.unit,
        quantity: new Prisma.Decimal(row.quantity).toFixed(3),
        revenue: revenue.toFixed(2),
        cost: cost.toFixed(2),
        margin: money(revenue.minus(cost)).toFixed(2),
        marginPercentage: revenue.isZero()
          ? 0
          : Number(revenue.minus(cost).dividedBy(revenue).times(100).toFixed(1)),
      };
    });
  }

  lowStock(businessId: string) {
    return this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        minStock: { gt: 0 },
        stock: { lte: this.prisma.product.fields.minStock },
      },
      select: {
        id: true,
        name: true,
        unit: true,
        stock: true,
        minStock: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: { stock: 'asc' },
      take: 20,
    });
  }
}

/** Variacion porcentual respecto al periodo anterior; null si no hay base. */
function percentChange(
  previous: Prisma.Decimal,
  current: Prisma.Decimal,
): number | null {
  if (previous.isZero()) {
    return current.isZero() ? 0 : null;
  }
  return Number(
    current.minus(previous).dividedBy(previous.abs()).times(100).toFixed(1),
  );
}
