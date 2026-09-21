import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CategoryDto } from '../../common/dto/category.dto';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(businessId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
  }

  async findOne(businessId: string, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, businessId },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }

  create(businessId: string, dto: CategoryDto) {
    return this.prisma.expenseCategory.create({
      data: { businessId, name: dto.name.trim() },
    });
  }

  async update(businessId: string, id: string, dto: CategoryDto) {
    await this.findOne(businessId, id);

    return this.prisma.expenseCategory.update({
      where: { id },
      data: { name: dto.name.trim() },
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);

    const enUso = await this.prisma.expense.count({ where: { categoryId: id } });
    if (enUso > 0) {
      throw new ConflictException(
        `No se puede borrar: ${enUso} gasto(s) usan esta categoría`,
      );
    }

    await this.prisma.expenseCategory.delete({ where: { id } });
    return { message: 'Categoría eliminada' };
  }
}
