import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { paginated } from '../../common/dto/pagination.dto';
import { costoPromedioPonderado } from '../../common/utils/cost';
import { money, quantity, sumDecimals, toDecimal } from '../../common/utils/money';
import { formatDate, formatMoney, formatQuantity } from '../../common/utils/format';
import { formatBusinessDate } from '../../common/utils/dates';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  AdjustStockDto,
  ConvertStockDto,
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

    return this.prisma.$transaction(async (tx) => {
      // Si la mercancia venia en una compra que se quedo corta, la compra
      // crece con ella; y entra al costo de esa compra salvo que digan otro.
      const compra = dto.purchaseId
        ? await this.corregirCompra(tx, businessId, dto.purchaseId, id, delta)
        : null;
      const costoEntrante =
        dto.unitCost !== undefined
          ? money(dto.unitCost)
          : compra
            ? toDecimal(compra.unitCost)
            : null;

      // Si se sabe a cuánto entró, el costo del producto pasa a ser el promedio
      // ponderado entre lo que ya había y lo que entra.
      const nuevoCosto = costoEntrante
        ? costoPromedioPonderado(actual.stock, actual.costPrice, delta, costoEntrante)
        : undefined;

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
          reason:
            dto.reason?.trim() ||
            (compra ? `Faltaba en la ${compra.etiqueta}` : 'Entrada de mercancía'),
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
      // Si la diferencia viene de una compra mal apuntada, la compra se
      // corrige con ella. Lo que sobra entra al costo de esa compra; lo que
      // falta sale sin tocar el costo, como cualquier salida.
      const compra =
        dto.purchaseId && !delta.isZero()
          ? await this.corregirCompra(tx, businessId, dto.purchaseId, id, delta)
          : null;
      const nuevoCosto =
        compra && delta.greaterThan(0)
          ? costoPromedioPonderado(
              actual.stock,
              actual.costPrice,
              delta,
              toDecimal(compra.unitCost),
            )
          : undefined;

      const product = await tx.product.update({
        where: { id },
        data: { stock: nuevo, ...(nuevoCosto ? { costPrice: nuevoCosto } : {}) },
      });

      const movement = await tx.stockMovement.create({
        data: {
          businessId,
          productId: id,
          userId,
          type: 'ADJUSTMENT',
          delta,
          stockAfter: nuevo,
          reason:
            dto.reason?.trim() ||
            (compra ? `Corrección de la ${compra.etiqueta}` : 'Ajuste de inventario'),
        },
      });

      return { product, movement };
    });
  }

  /**
   * Pasar mercancia de un producto a otro: dos canastas de 30 huevos se
   * vuelven cuatro de 15. No es compra ni venta, asi que no toca ninguna
   * compra; el costo viaja con la mercancia, para que lo que entra al otro
   * producto valga lo mismo que lo que salio de este.
   */
  async convert(businessId: string, userId: string, id: string, dto: ConvertStockDto) {
    if (dto.toProductId === id) {
      throw new BadRequestException('Elige un producto distinto al que sale');
    }

    const [origen, destino] = await Promise.all([
      this.findOne(businessId, id),
      this.findOne(businessId, dto.toProductId),
    ]);
    const sale = quantity(dto.quantity);
    const entra = quantity(dto.resultingQuantity);

    if (toDecimal(origen.stock).lessThan(sale)) {
      throw new BadRequestException(
        `Solo hay ${formatQuantity(origen.stock.toString())} ${origen.unit} de "${origen.name}"`,
      );
    }

    // Lo que valia lo que sale, repartido entre lo que entra.
    const valor = sale.times(toDecimal(origen.costPrice));
    const costoEntrante = money(valor.dividedBy(entra));
    const motivo = dto.reason?.trim();

    return this.prisma.$transaction(async (tx) => {
      const from = await tx.product.update({
        where: { id },
        data: { stock: { decrement: sale } },
      });
      const to = await tx.product.update({
        where: { id: dto.toProductId },
        data: {
          stock: { increment: entra },
          costPrice: costoPromedioPonderado(
            destino.stock,
            destino.costPrice,
            entra,
            costoEntrante,
          ),
        },
      });

      await tx.stockMovement.createMany({
        data: [
          {
            businessId,
            productId: id,
            userId,
            type: 'ADJUSTMENT',
            delta: sale.negated(),
            stockAfter: from.stock,
            reason:
              motivo ||
              `Convertido en ${formatQuantity(entra.toString())} ${destino.unit} de ${destino.name}`,
          },
          {
            businessId,
            productId: dto.toProductId,
            userId,
            type: 'ADJUSTMENT',
            delta: entra,
            stockAfter: to.stock,
            reason:
              motivo || `Viene de ${formatQuantity(sale.toString())} ${origen.unit} de ${origen.name}`,
          },
        ],
      });

      return { from, to };
    });
  }

  /** Las compras en las que vino este producto, de la mas reciente a la mas vieja. */
  async purchasesOf(businessId: string, id: string) {
    await this.findOne(businessId, id);

    const lineas = await this.prisma.purchaseItem.findMany({
      where: { productId: id, purchase: { businessId, isOpeningBalance: false } },
      include: {
        purchase: {
          select: {
            id: true,
            date: true,
            invoiceNumber: true,
            total: true,
            paidAmount: true,
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: { purchase: { date: 'desc' } },
      take: 20,
    });

    return lineas.map((linea) => ({
      purchaseId: linea.purchase.id,
      itemId: linea.id,
      date: formatBusinessDate(linea.purchase.date),
      invoiceNumber: linea.purchase.invoiceNumber,
      supplier: linea.purchase.supplier?.name ?? null,
      quantity: linea.quantity.toFixed(3),
      unitCost: linea.unitCost.toFixed(2),
      total: linea.purchase.total.toFixed(2),
      balance: money(linea.purchase.total.minus(linea.purchase.paidAmount)).toFixed(2),
    }));
  }

  /**
   * Cambia la cantidad de este producto en una compra y recalcula su total.
   * La deuda cambia con el; los abonos no se tocan, asi que no se permite
   * dejar el total por debajo de lo ya pagado.
   */
  private async corregirCompra(
    tx: Prisma.TransactionClient,
    businessId: string,
    purchaseId: string,
    productId: string,
    delta: Prisma.Decimal,
  ) {
    const compra = await tx.purchase.findFirst({
      where: { id: purchaseId, businessId },
      include: { items: true, supplier: { select: { name: true } } },
    });
    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }
    if (compra.isOpeningBalance) {
      throw new BadRequestException('Una deuda anterior no trae productos que corregir');
    }

    const linea = compra.items.find((item) => item.productId === productId);
    if (!linea) {
      throw new BadRequestException('Ese producto no venía en esa compra');
    }

    const etiqueta = `compra del ${formatDate(formatBusinessDate(compra.date))}${
      compra.invoiceNumber ? ` (${compra.invoiceNumber})` : ''
    }${compra.supplier ? ` a ${compra.supplier.name}` : ''}`;

    const cantidad = quantity(linea.quantity.plus(delta));
    if (cantidad.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        `La ${etiqueta} solo trajo ${formatQuantity(linea.quantity.toString())} de este producto. Si en realidad no trajo nada, borra la compra.`,
      );
    }

    const subtotalLinea = money(cantidad.times(linea.unitCost));
    const subtotal = sumDecimals(
      compra.items.map((item) => (item.id === linea.id ? subtotalLinea : item.subtotal)),
    );
    const total = money(subtotal.minus(compra.discount));
    if (total.lessThan(0)) {
      throw new BadRequestException(
        'La compra quedaría por debajo de su descuento: revisa el descuento primero',
      );
    }
    if (total.lessThan(compra.paidAmount)) {
      throw new BadRequestException(
        `Ya abonaste ${formatMoney(compra.paidAmount.toString(), 'COP')} de esa compra y con el cambio quedaría en ${formatMoney(total.toString(), 'COP')}. Borra un abono primero.`,
      );
    }

    await tx.purchaseItem.update({
      where: { id: linea.id },
      data: { quantity: cantidad, subtotal: subtotalLinea },
    });
    await tx.purchase.update({
      where: { id: compra.id },
      data: { subtotal, total },
    });

    return { etiqueta, unitCost: linea.unitCost };
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
