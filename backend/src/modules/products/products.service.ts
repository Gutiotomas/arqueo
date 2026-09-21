import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { paginated } from '../../common/dto/pagination.dto';
import { costoPromedioPonderado } from '../../common/utils/cost';
import { money, quantity, toDecimal } from '../../common/utils/money';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  AdjustStockDto,
  CreateProductDto,
  ProductQueryDto,
  StockInDto,
} from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, query: ProductQueryDto) {
    const where: Prisma.ProductWhereInput = {
      businessId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      // "Bajo minimo" es una comparacion entre dos columnas: Prisma lo resuelve
      // con una referencia de campo.
      ...(query.lowStock ? { stock: { lte: this.prisma.product.fields.minStock } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginated(data, total, query);
  }

  async findOne(businessId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, businessId },
      include: { category: { select: { id: true, name: true } } },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async create(businessId: string, userId: string, dto: CreateProductDto) {
    const stockInicial = quantity(dto.stock ?? 0);

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId,
          name: dto.name.trim(),
          sku: dto.sku?.trim() || null,
          unit: dto.unit?.trim() || 'ud',
          categoryId: dto.categoryId ?? null,
          costPrice: money(dto.costPrice ?? 0),
          salePrice: money(dto.salePrice ?? 0),
          stock: stockInicial,
          minStock: quantity(dto.minStock ?? 0),
        },
      });

      // El stock inicial tambien es un movimiento: el ledger nunca miente.
      if (!stockInicial.isZero()) {
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: product.id,
            userId,
            type: 'IN',
            delta: stockInicial,
            stockAfter: stockInicial,
            reason: 'Stock inicial',
          },
        });
      }

      return product;
    });
  }

  async update(businessId: string, id: string, dto: Partial<CreateProductDto> & { isActive?: boolean }) {
    await this.findOne(businessId, id);

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit?.trim() || 'ud' } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.costPrice !== undefined ? { costPrice: money(dto.costPrice) } : {}),
        ...(dto.salePrice !== undefined ? { salePrice: money(dto.salePrice) } : {}),
        ...(dto.minStock !== undefined ? { minStock: quantity(dto.minStock) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  /**
   * Si el producto tiene historial se archiva en vez de borrarse: si no,
   * perderiamos las ventas pasadas que lo referencian.
   */
  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);

    const [movimientos, lineasVenta] = await Promise.all([
      this.prisma.stockMovement.count({ where: { productId: id } }),
      this.prisma.saleItem.count({ where: { productId: id } }),
    ]);

    if (movimientos > 0 || lineasVenta > 0) {
      await this.prisma.product.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        message: 'El producto tiene historial: se archivó en lugar de borrarse',
        archived: true,
      };
    }

    await this.prisma.product.delete({ where: { id } });
    return { message: 'Producto eliminado', archived: false };
  }

  /**
   * Entrada de mercancía suelta, sin factura de proveedor. Para las compras
   * que quedan a deber está el módulo de compras; esto es para reponer algo
   * puntual sin papeleo.
   */
  async stockIn(
    businessId: string,
    userId: string,
    id: string,
    dto: StockInDto,
  ) {
    const actual = await this.findOne(businessId, id);
    const delta = quantity(dto.quantity);

    // Si dicen a cuánto entró, el costo del producto pasa a ser el promedio
    // ponderado entre lo que ya había y lo que entra.
    const nuevoCosto =
      dto.unitCost !== undefined
        ? costoPromedioPonderado(
            actual.stock,
            actual.costPrice,
            delta,
            money(dto.unitCost),
          )
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          stock: { increment: delta },
          ...(nuevoCosto ? { costPrice: nuevoCosto } : {}),
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          businessId,
          productId: id,
          userId,
          type: 'IN',
          delta,
          stockAfter: product.stock,
          reason: dto.reason?.trim() || 'Entrada de mercancía',
        },
      });

      return { product, movement };
    });
  }

  /** Ajuste por conteo fisico: se fija el stock real y se registra la diferencia. */
  async adjustStock(
    businessId: string,
    userId: string,
    id: string,
    dto: AdjustStockDto,
  ) {
    const actual = await this.findOne(businessId, id);
    const nuevo = quantity(dto.stock);
    const delta = nuevo.minus(toDecimal(actual.stock));

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: { stock: nuevo },
      });

      const movement = await tx.stockMovement.create({
        data: {
          businessId,
          productId: id,
          userId,
          type: 'ADJUSTMENT',
          delta,
          stockAfter: nuevo,
          reason: dto.reason?.trim() || 'Ajuste de inventario',
        },
      });

      return { product, movement };
    });
  }

  async movements(businessId: string, id: string, query: PaginationQueryDto) {
    await this.findOne(businessId, id);

    const where = { productId: id, businessId };
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: {
          user: { select: { id: true, name: true } },
          saleItem: { select: { id: true, saleId: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return paginated(data, total, query);
  }

  /** Productos en o por debajo del minimo, para el aviso del dashboard. */
  lowStock(businessId: string) {
    return this.prisma.product.findMany({
      where: {
        businessId,
        isActive: true,
        stock: { lte: this.prisma.product.fields.minStock },
        minStock: { gt: 0 },
      },
      orderBy: { stock: 'asc' },
      include: { category: { select: { id: true, name: true } } },
      take: 50,
    });
  }
}
