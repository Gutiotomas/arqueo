import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { parseBusinessDate } from '../../common/utils/dates';
import { money, toDecimal } from '../../common/utils/money';
import {
  CashClosingQueryDto,
  CreateCashClosingDto,
  UpdateCashClosingDto,
} from './dto/cash-closing.dto';

@Injectable()
export class CashClosingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string, query: CashClosingQueryDto) {
    return this.prisma.cashClosing.findMany({
      where: {
        businessId,
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: parseBusinessDate(query.from) } : {}),
                ...(query.to ? { lte: parseBusinessDate(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'desc' },
      include: { user: { select: { id: true, name: true } } },
      take: 200,
    });
  }

  async findOne(businessId: string, id: string) {
    const closing = await this.prisma.cashClosing.findFirst({
      where: { id, businessId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!closing) {
      throw new NotFoundException('Cierre de caja no encontrado');
    }

    return closing;
  }

  /**
   * Cuanto efectivo deberia haber en la caja al cerrar el dia:
   *   apertura + ventas en efectivo - gastos en efectivo - abonos a proveedor
   *
   * Se consulta antes de guardar, para que el dueno vea el esperado mientras
   * cuenta el dinero.
   */
  async preview(businessId: string, date: string, openingCash?: number) {
    const day = parseBusinessDate(date);

    const [ventas, gastos, abonos, reposiciones, existente] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { businessId, date: day, paymentMethod: 'CASH' },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: { businessId, date: day, paymentMethod: 'CASH' },
        _sum: { amount: true },
        _count: true,
      }),
      // Lo que se le pago al proveedor en efectivo sale de la misma caja.
      this.prisma.purchasePayment.aggregate({
        where: { businessId, date: day, paymentMethod: 'CASH' },
        _sum: { amount: true },
        _count: true,
      }),
      // Y lo que se pago en efectivo por reponer mercancia danada, tambien.
      // Se cuenta el dia que el proveedor cobro (resolvedAt), que no tiene por
      // que ser el dia que la mercancia se dano.
      this.prisma.stockLoss.aggregate({
        where: {
          businessId,
          resolvedAt: day,
          resolution: 'DISCOUNTED',
          paymentMethod: 'CASH',
        },
        _sum: { lossAmount: true },
      }),
      this.prisma.cashClosing.findUnique({
        where: { businessId_date: { businessId, date: day } },
      }),
    ]);

    const cashSales = ventas._sum.total ?? new Prisma.Decimal(0);
    const cashExpenses = gastos._sum.amount ?? new Prisma.Decimal(0);
    const cashSupplierPayments = (abonos._sum.amount ?? new Prisma.Decimal(0)).plus(
      reposiciones._sum.lossAmount ?? 0,
    );
    const opening = money(
      openingCash ?? (existente ? toDecimal(existente.openingCash) : 0),
    );
    const expected = money(
      opening.plus(cashSales).minus(cashExpenses).minus(cashSupplierPayments),
    );

    return {
      date,
      openingCash: opening.toFixed(2),
      cashSales: cashSales.toFixed(2),
      cashSalesCount: ventas._count,
      cashExpenses: cashExpenses.toFixed(2),
      cashExpensesCount: gastos._count,
      cashSupplierPayments: cashSupplierPayments.toFixed(2),
      cashSupplierPaymentsCount: abonos._count,
      expectedCash: expected.toFixed(2),
      /** Si ya existe un cierre de ese dia, se devuelve para poder editarlo. */
      existingClosingId: existente?.id ?? null,
    };
  }

  async create(businessId: string, userId: string, dto: CreateCashClosingDto) {
    const { expected } = await this.calcular(businessId, dto.date, dto.openingCash);
    const closingCash = money(dto.closingCash);

    return this.prisma.cashClosing.create({
      data: {
        businessId,
        userId,
        date: parseBusinessDate(dto.date),
        openingCash: money(dto.openingCash),
        closingCash,
        expectedCash: expected,
        difference: money(closingCash.minus(expected)),
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(businessId: string, id: string, dto: UpdateCashClosingDto) {
    const actual = await this.findOne(businessId, id);

    const fecha = dto.date ?? actual.date.toISOString().slice(0, 10);
    const apertura = money(dto.openingCash ?? toDecimal(actual.openingCash));
    const cierre = money(dto.closingCash ?? toDecimal(actual.closingCash));
    const { expected } = await this.calcular(businessId, fecha, apertura.toNumber());

    return this.prisma.cashClosing.update({
      where: { id },
      data: {
        date: parseBusinessDate(fecha),
        openingCash: apertura,
        closingCash: cierre,
        expectedCash: expected,
        difference: money(cierre.minus(expected)),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);
    await this.prisma.cashClosing.delete({ where: { id } });
    return { message: 'Cierre de caja eliminado' };
  }

  private async calcular(businessId: string, date: string, openingCash: number) {
    const preview = await this.preview(businessId, date, openingCash);
    return { expected: money(preview.expectedCash) };
  }
}
