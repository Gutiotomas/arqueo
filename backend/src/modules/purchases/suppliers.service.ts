import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SupplierDto } from './dto/purchase.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.supplier.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { purchases: true } } },
    });
  }

  async findOne(businessId: string, id: string) {
    const proveedor = await this.prisma.supplier.findFirst({
      where: { id, businessId },
    });

    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return proveedor;
  }

  create(businessId: string, dto: SupplierDto) {
    return this.prisma.supplier.create({
      data: {
        businessId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(businessId: string, id: string, dto: SupplierDto) {
    await this.findOne(businessId, id);

    return this.prisma.supplier.update({
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

    const compras = await this.prisma.purchase.count({ where: { supplierId: id } });
    if (compras > 0) {
      throw new ConflictException(
        `No se puede borrar: tiene ${compras} compra(s) registradas`,
      );
    }

    await this.prisma.supplier.delete({ where: { id } });
    return { message: 'Proveedor eliminado' };
  }
}
