import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { parseBusinessDate, previousRange } from '../../common/utils/dates';
import { money, toDecimal } from '../../common/utils/money';
import type { DateRange } from '../dashboard/dashboard.service';

/**
 * Contabilidad del negocio.
 *
 * La idea que ordena todo esto: **comprar mercancia no es un gasto**. Es
 * cambiar dinero (o deuda) por inventario, que sigue siendo tuyo. El gasto
 * aparece cuando esa mercancia se vende, y se llama costo de lo vendido.
 *
 *   Ventas
 *   − Costo de lo vendido      (lo que te costo a ti lo que vendiste)
 *   = Utilidad bruta           (el margen de verdad)
 *   − Mercancia perdida        (lo danado que el proveedor no repuso)
 *   − Gastos de operar         (arriendo, servicios, nomina...)
 *   − Comisiones del datafono  (lo que se queda el banco de las ventas con tarjeta)
 *   = Utilidad neta            (si esto es negativo, el negocio pierde)
 */
@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async profitAndLoss(businessId: string, range: DateRange) {
    const [actual, anterior] = await Promise.all([
      this.calcular(businessId, range),
      this.calcular(businessId, previousRange(range.from, range.to)),
    ]);

    return {
      range,
      ...this.serializar(actual),
      previous: this.serializar(anterior),
      change: {
        sales: variacion(anterior.sales, actual.sales),
        grossProfit: variacion(anterior.grossProfit, actual.grossProfit),
        netProfit: variacion(anterior.netProfit, actual.netProfit),
      },
    };
  }

  /**
   * La foto completa: como fue el periodo y como esta el negocio hoy
   * (lo que tienes en mercancia frente a lo que debes).
   */
  async overview(businessId: string, range: DateRange) {
    const [resultado, inventario, deuda, compras, abonos] = await Promise.all([
      this.profitAndLoss(businessId, range),
      this.valorInventario(businessId),
      this.deudaProveedores(businessId),
      this.comprasDelPeriodo(businessId, range),
      this.abonosDelPeriodo(businessId, range),
    ]);

    const utilidadNeta = toDecimal(resultado.netProfit);

    return {
      ...resultado,
      /** Lo que hay guardado en el almacen, valorado al costo promedio. */
      inventoryValue: inventario.value,
      inventoryUnits: inventario.units,
      /** Lo que se le debe a los proveedores ahora mismo. */
      supplierDebt: deuda.toFixed(2),
      /** Mercancia comprada en el periodo (no es gasto: es inventario). */
      purchases: compras.toFixed(2),
      /** Lo que realmente salio de caja para pagar a proveedores. */
      supplierPayments: abonos.toFixed(2),
      /**
       * Inventario menos deuda: si es negativo, debes mas de lo que tienes
       * guardado en mercancia.
       */
      workingCapital: money(toDecimal(inventario.value).minus(deuda)).toFixed(2),
      verdict: utilidadNeta.greaterThan(0)
        ? ('profit' as const)
        : utilidadNeta.lessThan(0)
          ? ('loss' as const)
          : ('breakeven' as const),
    };
  }

  // ------------------------------------------------------------------

  private async calcular(businessId: string, range: DateRange) {
    const where = {
      businessId,
      date: {
        gte: parseBusinessDate(range.from),
        lte: parseBusinessDate(range.to),
      },
    };

    const [ventas, gastos, costo, merma] = await Promise.all([
      this.prisma.sale.aggregate({
        where,
        _sum: { total: true, cardFee: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.costoDeLoVendido(businessId, range),
      this.prisma.stockLoss.aggregate({
        where,
        _sum: { lossAmount: true },
        _count: true,
      }),
    ]);

    const sales = money(ventas._sum.total ?? 0);
    const operatingExpenses = money(gastos._sum.amount ?? 0);
    const losses = money(merma._sum.lossAmount ?? 0);
    const cardFees = money(ventas._sum.cardFee ?? 0);
    const grossProfit = money(sales.minus(costo));

    return {
      sales,
      cogs: costo,
      grossProfit,
      losses,
      operatingExpenses,
      cardFees,
      netProfit: money(
        grossProfit.minus(losses).minus(operatingExpenses).minus(cardFees),
      ),
      salesCount: ventas._count,
      expensesCount: gastos._count,
      lossesCount: merma._count,
    };
  }

  /**
   * Cuanto costo la mercancia que se vendio. Se suma el costo que quedo
   * congelado en cada linea de venta, no el costo de hoy: si el proveedor
   * subio los precios la semana pasada, el margen de hace un mes no cambia.
   */
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

  private async valorInventario(businessId: string) {
    const [fila] = await this.prisma.$queryRaw<
      { value: Prisma.Decimal | null; units: Prisma.Decimal | null }[]
    >`
      SELECT
        COALESCE(SUM(stock * cost_price), 0) AS value,
        COALESCE(SUM(stock), 0)             AS units
      FROM products
      WHERE business_id = ${businessId}::uuid
        AND is_active = true
        AND stock > 0
    `;

    return {
      value: money(fila?.value ?? 0).toFixed(2),
      units: new Prisma.Decimal(fila?.units ?? 0).toFixed(3),
    };
  }

  private async deudaProveedores(businessId: string) {
    const [fila] = await this.prisma.$queryRaw<{ debt: Prisma.Decimal | null }[]>`
      SELECT COALESCE(SUM(total - paid_amount), 0) AS debt
      FROM purchases
      WHERE business_id = ${businessId}::uuid
        AND total > paid_amount
    `;

    return money(fila?.debt ?? 0);
  }

  private async comprasDelPeriodo(businessId: string, range: DateRange) {
    const agregado = await this.prisma.purchase.aggregate({
      where: {
        businessId,
        // Una deuda anterior es mercancia de antes, no de este periodo.
        isOpeningBalance: false,
        date: {
          gte: parseBusinessDate(range.from),
          lte: parseBusinessDate(range.to),
        },
      },
      _sum: { total: true },
    });

    return money(agregado._sum.total ?? 0);
  }

  private async abonosDelPeriodo(businessId: string, range: DateRange) {
    const agregado = await this.prisma.purchasePayment.aggregate({
      where: {
        businessId,
        date: {
          gte: parseBusinessDate(range.from),
          lte: parseBusinessDate(range.to),
        },
      },
      _sum: { amount: true },
    });

    return money(agregado._sum.amount ?? 0);
  }

  private serializar(datos: Awaited<ReturnType<AccountingService['calcular']>>) {
    return {
      sales: datos.sales.toFixed(2),
      cogs: datos.cogs.toFixed(2),
      grossProfit: datos.grossProfit.toFixed(2),
      grossMargin: porcentaje(datos.grossProfit, datos.sales),
      /** Mercancia danada que el proveedor no repuso, valorada al costo. */
      losses: datos.losses.toFixed(2),
      lossesCount: datos.lossesCount,
      operatingExpenses: datos.operatingExpenses.toFixed(2),
      /** Lo que se quedo el datafono de las ventas con tarjeta. */
      cardFees: datos.cardFees.toFixed(2),
      netProfit: datos.netProfit.toFixed(2),
      netMargin: porcentaje(datos.netProfit, datos.sales),
      salesCount: datos.salesCount,
      expensesCount: datos.expensesCount,
    };
  }
}

function porcentaje(parte: Prisma.Decimal, total: Prisma.Decimal): number {
  if (total.isZero()) return 0;
  return Number(parte.dividedBy(total).times(100).toFixed(1));
}

function variacion(previo: Prisma.Decimal, actual: Prisma.Decimal): number | null {
  if (previo.isZero()) return actual.isZero() ? 0 : null;
  return Number(actual.minus(previo).dividedBy(previo.abs()).times(100).toFixed(1));
}
