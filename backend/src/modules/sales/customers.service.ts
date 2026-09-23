import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { formatBusinessDate, parseBusinessDate } from '../../common/utils/dates';
import { money, sumDecimals } from '../../common/utils/money';
import { CustomerDto, CustomerPaymentDto } from './dto/sale.dto';

/**
 * Los clientes a los que se les fia. Se dan de alta desde la propia venta.
 * Su cuenta es como el cuaderno: cada linea fiada suma, cada cobro resta.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.customer.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true, payments: true } } },
    });
  }

  async findOne(businessId: string, id: string) {
    const cliente = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return cliente;
  }

  create(businessId: string, dto: CustomerDto) {
    return this.prisma.customer.create({
      data: {
        businessId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(businessId: string, id: string, dto: CustomerDto) {
    await this.findOne(businessId, id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);

    const [lineas, cobros] = await Promise.all([
      this.prisma.saleItem.count({ where: { customerId: id } }),
      this.prisma.customerPayment.count({ where: { customerId: id } }),
    ]);
    if (lineas > 0 || cobros > 0) {
      throw new ConflictException(
        `No se puede borrar: tiene ${lineas} venta(s) fiada(s) y ${cobros} cobro(s)`,
      );
    }

    await this.prisma.customer.delete({ where: { id } });
    return { message: 'Cliente eliminado' };
  }

  /** Lo que deben los clientes, quien, y desde cuando. */
  async debt(businessId: string) {
    const clientes = await this.prisma.customer.findMany({
      where: { businessId },
      include: {
        items: {
          where: { paymentMethod: 'CREDIT' },
          select: { subtotal: true, sale: { select: { date: true } } },
        },
        payments: { select: { amount: true, date: true } },
      },
    });

    const conSaldo = clientes
      .map((cliente) => {
        const fiado = sumDecimals(cliente.items.map((item) => item.subtotal));
        const cobrado = sumDecimals(cliente.payments.map((cobro) => cobro.amount));
        const fechas = cliente.items.map((item) => formatBusinessDate(item.sale.date)).sort();
        const cobros = cliente.payments.map((cobro) => formatBusinessDate(cobro.date)).sort();
        return {
          customerId: cliente.id,
          name: cliente.name,
          balance: money(fiado.minus(cobrado)),
          creditCount: cliente.items.length,
          /** Desde cuando se le fia. */
          oldestDate: fechas[0] ?? null,
          lastPaymentDate: cobros.at(-1) ?? null,
        };
      })
      .filter((cliente) => cliente.balance.greaterThan(0))
      .sort((a, b) => b.balance.comparedTo(a.balance));

    return {
      total: sumDecimals(conSaldo.map((cliente) => cliente.balance)).toFixed(2),
      customersCount: conSaldo.length,
      byCustomer: conSaldo.map((cliente) => ({ ...cliente, balance: cliente.balance.toFixed(2) })),
    };
  }

  /** El cuaderno de un cliente: lo que se llevo fiado, lo que ha pagado y lo que debe. */
  async account(businessId: string, id: string) {
    const cliente = await this.findOne(businessId, id);

    const [lineas, cobros] = await Promise.all([
      this.prisma.saleItem.findMany({
        where: { customerId: id, paymentMethod: 'CREDIT' },
        include: { sale: { select: { id: true, date: true } } },
        orderBy: [{ sale: { date: 'desc' } }, { id: 'desc' }],
      }),
      this.prisma.customerPayment.findMany({
        where: { customerId: id },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const fiado = sumDecimals(lineas.map((linea) => linea.subtotal));
    const cobrado = sumDecimals(cobros.map((cobro) => cobro.amount));

    return {
      customer: cliente,
      credited: fiado.toFixed(2),
      paid: cobrado.toFixed(2),
      balance: money(fiado.minus(cobrado)).toFixed(2),
      credits: lineas.map((linea) => ({
        id: linea.id,
        saleId: linea.sale.id,
        date: formatBusinessDate(linea.sale.date),
        description: linea.description,
        quantity: linea.quantity.toFixed(3),
        unitPrice: linea.unitPrice.toFixed(2),
        subtotal: linea.subtotal.toFixed(2),
      })),
      payments: cobros,
    };
  }

  /** Un cobro: lo que entra a la caja o a la cuenta el dia que el cliente paga. */
  async addPayment(businessId: string, userId: string, id: string, dto: CustomerPaymentDto) {
    const cuenta = await this.account(businessId, id);
    if (dto.paymentMethod === 'CREDIT') {
      throw new BadRequestException('Un cobro no puede ser fiado: di con qué pagó el cliente');
    }
    const cobro = money(dto.amount);
    if (cobro.greaterThan(new Prisma.Decimal(cuenta.balance))) {
      throw new BadRequestException(
        `El cobro supera lo que debe el cliente (${Number(cuenta.balance).toFixed(0)})`,
      );
    }

    await this.prisma.customerPayment.create({
      data: {
        businessId,
        customerId: id,
        userId,
        date: parseBusinessDate(dto.date),
        amount: cobro,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes?.trim() || null,
      },
    });

    return this.account(businessId, id);
  }

  async removePayment(businessId: string, id: string, paymentId: string) {
    await this.findOne(businessId, id);
    const cobro = await this.prisma.customerPayment.findFirst({
      where: { id: paymentId, customerId: id, businessId },
    });
    if (!cobro) {
      throw new NotFoundException('Cobro no encontrado');
    }
    await this.prisma.customerPayment.delete({ where: { id: paymentId } });
    return this.account(businessId, id);
  }
}
