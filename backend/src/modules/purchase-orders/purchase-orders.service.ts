import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { paginated } from '../../common/dto/pagination.dto';
import { parseBusinessDate, todayInTimezone } from '../../common/utils/dates';
import { fileDate } from '../../common/utils/format';
import { money, quantity, sumDecimals } from '../../common/utils/money';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderItemDto,
  PurchaseOrderQueryDto,
} from './dto/purchase-order.dto';

const ORDER_INCLUDE = {
  items: {
    include: { product: { select: { id: true, name: true, unit: true } } },
    orderBy: { position: 'asc' },
  },
  supplier: { select: { id: true, name: true, phone: true } },
  business: { select: { name: true, currency: true, timezone: true } },
  purchase: { select: { id: true, date: true, invoiceNumber: true } },
} satisfies Prisma.PurchaseOrderInclude;

export type PurchaseOrderData = Prisma.PurchaseOrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;

/**
 * Los pedidos al proveedor: la lista de lo que se necesita, con precios, para
 * mandarsela. No toca el inventario ni la deuda; eso llega con la compra.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, query: PurchaseOrderQueryDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      businessId,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: parseBusinessDate(query.from) } : {}),
              ...(query.to ? { lte: parseBusinessDate(query.to) } : {}),
            },
          }
        : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return paginated(data, total, query);
  }

  async findOne(businessId: string, id: string): Promise<PurchaseOrderData> {
    const pedido = await this.prisma.purchaseOrder.findFirst({
      where: { id, businessId },
      include: ORDER_INCLUDE,
    });
    if (!pedido) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return pedido;
  }

  async create(businessId: string, userId: string, dto: CreatePurchaseOrderDto) {
    const lineas = await this.prepararLineas(businessId, dto.items);
    const supplierId = await this.resolverProveedor(businessId, dto);

    return this.prisma.$transaction(async (tx) => {
      // Numero correlativo por negocio, como el talonario.
      const ultimo = await tx.purchaseOrder.aggregate({
        where: { businessId },
        _max: { number: true },
      });

      const creado = await tx.purchaseOrder.create({
        data: {
          businessId,
          userId,
          supplierId,
          number: (ultimo._max.number ?? 0) + 1,
          date: parseBusinessDate(dto.date),
          total: sumDecimals(lineas.map((linea) => linea.subtotal)),
          notes: dto.notes?.trim() || null,
          items: { createMany: { data: lineas } },
        },
      });

      return tx.purchaseOrder.findUniqueOrThrow({
        where: { id: creado.id },
        include: ORDER_INCLUDE,
      });
    });
  }

  /** PUT = reemplazo completo de cabecera y lineas; el numero se conserva. */
  async update(businessId: string, id: string, dto: CreatePurchaseOrderDto) {
    this.soloPendiente(await this.findOne(businessId, id), 'editar');
    const lineas = await this.prepararLineas(businessId, dto.items);
    const supplierId = await this.resolverProveedor(businessId, dto);

    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } });
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId,
          date: parseBusinessDate(dto.date),
          total: sumDecimals(lineas.map((linea) => linea.subtotal)),
          notes: dto.notes?.trim() || null,
          items: { createMany: { data: lineas } },
        },
      });

      return tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: ORDER_INCLUDE,
      });
    });
  }

  async remove(businessId: string, id: string) {
    this.soloPendiente(await this.findOne(businessId, id), 'borrar');
    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { message: 'Pedido eliminado' };
  }

  /**
   * Marcar a mano que llego, sin registrar la compra desde aqui (por ejemplo
   * si la compra ya se apunto aparte).
   */
  async receive(businessId: string, id: string, date?: string) {
    const pedido = this.soloPendiente(await this.findOne(businessId, id), 'marcar');
    const negocio = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    await this.prisma.purchaseOrder.update({
      where: { id: pedido.id },
      data: {
        status: 'RECEIVED',
        receivedAt: parseBusinessDate(date ?? todayInTimezone(negocio.timezone)),
      },
    });
    return this.findOne(businessId, id);
  }

  /** Vuelve a pendiente. Si llego con una compra, primero hay que borrar la compra. */
  async reopen(businessId: string, id: string) {
    const pedido = await this.findOne(businessId, id);
    if (pedido.purchaseId) {
      throw new BadRequestException(
        'Este pedido llegó con una compra registrada: para volverlo a pendiente, borra esa compra',
      );
    }
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'PENDING', receivedAt: null },
    });
    return this.findOne(businessId, id);
  }

  private soloPendiente(pedido: PurchaseOrderData, accion: string) {
    if (pedido.status === 'RECEIVED') {
      throw new BadRequestException(
        `El pedido No. ${pedido.number} ya llegó: no se puede ${accion}. Si fue un error, vuélvelo a pendiente.`,
      );
    }
    return pedido;
  }

  /** arqueo-pedido-12-07-09-2026.pdf */
  fileName(pedido: PurchaseOrderData): string {
    return `arqueo-pedido-${pedido.number}-${fileDate(pedido.date.toISOString())}.pdf`;
  }

  // ------------------------------------------------------------------

  private async prepararLineas(businessId: string, items: PurchaseOrderItemDto[]) {
    const ids = [...new Set(items.map((item) => item.productId).filter((id): id is string => !!id))];
    const productos = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids }, businessId } })
      : [];
    if (productos.length !== ids.length) {
      throw new BadRequestException(
        'Alguno de los productos no existe o no pertenece a este negocio',
      );
    }
    const porId = new Map(productos.map((producto) => [producto.id, producto]));

    return items.map((item, indice) => {
      const producto = item.productId ? porId.get(item.productId) : undefined;
      const descripcion = item.description?.trim() || producto?.name;
      if (!descripcion) {
        throw new BadRequestException(
          `La línea ${indice + 1} necesita un producto o una descripción`,
        );
      }
      const cantidad = quantity(item.quantity);
      const precio = money(item.unitPrice);
      return {
        position: indice,
        productId: producto?.id ?? null,
        description: descripcion,
        quantity: cantidad,
        unitPrice: precio,
        subtotal: money(cantidad.times(precio)),
      };
    });
  }

  private async resolverProveedor(
    businessId: string,
    dto: { supplierId?: string; supplierName?: string },
  ): Promise<string | null> {
    if (dto.supplierId) {
      const existe = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, businessId },
        select: { id: true },
      });
      if (!existe) {
        throw new BadRequestException('El proveedor indicado no existe');
      }
      return dto.supplierId;
    }

    if (dto.supplierName?.trim()) {
      const nombre = dto.supplierName.trim();
      const proveedor = await this.prisma.supplier.upsert({
        where: { businessId_name: { businessId, name: nombre } },
        create: { businessId, name: nombre },
        update: {},
      });
      return proveedor.id;
    }

    return null;
  }
}
