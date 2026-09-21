import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { paginated } from '../../common/dto/pagination.dto';
import { parseBusinessDate } from '../../common/utils/dates';
import { money } from '../../common/utils/money';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';

const EXPENSE_INCLUDE = {
  category: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, query: ExpenseQueryDto) {
    const where: Prisma.ExpenseWhereInput = {
      businessId,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: parseBusinessDate(query.from) } : {}),
              ...(query.to ? { lte: parseBusinessDate(query.to) } : {}),
            },
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.search
        ? { description: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [data, total, aggregate] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      ...paginated(data, total, query),
      summary: { total: (aggregate._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) },
    };
  }

  async findOne(businessId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, businessId },
      include: EXPENSE_INCLUDE,
    });

    if (!expense) {
      throw new NotFoundException('Gasto no encontrado');
    }

    return expense;
  }

  async create(businessId: string, userId: string, dto: CreateExpenseDto) {
    await this.assertCategory(businessId, dto.categoryId);

    return this.prisma.expense.create({
      data: {
        businessId,
        userId,
        date: parseBusinessDate(dto.date),
        description: dto.description.trim(),
        amount: money(dto.amount),
        paymentMethod: dto.paymentMethod,
        categoryId: dto.categoryId ?? null,
        notes: dto.notes?.trim() || null,
      },
      include: EXPENSE_INCLUDE,
    });
  }

  async update(businessId: string, id: string, dto: UpdateExpenseDto) {
    await this.findOne(businessId, id);
    await this.assertCategory(businessId, dto.categoryId);

    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: parseBusinessDate(dto.date) } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.amount !== undefined ? { amount: money(dto.amount) } : {}),
        ...(dto.paymentMethod !== undefined
          ? { paymentMethod: dto.paymentMethod }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: EXPENSE_INCLUDE,
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);
    await this.prisma.expense.delete({ where: { id } });
    return { message: 'Gasto eliminado' };
  }

  /** Que la categoria sea de esta empresa, no de otra. */
  private async assertCategory(businessId: string, categoryId?: string | null) {
    if (!categoryId) return;

    const existe = await this.prisma.expenseCategory.findFirst({
      where: { id: categoryId, businessId },
      select: { id: true },
    });

    if (!existe) {
      throw new BadRequestException('La categoría indicada no existe');
    }
  }
}
