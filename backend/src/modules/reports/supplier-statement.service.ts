import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  daysBetween,
  formatBusinessDate,
  longDate,
  todayInTimezone,
} from '../../common/utils/dates';
import { fileDate, formatDate } from '../../common/utils/format';
import { money, sumDecimals, toDecimal } from '../../common/utils/money';
import { PAYMENT_METHOD_LABELS } from './reports.service';

export interface SupplierStatement {
  business: { name: string; currency: string; timezone: string };
  supplier: { id: string; name: string; phone: string | null };
  period: { from: string; to: string; label: string; allTime: boolean };
  generatedAt: string;
  summary: {
    /** Lo que ya se debia al empezar el periodo. */
    openingBalance: string;
    /** Compras del periodo, deudas anteriores incluidas. */
    purchased: string;
    /** Abonos del periodo. */
    paid: string;
    /** openingBalance + purchased - paid. */
    closingBalance: string;
    /** Lo que se le debe hoy, sea del periodo que sea. */
    currentBalance: string;
    /** De lo que se debe hoy, lo que ya paso su fecha de vencimiento. */
    overdue: string;
    purchasesCount: number;
    paymentsCount: number;
  };
  purchases: {
    date: string;
    invoiceNumber: string | null;
    isOpeningBalance: boolean;
    /** Factura y productos, o "Deuda anterior". */
    detail: string;
    total: string;
    /** Abonado hasta hoy. */
    paid: string;
    /** Saldo hoy. */
    balance: string;
    dueDate: string | null;
    status: 'paid' | 'partial' | 'pending';
  }[];
  payments: {
    date: string;
    /** A que compra se abono: "Compra del 12/09/2026 · FV-123". */
    purchase: string;
    paymentMethod: string;
    amount: string;
    notes: string | null;
  }[];
  /** Compras con saldo hoy, de cualquier fecha, las vencidas primero. */
  pending: {
    date: string;
    invoiceNumber: string | null;
    isOpeningBalance: boolean;
    detail: string;
    total: string;
    paid: string;
    balance: string;
    dueDate: string | null;
    daysOverdue: number;
  }[];
}

/**
 * Estado de cuenta con un proveedor: lo que se le compro, lo que se le abono
 * y lo que se le debe. Funciona como el extracto de un banco:
 *
 *   saldo al empezar + compras del periodo - abonos del periodo = saldo al final
 *
 * Sin fechas, cubre todo el historial y el saldo final es lo que se debe hoy.
 */
@Injectable()
export class SupplierStatementService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    businessId: string,
    supplierId: string,
    rango: { from?: string; to?: string },
  ): Promise<SupplierStatement> {
    if (rango.from && rango.to && rango.from > rango.to) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
    }

    const [business, supplier, compras, abonos] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, currency: true, timezone: true },
      }),
      this.prisma.supplier.findFirst({
        where: { id: supplierId, businessId },
        select: { id: true, name: true, phone: true },
      }),
      this.prisma.purchase.findMany({
        where: { businessId, supplierId },
        include: { items: { include: { product: { select: { name: true } } } } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.purchasePayment.findMany({
        where: { businessId, purchase: { supplierId } },
        include: {
          purchase: { select: { date: true, invoiceNumber: true, isOpeningBalance: true } },
        },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    const hoy = todayInTimezone(business.timezone);
    const allTime = !rango.from && !rango.to;
    const primeraFecha = [...compras, ...abonos]
      .map((fila) => formatBusinessDate(fila.date))
      .sort()[0];
    const from = rango.from ?? primeraFecha ?? hoy;
    const to = rango.to ?? hoy;

    const enPeriodo = (fecha: Date) => {
      const dia = formatBusinessDate(fecha);
      return dia >= from && dia <= to;
    };
    const antes = (fecha: Date) => formatBusinessDate(fecha) < from;

    const comprasAntes = sumDecimals(
      compras.filter((compra) => antes(compra.date)).map((compra) => compra.total),
    );
    const abonosAntes = sumDecimals(
      abonos.filter((abono) => antes(abono.date)).map((abono) => abono.amount),
    );
    const comprasPeriodo = compras.filter((compra) => enPeriodo(compra.date));
    const abonosPeriodo = abonos.filter((abono) => enPeriodo(abono.date));

    const openingBalance = money(comprasAntes.minus(abonosAntes));
    const purchased = sumDecimals(comprasPeriodo.map((compra) => compra.total));
    const paid = sumDecimals(abonosPeriodo.map((abono) => abono.amount));

    const saldo = (compra: (typeof compras)[number]) =>
      money(toDecimal(compra.total).minus(toDecimal(compra.paidAmount)));
    const vencida = (compra: (typeof compras)[number]) =>
      compra.dueDate !== null && formatBusinessDate(compra.dueDate) < hoy;

    const pendientes = compras.filter((compra) => saldo(compra).greaterThan(0));
    const currentBalance = sumDecimals(pendientes.map(saldo));
    const overdue = sumDecimals(pendientes.filter(vencida).map(saldo));

    return {
      business,
      supplier,
      period: {
        from,
        to,
        allTime,
        label: allTime
          ? `Todo el historial, hasta el ${longDate(to)}`
          : `Del ${longDate(from)} al ${longDate(to)}`,
      },
      generatedAt: new Date().toISOString(),
      summary: {
        openingBalance: openingBalance.toFixed(2),
        purchased: purchased.toFixed(2),
        paid: paid.toFixed(2),
        closingBalance: money(openingBalance.plus(purchased).minus(paid)).toFixed(2),
        currentBalance: currentBalance.toFixed(2),
        overdue: overdue.toFixed(2),
        purchasesCount: comprasPeriodo.length,
        paymentsCount: abonosPeriodo.length,
      },
      purchases: comprasPeriodo.map((compra) => {
        const pendiente = saldo(compra);
        return {
          date: formatBusinessDate(compra.date),
          invoiceNumber: compra.invoiceNumber,
          isOpeningBalance: compra.isOpeningBalance,
          detail: detalle(compra),
          total: money(compra.total).toFixed(2),
          paid: money(compra.paidAmount).toFixed(2),
          balance: pendiente.toFixed(2),
          dueDate: compra.dueDate ? formatBusinessDate(compra.dueDate) : null,
          status: pendiente.lessThanOrEqualTo(0)
            ? ('paid' as const)
            : toDecimal(compra.paidAmount).greaterThan(0)
              ? ('partial' as const)
              : ('pending' as const),
        };
      }),
      payments: abonosPeriodo.map((abono) => ({
        date: formatBusinessDate(abono.date),
        purchase: [
          abono.purchase.isOpeningBalance
            ? 'Deuda anterior'
            : `Compra del ${formatDate(formatBusinessDate(abono.purchase.date))}`,
          abono.purchase.invoiceNumber,
        ]
          .filter(Boolean)
          .join(' · '),
        paymentMethod: PAYMENT_METHOD_LABELS[abono.paymentMethod] ?? abono.paymentMethod,
        amount: money(abono.amount).toFixed(2),
        notes: abono.notes,
      })),
      pending: pendientes
        .map((compra) => {
          const vence = compra.dueDate ? formatBusinessDate(compra.dueDate) : null;
          return {
            date: formatBusinessDate(compra.date),
            invoiceNumber: compra.invoiceNumber,
            isOpeningBalance: compra.isOpeningBalance,
            detail: detalle(compra),
            total: money(compra.total).toFixed(2),
            paid: money(compra.paidAmount).toFixed(2),
            balance: saldo(compra).toFixed(2),
            dueDate: vence,
            // daysBetween cuenta los dos extremos: vencer ayer es 1 dia de retraso.
            daysOverdue: vence && vence < hoy ? daysBetween(vence, hoy) - 1 : 0,
          };
        })
        .sort(
          (a, b) =>
            b.daysOverdue - a.daysOverdue ||
            (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
            a.date.localeCompare(b.date),
        ),
    };
  }

  /**
   * Nombre del fichero, sin tildes ni espacios:
   *   arqueo-proveedor-distribuidora-el-trigal-22-09-2026.pdf
   *   arqueo-proveedor-distribuidora-el-trigal-01-09-2026-a-22-09-2026.xlsx
   */
  fileName(data: SupplierStatement, extension: 'pdf' | 'xlsx'): string {
    const nombre =
      data.supplier.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'proveedor';
    const fechas = data.period.allTime
      ? fileDate(data.period.to)
      : `${fileDate(data.period.from)}-a-${fileDate(data.period.to)}`;

    return `arqueo-proveedor-${nombre}-${fechas}.${extension}`;
  }
}

/** "FV-123 · Arroz, Aceite y 2 más", o "Deuda anterior". */
function detalle(compra: {
  isOpeningBalance: boolean;
  invoiceNumber: string | null;
  items: { product: { name: string } }[];
}): string {
  if (compra.isOpeningBalance) {
    return ['Deuda anterior', compra.invoiceNumber].filter(Boolean).join(' · ');
  }

  const nombres = [...new Set(compra.items.map((item) => item.product.name))];
  const productos =
    nombres.length <= 2
      ? nombres.join(', ')
      : `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;

  return [compra.invoiceNumber, productos].filter(Boolean).join(' · ');
}
