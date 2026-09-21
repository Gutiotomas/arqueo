import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { paginated } from '../../common/dto/pagination.dto';
import { parseBusinessDate } from '../../common/utils/dates';
import { money, quantity, sumDecimals, toDecimal } from '../../common/utils/money';
import { CreateSaleDto, SaleItemDto, SaleQueryDto } from './dto/sale.dto';

/** Lo que incluimos siempre que devolvemos una venta. */
const SALE_INCLUDE = {
  items: {
    include: { product: { select: { id: true, name: true, unit: true } } },
  },
  user: { select: { id: true, name: true } },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, query: SaleQueryDto) {
    const where: Prisma.SaleWhereInput = {
      businessId,
      ...this.dateFilter(query.from, query.to),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.search
        ? {
            OR: [
              { notes: { contains: query.search, mode: 'insensitive' } },
              {
                items: {
                  some: {
                    description: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [data, total, aggregate] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({ where, _sum: { total: true } }),
    ]);

    return {
      ...paginated(data, total, query),
      // Total del filtro completo, no solo de la pagina: es lo que quiere ver
      // el dueno cuando filtra por un mes.
      summary: { total: (aggregate._sum.total ?? new Prisma.Decimal(0)).toFixed(2) },
    };
  }

  async findOne(businessId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, businessId },
      include: SALE_INCLUDE,
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    return sale;
  }

  async create(businessId: string, userId: string, dto: CreateSaleDto) {
    const lineas = await this.prepareItems(businessId, dto.items);

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          businessId,
          userId,
          date: parseBusinessDate(dto.date),
          paymentMethod: dto.paymentMethod,
          total: sumDecimals(lineas.map((linea) => linea.subtotal)),
          notes: dto.notes?.trim() || null,
        },
      });

      await this.createItems(tx, businessId, userId, sale.id, lineas);

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: SALE_INCLUDE,
      });
    });
  }

  /**
   * PUT = reemplazo completo: deshace el efecto de las lineas viejas sobre el
   * stock, las borra y aplica las nuevas. Asi el inventario sigue cuadrando.
   */
  async update(businessId: string, userId: string, id: string, dto: CreateSaleDto) {
    await this.findOne(businessId, id);
    const lineas = await this.prepareItems(businessId, dto.items);

    return this.prisma.$transaction(async (tx) => {
      await this.revertStock(tx, id);
      await tx.saleItem.deleteMany({ where: { saleId: id } });

      await tx.sale.update({
        where: { id },
        data: {
          date: parseBusinessDate(dto.date),
          paymentMethod: dto.paymentMethod,
          total: sumDecimals(lineas.map((linea) => linea.subtotal)),
          notes: dto.notes?.trim() || null,
        },
      });

      await this.createItems(tx, businessId, userId, id, lineas);

      return tx.sale.findUniqueOrThrow({
        where: { id },
        include: SALE_INCLUDE,
      });
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOne(businessId, id);

    await this.prisma.$transaction(async (tx) => {
      await this.revertStock(tx, id);
      await tx.sale.delete({ where: { id } }); // borra lineas y movimientos en cascada
    });

    return { message: 'Venta eliminada y stock devuelto al inventario' };
  }

  // ------------------------------------------------------------------
  // Interno
  // ------------------------------------------------------------------

  /**
   * Valida las lineas y les pone precio y coste. Comprueba de paso que los
   * productos sean de esta empresa: es la barrera anti fuga entre negocios.
   */
  private async prepareItems(businessId: string, items: SaleItemDto[]) {
    const productIds = [
      ...new Set(items.map((item) => item.productId).filter((id): id is string => !!id)),
    ];

    const productos = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds }, businessId },
        })
      : [];

    if (productos.length !== productIds.length) {
      throw new BadRequestException(
        'Alguno de los productos no existe o no pertenece a este negocio',
      );
    }

    const porId = new Map(productos.map((producto) => [producto.id, producto]));

    return items.map((item, indice) => {
      const producto = item.productId ? porId.get(item.productId)! : undefined;
      const descripcion = item.description?.trim() || producto?.name;

      if (!descripcion) {
        throw new BadRequestException(
          `La linea ${indice + 1} necesita un producto o una descripción`,
        );
      }

      const cantidad = quantity(item.quantity);
      const precio = money(item.unitPrice);

      return {
        productId: producto?.id ?? null,
        description: descripcion,
        quantity: cantidad,
        unitPrice: precio,
        unitCost: producto ? toDecimal(producto.costPrice) : new Prisma.Decimal(0),
        subtotal: money(cantidad.times(precio)),
      };
    });
  }

  /** Inserta lineas y, para las que llevan producto, descuenta stock. */
  private async createItems(
    tx: Prisma.TransactionClient,
    businessId: string,
    userId: string,
    saleId: string,
    lineas: Awaited<ReturnType<SalesService['prepareItems']>>,
  ) {
    for (const linea of lineas) {
      const item = await tx.saleItem.create({
        data: { saleId, ...linea },
      });

      if (!linea.productId) continue;

      // El update devuelve el stock ya actualizado: no hay carrera posible.
      const producto = await tx.product.update({
        where: { id: linea.productId },
        data: { stock: { decrement: linea.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          businessId,
          productId: linea.productId,
          userId,
          saleItemId: item.id,
          type: 'OUT',
          delta: linea.quantity.negated(),
          stockAfter: producto.stock,
          reason: 'Venta',
        },
      });
    }
  }

  /** Devuelve al inventario lo que descontaron las lineas actuales de la venta. */
  private async revertStock(tx: Prisma.TransactionClient, saleId: string) {
    const items = await tx.saleItem.findMany({
      where: { saleId, productId: { not: null } },
      select: { id: true, productId: true, quantity: true },
    });

    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId! },
        data: { stock: { increment: item.quantity } },
      });
      // El movimiento OUT se borra con la linea (onDelete: Cascade), de modo
      // que la suma de movimientos sigue igualando el stock del producto.
    }
  }

  private dateFilter(from?: string, to?: string): Prisma.SaleWhereInput {
    if (!from && !to) return {};
    return {
      date: {
        ...(from ? { gte: parseBusinessDate(from) } : {}),
        ...(to ? { lte: parseBusinessDate(to) } : {}),
      },
    };
  }
}
