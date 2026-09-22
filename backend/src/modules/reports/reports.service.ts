import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { DashboardService, type DateRange } from '../dashboard/dashboard.service';
import {
  longDate,
  resolvePeriod,
  todayInTimezone,
  type PeriodType,
} from '../../common/utils/dates';
import { fileDate } from '../../common/utils/format';
import { money } from '../../common/utils/money';

/**
 * Los datos del informe. PDF y Excel se dibujan los dos a partir de ESTE
 * objeto: asi nunca se contradicen entre si ni con el dashboard.
 */
export interface ReportData {
  business: { name: string; currency: string; timezone: string };
  period: { type: PeriodType | 'custom'; label: string; from: string; to: string };
  generatedAt: string;
  kpis: {
    sales: string;
    /** Costo de la mercancia vendida. */
    cogs: string;
    grossProfit: string;
    grossMargin: number;
    /** Mercancia danada que el proveedor no repuso. */
    losses: string;
    lossesCount: number;
    expenses: string;
    /** Lo que se quedo el datafono de las ventas con tarjeta. */
    cardFees: string;
    /** Utilidad neta: bruta menos gastos de operar. */
    profit: string;
    salesCount: number;
    expensesCount: number;
    averageTicket: string;
  };
  /** Foto de la situacion, no del periodo. */
  position: {
    inventoryValue: string;
    supplierDebt: string;
    purchases: string;
    supplierPayments: string;
  };
  daily: { date: string; sales: string; expenses: string; profit: string }[];
  byPaymentMethod: { paymentMethod: string; total: string; count: number; percentage: number }[];
  byExpenseCategory: { name: string; total: string; count: number; percentage: number }[];
  topProducts: { name: string; quantity: string; revenue: string; margin: string }[];
  sales: {
    date: string;
    paymentMethod: string;
    total: string;
    notes: string | null;
    items: { description: string; quantity: string; unitPrice: string; subtotal: string }[];
  }[];
  expenses: {
    date: string;
    description: string;
    category: string;
    paymentMethod: string;
    amount: string;
  }[];
  cashClosings: {
    date: string;
    openingCash: string;
    closingCash: string;
    expectedCash: string;
    difference: string;
  }[];
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly accounting: AccountingService,
  ) {}

  /** Traduce (period,date) o (from,to) a un rango concreto. */
  async resolve(
    businessId: string,
    options: { period?: PeriodType; date?: string; from?: string; to?: string },
  ): Promise<{ range: DateRange; type: PeriodType | 'custom'; label: string }> {
    if (options.from && options.to) {
      return {
        range: { from: options.from, to: options.to },
        type: 'custom',
        label: `Del ${longDate(options.from)} al ${longDate(options.to)}`,
      };
    }

    if (!options.period) {
      throw new BadRequestException(
        'Indica period=day|week|month (con date) o bien from y to',
      );
    }

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const hoy = todayInTimezone(business.timezone);
    const date = options.date ?? hoy;
    const { from, to, label } = resolvePeriod(options.period, date);

    // Un informe del mes en curso no debe listar los dias que aun no han
    // pasado: ensucian la tabla con ceros que no significan nada.
    return {
      range: { from, to: to > hoy ? hoy : to },
      type: options.period,
      label,
    };
  }

  async build(
    businessId: string,
    range: DateRange,
    meta: { type: PeriodType | 'custom'; label: string },
  ): Promise<ReportData> {
    const [
      business,
      summary,
      contabilidad,
      daily,
      byPaymentMethod,
      byExpenseCategory,
      topProducts,
      ventas,
      gastos,
      cierres,
    ] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, currency: true, timezone: true },
      }),
      this.dashboard.summary(businessId, range),
      this.accounting.overview(businessId, range),
      this.dashboard.timeseries(businessId, range, 'day'),
      this.dashboard.salesByPaymentMethod(businessId, range),
      this.dashboard.expensesByCategory(businessId, range),
      this.dashboard.topProducts(businessId, range, 10),
      this.prisma.sale.findMany({
        where: { businessId, date: { gte: day(range.from), lte: day(range.to) } },
        include: { items: true },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.expense.findMany({
        where: { businessId, date: { gte: day(range.from), lte: day(range.to) } },
        include: { category: { select: { name: true } } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.cashClosing.findMany({
        where: { businessId, date: { gte: day(range.from), lte: day(range.to) } },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      business,
      period: { type: meta.type, label: meta.label, from: range.from, to: range.to },
      generatedAt: new Date().toISOString(),
      kpis: {
        sales: contabilidad.sales,
        cogs: contabilidad.cogs,
        grossProfit: contabilidad.grossProfit,
        grossMargin: contabilidad.grossMargin,
        losses: contabilidad.losses,
        lossesCount: contabilidad.lossesCount,
        expenses: contabilidad.operatingExpenses,
        cardFees: contabilidad.cardFees,
        profit: contabilidad.netProfit,
        salesCount: summary.salesCount,
        expensesCount: summary.expensesCount,
        averageTicket: summary.averageTicket,
      },
      position: {
        inventoryValue: contabilidad.inventoryValue,
        supplierDebt: contabilidad.supplierDebt,
        purchases: contabilidad.purchases,
        supplierPayments: contabilidad.supplierPayments,
      },
      daily: daily.map((punto) => ({
        date: punto.bucket,
        sales: punto.sales,
        expenses: punto.expenses,
        profit: punto.profit,
      })),
      byPaymentMethod: byPaymentMethod.map((fila) => ({
        paymentMethod: PAYMENT_METHOD_LABELS[fila.paymentMethod] ?? fila.paymentMethod,
        total: fila.total,
        count: fila.count,
        percentage: fila.percentage,
      })),
      byExpenseCategory: byExpenseCategory.map((fila) => ({
        name: fila.name,
        total: fila.total,
        count: fila.count,
        percentage: fila.percentage,
      })),
      topProducts: topProducts.map((fila) => ({
        name: fila.name,
        quantity: fila.quantity,
        revenue: fila.revenue,
        margin: fila.margin,
      })),
      sales: ventas.map((venta) => ({
        date: iso(venta.date),
        paymentMethod:
          PAYMENT_METHOD_LABELS[venta.paymentMethod] ?? venta.paymentMethod,
        total: money(venta.total).toFixed(2),
        notes: venta.notes,
        items: venta.items.map((item) => ({
          description: item.description,
          quantity: item.quantity.toFixed(3),
          unitPrice: money(item.unitPrice).toFixed(2),
          subtotal: money(item.subtotal).toFixed(2),
        })),
      })),
      expenses: gastos.map((gasto) => ({
        date: iso(gasto.date),
        description: gasto.description,
        category: gasto.category?.name ?? 'Sin categoría',
        paymentMethod:
          PAYMENT_METHOD_LABELS[gasto.paymentMethod] ?? gasto.paymentMethod,
        amount: money(gasto.amount).toFixed(2),
      })),
      cashClosings: cierres.map((cierre) => ({
        date: iso(cierre.date),
        openingCash: money(cierre.openingCash).toFixed(2),
        closingCash: money(cierre.closingCash).toFixed(2),
        expectedCash: money(cierre.expectedCash).toFixed(2),
        difference: money(cierre.difference).toFixed(2),
      })),
    };
  }

  /**
   * Nombre del fichero, en castellano y con la fecha como se lee aqui:
   *   arqueo-dia-19-09-2026.pdf
   *   arqueo-semana-14-09-2026.pdf   (el lunes en que empieza)
   *   arqueo-mes-09-2026.pdf
   *   arqueo-01-09-2026-a-19-09-2026.pdf   (rango libre)
   */
  fileName(data: ReportData, extension: 'pdf' | 'xlsx'): string {
    const desde = fileDate(data.period.from);

    switch (data.period.type) {
      case 'day':
        return `arqueo-dia-${desde}.${extension}`;
      case 'week':
        return `arqueo-semana-${desde}.${extension}`;
      case 'month':
        return `arqueo-mes-${desde.slice(3)}.${extension}`;
      default:
        return `arqueo-${desde}-a-${fileDate(data.period.to)}.${extension}`;
    }
  }
}

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}
