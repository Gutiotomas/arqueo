import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CategoryDto } from '../../common/dto/category.dto';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.productCategory.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async findOne(businessId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id, businessId },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }

  create(businessId: string, dto: CategoryDto) {
    return this.prisma.productCategory.create({
      data: { businessId, name: dto.name.trim() },
    });
  }

  async update(businessId: string, id: string, dto: CategoryDto) {
    await this.findOne(businessId, id);

    return this.prisma.productCategory.update({
      where: { id },
      data: { name: dto.name.trim() },
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);

    const enUso = await this.prisma.product.count({ where: { categoryId: id } });
    if (enUso > 0) {
      throw new ConflictException(
        `No se puede borrar: ${enUso} producto(s) usan esta categoría`,
      );
    }

    await this.prisma.productCategory.delete({ where: { id } });
    return { message: 'Categoría eliminada' };
  }
}
