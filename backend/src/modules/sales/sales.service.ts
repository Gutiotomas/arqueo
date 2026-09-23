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
    include: {
      product: { select: { id: true, name: true, unit: true } },
      customer: { select: { id: true, name: true } },
    },
    orderBy: { position: 'asc' },
  },
  user: { select: { id: true, name: true } },
} satisfies Prisma.SaleInclude;

/**
 * Una venta suele ser el registro de todo un dia: varias lineas, y cada linea
 * pagada a su manera. De seis arepas, dos en efectivo, dos por transferencia
 * y dos fiadas a alguien son tres lineas del mismo producto.
 */
@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, query: SaleQueryDto) {
    const where: Prisma.SaleWhereInput = {
      businessId,
      ...this.dateFilter(query.from, query.to),
      ...(query.paymentMethod ? { items: { some: { paymentMethod: query.paymentMethod } } } : {}),
      ...(query.customerId ? { items: { some: { customerId: query.customerId } } } : {}),
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
    const total = sumDecimals(lineas.map((linea) => linea.subtotal));
    const cardFee = await this.comisionDatafono(businessId, lineas);

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          businessId,
          userId,
          date: parseBusinessDate(dto.date),
          total,
          cardFee,
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
   * Lo fiado tambien se recalcula: la cuenta del cliente es la suma de sus
   * lineas, asi que cambiarlas cambia lo que debe.
   */
  async update(businessId: string, userId: string, id: string, dto: CreateSaleDto) {
    await this.findOne(businessId, id);
    const lineas = await this.prepareItems(businessId, dto.items);
    const total = sumDecimals(lineas.map((linea) => linea.subtotal));
    const cardFee = await this.comisionDatafono(businessId, lineas);

    return this.prisma.$transaction(async (tx) => {
      await this.revertStock(tx, id);
      await tx.saleItem.deleteMany({ where: { saleId: id } });

      await tx.sale.update({
        where: { id },
        data: {
          date: parseBusinessDate(dto.date),
          total,
          cardFee,
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

  /**
   * Valida las lineas y resuelve productos y clientes. Un cliente nuevo se da
   * de alta al vuelo, como en el mostrador; una linea fiada sin cliente no
   * vale, porque no se sabria a quien cobrarle.
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
    const clientes = await this.resolverClientes(businessId, items);

    return items.map((item, indice) => {
      const producto = item.productId ? porId.get(item.productId)! : undefined;
      const descripcion = item.description?.trim() || producto?.name;

      if (!descripcion) {
        throw new BadRequestException(
          `La linea ${indice + 1} necesita un producto o una descripción`,
        );
      }

      const customerId = clientes(item);
      if (item.paymentMethod === 'CREDIT' && !customerId) {
        throw new BadRequestException(
          `Para fiar ${descripcion} hay que decir a quién`,
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
        paymentMethod: item.paymentMethod,
        customerId: item.paymentMethod === 'CREDIT' ? customerId : null,
      };
    });
  }

  /** Devuelve una funcion que da el id de cliente de cada linea, ya validado o creado. */
  private async resolverClientes(businessId: string, items: SaleItemDto[]) {
    const ids = [...new Set(items.map((item) => item.customerId).filter((id): id is string => !!id))];
    const nombres = [
      ...new Set(
        items
          .map((item) => item.customerName?.trim())
          .filter((nombre): nombre is string => !!nombre),
      ),
    ];

    const existentes = ids.length
      ? await this.prisma.customer.findMany({ where: { id: { in: ids }, businessId } })
      : [];
    if (existentes.length !== ids.length) {
      throw new BadRequestException('Alguno de los clientes no existe');
    }

    const porNombre = new Map<string, string>();
    for (const nombre of nombres) {
      const cliente = await this.prisma.customer.upsert({
        where: { businessId_name: { businessId, name: nombre } },
        create: { businessId, name: nombre },
        update: {},
      });
      porNombre.set(nombre, cliente.id);
    }

    return (item: SaleItemDto): string | null =>
      item.customerId ?? (item.customerName?.trim() ? porNombre.get(item.customerName.trim())! : null);
  }

  /**
   * Lo que se queda el datafono de las lineas con tarjeta. Se guarda en la
   * venta, como el costo en cada linea: si mañana cambia el %, las ventas de
   * hoy no cambian.
   */
  private async comisionDatafono(
    businessId: string,
    lineas: { paymentMethod: string; subtotal: Prisma.Decimal }[],
  ): Promise<Prisma.Decimal> {
    const conTarjeta = sumDecimals(
      lineas.filter((linea) => linea.paymentMethod === 'CARD').map((linea) => linea.subtotal),
    );
    if (conTarjeta.isZero()) return new Prisma.Decimal(0);

    const { cardFeePercent } = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { cardFeePercent: true },
    });

    return money(conTarjeta.times(cardFeePercent).dividedBy(100));
  }

  /** Inserta lineas y, para las que llevan producto, descuenta stock. */
  private async createItems(
    tx: Prisma.TransactionClient,
    businessId: string,
    userId: string,
    saleId: string,
    lineas: Awaited<ReturnType<SalesService['prepareItems']>>,
  ) {
    for (const [position, linea] of lineas.entries()) {
      const item = await tx.saleItem.create({
        data: { saleId, position, ...linea },
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

  /** Devuelve al inventario lo que se llevaron las lineas actuales de la venta. */
  private async revertStock(tx: Prisma.TransactionClient, saleId: string) {
    const items = await tx.saleItem.findMany({
      where: { saleId, productId: { not: null } },
    });

    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId! },
        data: { stock: { increment: item.quantity } },
      });
      // Los movimientos de stock de esas lineas se van con ellas (cascade),
      // asi que la suma de movimientos sigue igualando el stock del producto.
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
