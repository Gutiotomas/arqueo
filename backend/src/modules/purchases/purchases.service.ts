import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { paginated } from '../../common/dto/pagination.dto';
import { costoPromedioPonderado, costoSinLaCompra } from '../../common/utils/cost';
import { parseBusinessDate, todayInTimezone } from '../../common/utils/dates';
import { money, quantity, sumDecimals, toDecimal } from '../../common/utils/money';
import {
  CreatePurchaseDto,
  OpeningBalanceDto,
  PurchasePaymentDto,
  PurchaseQueryDto,
} from './dto/purchase.dto';

const PURCHASE_INCLUDE = {
  items: {
    include: { product: { select: { id: true, name: true, unit: true } } },
  },
  payments: { orderBy: { date: 'asc' } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseInclude;

type PurchaseConSaldo = Prisma.PurchaseGetPayload<{
  include: typeof PURCHASE_INCLUDE;
}>;

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, query: PurchaseQueryDto) {
    const where: Prisma.PurchaseWhereInput = {
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
      ...this.filtroEstado(query.status),
    };

    const [data, total, agregado] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        include: PURCHASE_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.aggregate({
        where,
        _sum: { total: true, paidAmount: true },
      }),
    ]);

    const comprado = money(agregado._sum.total ?? 0);
    const abonado = money(agregado._sum.paidAmount ?? 0);

    return {
      ...paginated(data.map((compra) => this.conSaldo(compra)), total, query),
      summary: {
        total: comprado.toFixed(2),
        paid: abonado.toFixed(2),
        balance: money(comprado.minus(abonado)).toFixed(2),
      },
    };
  }

  async findOne(businessId: string, id: string) {
    const compra = await this.prisma.purchase.findFirst({
      where: { id, businessId },
      include: PURCHASE_INCLUDE,
    });

    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }

    return this.conSaldo(compra);
  }

  /**
   * Registra la compra: entra la mercancia al inventario (no es un gasto, es
   * un activo), se recalcula el costo promedio de cada producto y, si se pago
   * algo en el momento, queda como primer abono.
   */
  async create(businessId: string, userId: string, dto: CreatePurchaseDto) {
    const productos = await this.validarProductos(businessId, dto);
    const supplierId = await this.resolverProveedor(businessId, dto);

    const lineas = dto.items.map((item) => {
      const cantidad = quantity(item.quantity);
      const costo = money(item.unitCost);
      return {
        productId: item.productId,
        quantity: cantidad,
        unitCost: costo,
        subtotal: money(cantidad.times(costo)),
      };
    });

    const subtotal = sumDecimals(lineas.map((linea) => linea.subtotal));
    const descuento = money(dto.discount ?? 0);
    if (descuento.greaterThan(subtotal)) {
      throw new BadRequestException(
        'El descuento no puede ser mayor que la suma de los productos',
      );
    }
    const total = money(subtotal.minus(descuento));
    const abono = dto.initialPayment ? money(dto.initialPayment.amount) : null;

    if (abono && abono.greaterThan(total)) {
      throw new BadRequestException(
        'El abono no puede ser mayor que el total de la compra',
      );
    }

    // El costo de cada producto antes de la compra, para poder deshacerla.
    const costoAntes = new Map(
      [...productos.values()].map((producto) => [producto.id, producto.costPrice]),
    );

    const compra = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.purchase.create({
        data: {
          businessId,
          userId,
          supplierId,
          date: parseBusinessDate(dto.date),
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          dueDate: dto.dueDate ? parseBusinessDate(dto.dueDate) : null,
          notes: dto.notes?.trim() || null,
          subtotal,
          discount: descuento,
          discountReason: dto.discountReason?.trim() || null,
          total,
          paidAmount: abono ?? new Prisma.Decimal(0),
        },
      });

      for (const linea of lineas) {
        const item = await tx.purchaseItem.create({
          data: {
            purchaseId: creada.id,
            ...linea,
            previousCostPrice: costoAntes.get(linea.productId)!,
          },
        });

        const producto = productos.get(linea.productId)!;
        const nuevoCosto = costoPromedioPonderado(
          producto.stock,
          producto.costPrice,
          linea.quantity,
          linea.unitCost,
        );

        const actualizado = await tx.product.update({
          where: { id: linea.productId },
          data: {
            stock: { increment: linea.quantity },
            costPrice: nuevoCosto,
          },
        });
        // Si el mismo producto viene en otra linea, promedia sobre esta.
        productos.set(linea.productId, actualizado);

        await tx.stockMovement.create({
          data: {
            businessId,
            productId: linea.productId,
            userId,
            purchaseItemId: item.id,
            type: 'IN',
            delta: linea.quantity,
            stockAfter: actualizado.stock,
            reason: 'Compra a proveedor',
          },
        });
      }

      if (dto.initialPayment && abono) {
        await tx.purchasePayment.create({
          data: {
            businessId,
            purchaseId: creada.id,
            userId,
            date: parseBusinessDate(dto.initialPayment.date),
            amount: abono,
            paymentMethod: dto.initialPayment.paymentMethod,
            notes: dto.initialPayment.notes?.trim() || null,
          },
        });
      }

      return tx.purchase.findUniqueOrThrow({
        where: { id: creada.id },
        include: PURCHASE_INCLUDE,
      });
    });

    return this.conSaldo(compra);
  }

  /** Un abono al proveedor: esto si sale de la caja. */
  async addPayment(
    businessId: string,
    userId: string,
    purchaseId: string,
    dto: PurchasePaymentDto,
  ) {
    const compra = await this.findOne(businessId, purchaseId);
    const abono = money(dto.amount);
    const saldo = toDecimal(compra.balance);

    if (abono.greaterThan(saldo)) {
      throw new BadRequestException(
        `El abono supera lo que queda por pagar (${saldo.toFixed(2)})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.purchasePayment.create({
        data: {
          businessId,
          purchaseId,
          userId,
          date: parseBusinessDate(dto.date),
          amount: abono,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes?.trim() || null,
        },
      });

      await tx.purchase.update({
        where: { id: purchaseId },
        data: { paidAmount: { increment: abono } },
      });
    });

    return this.findOne(businessId, purchaseId);
  }

  async removePayment(businessId: string, purchaseId: string, paymentId: string) {
    await this.findOne(businessId, purchaseId);

    const abono = await this.prisma.purchasePayment.findFirst({
      where: { id: paymentId, purchaseId, businessId },
    });

    if (!abono) {
      throw new NotFoundException('Abono no encontrado');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.purchasePayment.delete({ where: { id: paymentId } });
      await tx.purchase.update({
        where: { id: purchaseId },
        data: { paidAmount: { decrement: abono.amount } },
      });
    });

    return this.findOne(businessId, purchaseId);
  }

  /**
   * Borrar una compra saca del inventario lo que metio y devuelve el costo
   * de cada producto a como estaba (ver `costoSinLaCompra`). Solo tiene
   * sentido para corregir un error, asi que se bloquea si dejaria el stock
   * en negativo. Una deuda anterior no trae productos: solo se borra.
   */
  async remove(businessId: string, id: string) {
    const compra = await this.findOne(businessId, id);

    // Un producto puede venir en varias lineas: se deshace todo junto.
    const porProducto = new Map<
      string,
      {
        nombre: string;
        cantidad: Prisma.Decimal;
        valor: Prisma.Decimal;
        costoAnterior: Prisma.Decimal | null;
      }
    >();
    for (const item of compra.items) {
      const actual = porProducto.get(item.productId) ?? {
        nombre: item.product.name,
        cantidad: new Prisma.Decimal(0),
        valor: new Prisma.Decimal(0),
        costoAnterior: item.previousCostPrice,
      };
      actual.cantidad = actual.cantidad.plus(toDecimal(item.quantity));
      actual.valor = actual.valor.plus(toDecimal(item.subtotal));
      porProducto.set(item.productId, actual);
    }

    const ids = [...porProducto.keys()];
    const productos = new Map(
      (
        await this.prisma.product.findMany({ where: { id: { in: ids }, businessId } })
      ).map((producto) => [producto.id, producto]),
    );

    for (const [productId, sale] of porProducto) {
      if (toDecimal(productos.get(productId)!.stock).lessThan(sale.cantidad)) {
        throw new BadRequestException(
          `No se puede borrar: ya se vendió parte de "${sale.nombre}". Corrige la compra con un ajuste de inventario.`,
        );
      }
    }

    // ¿Entro mas mercancia de esos productos despues de esta compra? Entonces
    // el costo de antes ya no sirve tal cual.
    const conEntradasDespues = new Set(
      (
        await this.prisma.stockMovement.findMany({
          where: {
            businessId,
            productId: { in: ids },
            type: 'IN',
            createdAt: { gt: compra.createdAt },
            OR: [
              { purchaseItemId: null },
              { purchaseItemId: { notIn: compra.items.map((item) => item.id) } },
            ],
          },
          select: { productId: true },
          distinct: ['productId'],
        })
      ).map((movimiento) => movimiento.productId),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const [productId, sale] of porProducto) {
        const producto = productos.get(productId)!;
        await tx.product.update({
          where: { id: productId },
          data: {
            stock: { decrement: sale.cantidad },
            costPrice: costoSinLaCompra({
              stockActual: producto.stock,
              costoActual: producto.costPrice,
              cantidad: sale.cantidad,
              valorCompra: sale.valor,
              costoAnterior: sale.costoAnterior,
              entroMasDespues: conEntradasDespues.has(productId),
            }),
          },
        });
      }
      await tx.purchase.delete({ where: { id } });
    });

    return {
      message: compra.isOpeningBalance
        ? 'Deuda anterior eliminada'
        : 'Compra eliminada y mercancía retirada del inventario',
    };
  }

  /**
   * Lo que se le debia a un proveedor antes de empezar a usar Arqueo, por
   * mercancia que ya se vendio. No trae productos: si la mercancia sigue en
   * la estanteria, lo correcto es registrar una compra normal.
   *
   * Cuenta en la deuda y se abona como cualquier compra, pero no es mercancia
   * comprada en el periodo ni toca el inventario.
   */
  async createOpeningBalance(
    businessId: string,
    userId: string,
    dto: OpeningBalanceDto,
  ) {
    const supplierId = await this.resolverProveedor(businessId, dto);

    if (!supplierId) {
      throw new BadRequestException('Indica a qué proveedor le debes');
    }

    const compra = await this.prisma.purchase.create({
      data: {
        businessId,
        userId,
        supplierId,
        isOpeningBalance: true,
        date: parseBusinessDate(dto.date),
        dueDate: dto.dueDate ? parseBusinessDate(dto.dueDate) : null,
        notes: dto.notes?.trim() || null,
        subtotal: money(dto.amount),
        total: money(dto.amount),
      },
      include: PURCHASE_INCLUDE,
    });

    return this.conSaldo(compra);
  }

  /** Lo que se le debe a cada proveedor, y que hay vencido. */
  async debt(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const hoy = parseBusinessDate(todayInTimezone(business.timezone));

    const pendientes = await this.prisma.purchase.findMany({
      where: { businessId },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: 'asc' }, { date: 'asc' }],
    });

    const conSaldo = pendientes.filter((compra) =>
      toDecimal(compra.total).greaterThan(toDecimal(compra.paidAmount)),
    );

    const porProveedor = new Map<
      string,
      { supplierId: string | null; name: string; balance: Prisma.Decimal; count: number }
    >();
    let vencido = new Prisma.Decimal(0);

    for (const compra of conSaldo) {
      const saldo = money(toDecimal(compra.total).minus(toDecimal(compra.paidAmount)));
      const clave = compra.supplierId ?? 'sin-proveedor';
      const actual = porProveedor.get(clave) ?? {
        supplierId: compra.supplierId,
        name: compra.supplier?.name ?? 'Sin proveedor',
        balance: new Prisma.Decimal(0),
        count: 0,
      };
      actual.balance = actual.balance.plus(saldo);
      actual.count += 1;
      porProveedor.set(clave, actual);

      if (compra.dueDate && compra.dueDate < hoy) {
        vencido = vencido.plus(saldo);
      }
    }

    const total = sumDecimals([...porProveedor.values()].map((p) => p.balance));

    return {
      total: total.toFixed(2),
      overdue: money(vencido).toFixed(2),
      purchasesCount: conSaldo.length,
      bySupplier: [...porProveedor.values()]
        .map((proveedor) => ({
          supplierId: proveedor.supplierId,
          name: proveedor.name,
          balance: money(proveedor.balance).toFixed(2),
          purchasesCount: proveedor.count,
        }))
        .sort((a, b) => Number(b.balance) - Number(a.balance)),
    };
  }

  // ------------------------------------------------------------------

  private conSaldo(compra: PurchaseConSaldo) {
    const total = toDecimal(compra.total);
    const abonado = toDecimal(compra.paidAmount);
    const saldo = money(total.minus(abonado));

    return {
      ...compra,
      balance: saldo.toFixed(2),
      status: saldo.lessThanOrEqualTo(0)
        ? ('paid' as const)
        : abonado.greaterThan(0)
          ? ('partial' as const)
          : ('pending' as const),
    };
  }

  private filtroEstado(estado?: string): Prisma.PurchaseWhereInput {
    switch (estado) {
      case 'paid':
        // Prisma no compara dos columnas en un filtro simple: se usa la
        // referencia de campo.
        return { paidAmount: { gte: this.prisma.purchase.fields.total } };
      case 'pending':
        return { paidAmount: { lte: 0 } };
      case 'partial':
        return {
          AND: [
            { paidAmount: { gt: 0 } },
            { paidAmount: { lt: this.prisma.purchase.fields.total } },
          ],
        };
      case 'unpaid':
        return { paidAmount: { lt: this.prisma.purchase.fields.total } };
      default:
        return {};
    }
  }

  private async validarProductos(businessId: string, dto: CreatePurchaseDto) {
    const ids = [...new Set(dto.items.map((item) => item.productId))];
    const productos = await this.prisma.product.findMany({
      where: { id: { in: ids }, businessId },
    });

    if (productos.length !== ids.length) {
      throw new BadRequestException(
        'Alguno de los productos no existe o no pertenece a este negocio',
      );
    }

    return new Map(productos.map((producto) => [producto.id, producto]));
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

    // Se escribio un nombre nuevo: se da de alta sobre la marcha, que es como
    // funciona en el mostrador.
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

