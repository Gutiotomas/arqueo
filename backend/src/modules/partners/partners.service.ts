import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { parseBusinessDate } from '../../common/utils/dates';
import { money, sumDecimals } from '../../common/utils/money';
import {
  CreateDistributionDto,
  DistributionQueryDto,
  PartnerDto,
} from './dto/partner.dto';

const CIEN = new Prisma.Decimal(100);

/**
 * Socias y reparto de ganancias. Repartir no es gastar: la utilidad del
 * negocio no cambia, pero el dinero sale de la caja o de la cuenta el dia que
 * se reparte, segun como se le pago a cada socia.
 */
@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.partner.findMany({
      where: { businessId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(businessId: string, dto: PartnerDto) {
    await this.validarPorcentajes(businessId, null, dto);
    return this.prisma.partner.create({
      data: {
        businessId,
        name: dto.name.trim(),
        sharePercent: dto.sharePercent,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(businessId: string, id: string, dto: PartnerDto) {
    await this.findOne(businessId, id);
    await this.validarPorcentajes(businessId, id, dto);
    return this.prisma.partner.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        sharePercent: dto.sharePercent,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /** Con repartos se desactiva, para no perder el historial; sin ellos se borra. */
  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);
    const repartos = await this.prisma.profitDistributionItem.count({ where: { partnerId: id } });
    if (repartos > 0) {
      await this.prisma.partner.update({ where: { id }, data: { isActive: false } });
      return { message: 'La socia tiene repartos: se desactivó en lugar de borrarla' };
    }
    await this.prisma.partner.delete({ where: { id } });
    return { message: 'Socia eliminada' };
  }

  findDistributions(businessId: string, query: DistributionQueryDto) {
    return this.prisma.profitDistribution.findMany({
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
      include: { items: { include: { partner: { select: { id: true, name: true } } } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async createDistribution(businessId: string, userId: string, dto: CreateDistributionDto) {
    const ids = [...new Set(dto.items.map((item) => item.partnerId))];
    if (ids.length !== dto.items.length) {
      throw new BadRequestException('Cada socia puede aparecer una sola vez en el reparto');
    }
    const socias = await this.prisma.partner.count({ where: { id: { in: ids }, businessId } });
    if (socias !== ids.length) {
      throw new BadRequestException('Alguna de las socias no existe');
    }
    if (dto.items.some((item) => item.paymentMethod === 'CREDIT')) {
      throw new BadRequestException('Un reparto no se puede fiar: di cómo se le pagó a cada socia');
    }

    const items = dto.items.map((item) => ({
      partnerId: item.partnerId,
      amount: money(item.amount),
      paymentMethod: item.paymentMethod,
    }));

    return this.prisma.profitDistribution.create({
      data: {
        businessId,
        userId,
        date: parseBusinessDate(dto.date),
        total: sumDecimals(items.map((item) => item.amount)),
        notes: dto.notes?.trim() || null,
        items: { createMany: { data: items } },
      },
      include: { items: { include: { partner: { select: { id: true, name: true } } } } },
    });
  }

  async removeDistribution(businessId: string, id: string) {
    const reparto = await this.prisma.profitDistribution.findFirst({ where: { id, businessId } });
    if (!reparto) {
      throw new NotFoundException('Reparto no encontrado');
    }
    await this.prisma.profitDistribution.delete({ where: { id } });
    return { message: 'Reparto eliminado' };
  }

  // ------------------------------------------------------------------

  private async findOne(businessId: string, id: string) {
    const socia = await this.prisma.partner.findFirst({ where: { id, businessId } });
    if (!socia) {
      throw new NotFoundException('Socia no encontrada');
    }
    return socia;
  }

  /** Entre las socias activas no pueden repartirse más del 100 %. */
  private async validarPorcentajes(businessId: string, id: string | null, dto: PartnerDto) {
    if (dto.isActive === false) return;
    const otras = await this.prisma.partner.findMany({
      where: { businessId, isActive: true, ...(id ? { id: { not: id } } : {}) },
      select: { sharePercent: true },
    });
    const suma = sumDecimals(otras.map((otra) => otra.sharePercent)).plus(dto.sharePercent);
    if (suma.greaterThan(CIEN)) {
      throw new BadRequestException(
        `Entre todas las socias sumarían ${suma.toFixed(0)} %: no puede pasar de 100 %`,
      );
    }
  }
}
