import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { PaymentMethod } from '../../generated/prisma/enums';
import {
  formatBusinessDate,
  parseBusinessDate,
  todayInTimezone,
} from '../../common/utils/dates';
import { money, toDecimal } from '../../common/utils/money';
import {
  AccountQueryDto,
  CreateAccountClosingDto,
  CreateAccountMovementDto,
  UpdateAccountClosingDto,
} from './dto/bank-account.dto';

/**
 * Lo que mueve la cuenta: transferencias y tarjeta. El efectivo va a la caja
 * y "otro" no se sabe a donde va, asi que no cuenta en ninguna de las dos.
 */
const MEDIOS_DE_CUENTA: PaymentMethod[] = ['TRANSFER', 'CARD'];

const CERO = new Prisma.Decimal(0);

/** Periodo de fechas de negocio: despues de `desde` (sin incluirlo) hasta `hasta`. */
interface Tramo {
  desde: Date;
  hasta: Date;
}

/**
 * La cuenta del negocio: una sola, aunque en la vida real sean Nequi y
 * Bancolombia juntas (al cerrar se suma lo que dicen las dos apps).
 *
 * A diferencia de la caja, que cada dia abre con lo que se cuenta, el saldo de
 * la cuenta sigue de un dia para otro. Por eso cada cierre parte del saldo
 * real del cierre anterior y suma todo lo que paso desde entonces. El primer
 * cierre no tiene con que compararse: es el punto de partida.
 */
@Injectable()
export class BankAccountService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cuanto hay en la cuenta hoy, segun el ultimo cierre y lo que paso despues. */
  async summary(businessId: string) {
    const [ultimo, hoy] = await Promise.all([
      this.prisma.accountClosing.findFirst({
        where: { businessId },
        orderBy: { date: 'desc' },
      }),
      this.hoy(businessId),
    ]);

    if (!ultimo) {
      return { lastClosing: null, estimatedBalance: null, sinceLastClosing: null };
    }

    const flujos = await this.flujos(businessId, {
      desde: ultimo.date,
      hasta: parseBusinessDate(hoy),
    });

    return {
      lastClosing: {
        id: ultimo.id,
        date: formatBusinessDate(ultimo.date),
        closingBalance: ultimo.closingBalance.toFixed(2),
        difference: ultimo.difference.toFixed(2),
      },
      estimatedBalance: money(ultimo.closingBalance.plus(flujos.neto)).toFixed(2),
      sinceLastClosing: this.serializarFlujos(flujos),
    };
  }

  /**
   * Lo que deberia haber en la cuenta al cerrar un dia: el saldo real del
   * cierre anterior mas todo lo que entro y salio desde entonces.
   */
  async preview(businessId: string, date: string) {
    const dia = parseBusinessDate(date);

    const [anterior, existente, posterior] = await Promise.all([
      this.prisma.accountClosing.findFirst({
        where: { businessId, date: { lt: dia } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.accountClosing.findUnique({
        where: { businessId_date: { businessId, date: dia } },
      }),
      this.prisma.accountClosing.findFirst({
        where: { businessId, date: { gt: dia } },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
    ]);

    const base = {
      date,
      existingClosingId: existente?.id ?? null,
      /** Si hay un cierre despues, este dia ya no se puede cerrar ni corregir. */
      laterClosingDate: posterior ? formatBusinessDate(posterior.date) : null,
    };

    if (!anterior) {
      return {
        ...base,
        isStartingPoint: true,
        previousClosing: null,
        openingBalance: null,
        movements: null,
        expectedBalance: null,
      };
    }

    const flujos = await this.flujos(businessId, { desde: anterior.date, hasta: dia });

    return {
      ...base,
      isStartingPoint: false,
      previousClosing: {
        id: anterior.id,
        date: formatBusinessDate(anterior.date),
        closingBalance: anterior.closingBalance.toFixed(2),
      },
      openingBalance: anterior.closingBalance.toFixed(2),
      movements: this.serializarFlujos(flujos),
      expectedBalance: money(anterior.closingBalance.plus(flujos.neto)).toFixed(2),
    };
  }

  findClosings(businessId: string, query: AccountQueryDto) {
    return this.prisma.accountClosing.findMany({
      where: { businessId, ...this.filtroFechas(query) },
      orderBy: { date: 'desc' },
      include: { user: { select: { id: true, name: true } } },
      take: 200,
    });
  }

  async findClosing(businessId: string, id: string) {
    const cierre = await this.prisma.accountClosing.findFirst({
      where: { id, businessId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!cierre) {
      throw new NotFoundException('Cierre de cuenta no encontrado');
    }

    return cierre;
  }

  async createClosing(businessId: string, userId: string, dto: CreateAccountClosingDto) {
    const hoy = await this.hoy(businessId);
    if (dto.date > hoy) {
      throw new BadRequestException('No se puede cerrar un día que todavía no llega');
    }

    const preview = await this.preview(businessId, dto.date);

    if (preview.existingClosingId) {
      throw new BadRequestException('Ese día ya tiene cierre de cuenta: corrígelo en lugar de crear otro');
    }
    if (preview.laterClosingDate) {
      throw new BadRequestException(
        `Ya hay un cierre de cuenta posterior (${preview.laterClosingDate}). Los cierres van en orden: para cerrar un día anterior, borra primero los que vienen después.`,
      );
    }

    return this.prisma.accountClosing.create({
      data: {
        businessId,
        userId,
        date: parseBusinessDate(dto.date),
        ...this.cuadre(preview, dto.closingBalance),
        notes: dto.notes?.trim() || null,
      },
    });
  }

  /** Solo el ultimo: los siguientes partirian de un saldo que ya no es el mismo. */
  async updateClosing(businessId: string, id: string, dto: UpdateAccountClosingDto) {
    const cierre = await this.soloElUltimo(businessId, id, 'corregir');
    const preview = await this.preview(businessId, formatBusinessDate(cierre.date));

    return this.prisma.accountClosing.update({
      where: { id },
      data: {
        ...this.cuadre(preview, dto.closingBalance ?? toDecimal(cierre.closingBalance)),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
  }

  async removeClosing(businessId: string, id: string) {
    await this.soloElUltimo(businessId, id, 'borrar');
    await this.prisma.accountClosing.delete({ where: { id } });
    return { message: 'Cierre de cuenta eliminado' };
  }

  findMovements(businessId: string, query: AccountQueryDto) {
    return this.prisma.accountMovement.findMany({
      where: { businessId, ...this.filtroFechas(query) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  createMovement(businessId: string, userId: string, dto: CreateAccountMovementDto) {
    return this.prisma.accountMovement.create({
      data: {
        businessId,
        userId,
        date: parseBusinessDate(dto.date),
        type: dto.type,
        amount: money(dto.amount),
        description: dto.description?.trim() || null,
      },
    });
  }

  async removeMovement(businessId: string, id: string) {
    const movimiento = await this.prisma.accountMovement.findFirst({
      where: { id, businessId },
    });

    if (!movimiento) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    await this.prisma.accountMovement.delete({ where: { id } });
    return { message: 'Movimiento eliminado' };
  }

  // ------------------------------------------------------------------

  /**
   * Todo lo que entro y salio de la cuenta en un tramo de fechas.
   *
   *   + transferencias recibidas por ventas
   *   + ventas con tarjeta, menos lo que se queda el datafono
   *   + efectivo consignado desde la caja y otros ingresos
   *   − gastos y abonos a proveedores pagados por transferencia o tarjeta
   *   − reposiciones de mercancia danada pagadas igual
   *   − lo que se saco para la caja y otros retiros
   */
  private async flujos(businessId: string, tramo: Tramo) {
    const fechas = { gt: tramo.desde, lte: tramo.hasta };

    const [transferencias, tarjeta, gastos, abonos, reposiciones, movimientos] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { businessId, date: fechas, paymentMethod: 'TRANSFER' },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.sale.aggregate({
          where: { businessId, date: fechas, paymentMethod: 'CARD' },
          _sum: { total: true, cardFee: true },
          _count: true,
        }),
        this.prisma.expense.aggregate({
          where: { businessId, date: fechas, paymentMethod: { in: MEDIOS_DE_CUENTA } },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.purchasePayment.aggregate({
          where: { businessId, date: fechas, paymentMethod: { in: MEDIOS_DE_CUENTA } },
          _sum: { amount: true },
          _count: true,
        }),
        // Igual que en la caja: cuenta el dia en que el proveedor cobro.
        this.prisma.stockLoss.aggregate({
          where: {
            businessId,
            resolvedAt: fechas,
            resolution: 'DISCOUNTED',
            paymentMethod: { in: MEDIOS_DE_CUENTA },
          },
          _sum: { lossAmount: true },
          _count: true,
        }),
        this.prisma.accountMovement.groupBy({
          by: ['type'],
          where: { businessId, date: fechas },
          _sum: { amount: true },
        }),
      ]);

    const porTipo = new Map(
      movimientos.map((fila) => [fila.type, fila._sum.amount ?? CERO]),
    );

    const flujos = {
      transferSales: transferencias._sum.total ?? CERO,
      transferSalesCount: transferencias._count,
      cardSales: tarjeta._sum.total ?? CERO,
      cardFees: tarjeta._sum.cardFee ?? CERO,
      cardSalesCount: tarjeta._count,
      expenses: gastos._sum.amount ?? CERO,
      expensesCount: gastos._count,
      supplierPayments: (abonos._sum.amount ?? CERO).plus(
        reposiciones._sum.lossAmount ?? CERO,
      ),
      supplierPaymentsCount: abonos._count + reposiciones._count,
      cashDeposits: porTipo.get('CASH_DEPOSIT') ?? CERO,
      cashWithdrawals: porTipo.get('CASH_WITHDRAWAL') ?? CERO,
      otherIn: porTipo.get('OTHER_IN') ?? CERO,
      otherOut: porTipo.get('OTHER_OUT') ?? CERO,
    };

    const neto = money(
      flujos.transferSales
        .plus(flujos.cardSales)
        .minus(flujos.cardFees)
        .plus(flujos.cashDeposits)
        .plus(flujos.otherIn)
        .minus(flujos.expenses)
        .minus(flujos.supplierPayments)
        .minus(flujos.cashWithdrawals)
        .minus(flujos.otherOut),
    );

    return { ...flujos, neto };
  }

  private serializarFlujos(flujos: Awaited<ReturnType<BankAccountService['flujos']>>) {
    return {
      transferSales: flujos.transferSales.toFixed(2),
      transferSalesCount: flujos.transferSalesCount,
      cardSales: flujos.cardSales.toFixed(2),
      cardFees: flujos.cardFees.toFixed(2),
      cardSalesCount: flujos.cardSalesCount,
      expenses: flujos.expenses.toFixed(2),
      expensesCount: flujos.expensesCount,
      supplierPayments: flujos.supplierPayments.toFixed(2),
      supplierPaymentsCount: flujos.supplierPaymentsCount,
      cashDeposits: flujos.cashDeposits.toFixed(2),
      cashWithdrawals: flujos.cashWithdrawals.toFixed(2),
      otherIn: flujos.otherIn.toFixed(2),
      otherOut: flujos.otherOut.toFixed(2),
      net: flujos.neto.toFixed(2),
    };
  }

  /**
   * El primer cierre es el punto de partida: el saldo que se escribe es el
   * esperado y no hay descuadre posible. Los demas se comparan.
   */
  private cuadre(
    preview: Awaited<ReturnType<BankAccountService['preview']>>,
    saldoReal: number | Prisma.Decimal,
  ) {
    const real = money(saldoReal);
    const esperado =
      preview.expectedBalance === null ? real : money(preview.expectedBalance);

    return {
      openingBalance: preview.openingBalance === null ? null : money(preview.openingBalance),
      closingBalance: real,
      expectedBalance: esperado,
      difference: money(real.minus(esperado)),
    };
  }

  private async soloElUltimo(businessId: string, id: string, accion: string) {
    const cierre = await this.findClosing(businessId, id);
    const posterior = await this.prisma.accountClosing.findFirst({
      where: { businessId, date: { gt: cierre.date } },
      select: { id: true },
    });

    if (posterior) {
      throw new BadRequestException(
        `Solo se puede ${accion} el último cierre de cuenta: los que vienen después parten de este saldo.`,
      );
    }

    return cierre;
  }

  private filtroFechas(query: AccountQueryDto): { date?: { gte?: Date; lte?: Date } } {
    if (!query.from && !query.to) return {};
    return {
      date: {
        ...(query.from ? { gte: parseBusinessDate(query.from) } : {}),
        ...(query.to ? { lte: parseBusinessDate(query.to) } : {}),
      },
    };
  }

  private async hoy(businessId: string) {
    const negocio = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    return todayInTimezone(negocio.timezone);
  }
}
