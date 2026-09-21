import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { LossResolution } from '../../generated/prisma/enums';
import { paginated } from '../../common/dto/pagination.dto';
import { parseBusinessDate, todayInTimezone } from '../../common/utils/dates';
import { money, quantity, toDecimal } from '../../common/utils/money';
import { CreateLossDto, LossQueryDto, ResolveLossDto } from './dto/loss.dto';

const LOSS_INCLUDE = {
  product: { select: { id: true, name: true, unit: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.StockLossInclude;

@Injectable()
export class LossesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, query: LossQueryDto) {
    const where: Prisma.StockLossWhereInput = {
      businessId,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: parseBusinessDate(query.from) } : {}),
              ...(query.to ? { lte: parseBusinessDate(query.to) } : {}),
            },
          }
        : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.resolution ? { resolution: query.resolution } : {}),
      ...(query.reason ? { reason: query.reason } : {}),
    };

    const [data, total, agregado, pendientes] = await Promise.all([
      this.prisma.stockLoss.findMany({
        where,
        include: LOSS_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.stockLoss.count({ where }),
      this.prisma.stockLoss.aggregate({ where, _sum: { lossAmount: true } }),
      this.prisma.stockLoss.count({
        where: { businessId, resolution: 'PENDING' },
      }),
    ]);

    return {
      ...paginated(data, total, query),
      summary: {
        /** Lo que de verdad se ha perdido en el filtro actual. */
        total: money(agregado._sum.lossAmount ?? 0).toFixed(2),
        /** Casos a la espera de que el proveedor diga algo. */
        pendingCount: pendientes,
      },
    };
  }

  async findOne(businessId: string, id: string) {
    const perdida = await this.prisma.stockLoss.findFirst({
      where: { id, businessId },
      include: LOSS_INCLUDE,
    });

    if (!perdida) {
      throw new NotFoundException('Registro de pérdida no encontrado');
    }

    return perdida;
  }

  /**
   * Registra mercancia danada. Siempre sale del inventario (no se puede
   * vender), y si el proveedor la repone vuelve a entrar al mismo costo que
   * tenia: cambias unas unidades por otras, no compras nada nuevo.
   */
  async create(businessId: string, userId: string, dto: CreateLossDto) {
    const producto = await this.prisma.product.findFirst({
      where: { id: dto.productId, businessId },
    });

    if (!producto) {
      throw new BadRequestException(
        'El producto no existe o no pertenece a este negocio',
      );
    }

    const cantidad = quantity(dto.quantity);
    const costoUnitario = money(producto.costPrice);
    const resolution = dto.resolution ?? 'PENDING';
    const costoReposicion = money(dto.replacementUnitCost ?? 0);

    this.validarRespuesta(resolution, costoReposicion, dto.paymentMethod);

    return this.prisma.$transaction(async (tx) => {
      const perdida = await tx.stockLoss.create({
        data: {
          businessId,
          userId,
          productId: dto.productId,
          supplierId: dto.supplierId ?? null,
          date: parseBusinessDate(dto.date),
          quantity: cantidad,
          unitCost: costoUnitario,
          reason: dto.reason,
          resolution,
          replacementUnitCost: costoReposicion,
          paymentMethod: dto.paymentMethod ?? null,
          lossAmount: this.calcularPerdida(
            resolution,
            cantidad,
            costoUnitario,
            costoReposicion,
          ),
          resolvedAt:
            resolution === 'PENDING' ? null : parseBusinessDate(dto.date),
          notes: dto.notes?.trim() || null,
        },
      });

      await this.aplicarMovimientos(tx, perdida.id, {
        businessId,
        userId,
        productId: dto.productId,
        cantidad,
        resolution,
      });

      return tx.stockLoss.findUniqueOrThrow({
        where: { id: perdida.id },
        include: LOSS_INCLUDE,
      });
    });
  }

  /**
   * El proveedor ya contesto. Si antes estaba pendiente y ahora repone, entra
   * la mercancia de vuelta; si ya habia repuesto y se corrige a "no repone",
   * vuelve a salir.
   */
  async resolve(
    businessId: string,
    userId: string,
    id: string,
    dto: ResolveLossDto,
  ) {
    const perdida = await this.findOne(businessId, id);
    const cantidad = toDecimal(perdida.quantity);
    // "Hoy" es hoy donde esta el negocio: a las 7 de la tarde en Bogota, en
    // UTC ya es manana.
    const negocio = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { timezone: true },
    });
    const costoReposicion = money(
      dto.replacementUnitCost ?? toDecimal(perdida.replacementUnitCost),
    );
    const metodo = dto.paymentMethod ?? perdida.paymentMethod ?? undefined;

    this.validarRespuesta(dto.resolution, costoReposicion, metodo);

    const reponiaAntes = repone(perdida.resolution);
    const reponeAhora = repone(dto.resolution);

    return this.prisma.$transaction(async (tx) => {
      // Solo se toca el stock si cambia el hecho de que haya reposicion.
      if (!reponiaAntes && reponeAhora) {
        await this.movimiento(tx, {
          businessId,
          userId,
          productId: perdida.productId,
          stockLossId: id,
          type: 'REPLACEMENT',
          delta: cantidad,
          reason: 'Reposición del proveedor',
        });
      } else if (reponiaAntes && !reponeAhora) {
        await this.movimiento(tx, {
          businessId,
          userId,
          productId: perdida.productId,
          stockLossId: id,
          type: 'LOSS',
          delta: cantidad.negated(),
          reason: 'El proveedor no repuso la mercancía',
        });
      }

      // Si deja de haber cobro, no se guarda un costo de reposicion viejo
      // que ya no significa nada.
      const cobra = dto.resolution === 'DISCOUNTED';

      await tx.stockLoss.update({
        where: { id },
        data: {
          resolution: dto.resolution,
          replacementUnitCost: cobra ? costoReposicion : new Prisma.Decimal(0),
          paymentMethod: cobra ? (metodo ?? null) : null,
          lossAmount: this.calcularPerdida(
            dto.resolution,
            cantidad,
            toDecimal(perdida.unitCost),
            costoReposicion,
          ),
          resolvedAt:
            dto.resolution === 'PENDING'
              ? null
              : parseBusinessDate(
                  dto.resolvedAt ?? todayInTimezone(negocio.timezone),
                ),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        },
      });

      return tx.stockLoss.findUniqueOrThrow({
        where: { id },
        include: LOSS_INCLUDE,
      });
    });
  }

  /** Deshace el registro: la mercancía vuelve al inventario como si nada. */
  async remove(businessId: string, id: string) {
    const perdida = await this.findOne(businessId, id);
    const cantidad = toDecimal(perdida.quantity);
    // Si hubo reposición, entró y salió la misma cantidad: no hay nada que
    // devolver. Si no la hubo, hay que reponer lo que salió.
    const aDevolver = repone(perdida.resolution)
      ? new Prisma.Decimal(0)
      : cantidad;

    await this.prisma.$transaction(async (tx) => {
      if (aDevolver.greaterThan(0)) {
        await tx.product.update({
          where: { id: perdida.productId },
          data: { stock: { increment: aDevolver } },
        });
      }
      // Los movimientos se borran en cascada con el registro.
      await tx.stockLoss.delete({ where: { id } });
    });

    return { message: 'Registro eliminado y mercancía devuelta al inventario' };
  }

  /** Resumen para la contabilidad: cuánto se perdió y a la espera de qué. */
  async summary(businessId: string, range: { from: string; to: string }) {
    const where = {
      businessId,
      date: {
        gte: parseBusinessDate(range.from),
        lte: parseBusinessDate(range.to),
      },
    };

    const [agregado, porMotivo, pendientes] = await Promise.all([
      this.prisma.stockLoss.aggregate({
        where,
        _sum: { lossAmount: true },
        _count: true,
      }),
      this.prisma.stockLoss.groupBy({
        by: ['reason'],
        where,
        _sum: { lossAmount: true, quantity: true },
        _count: true,
      }),
      this.prisma.stockLoss.aggregate({
        where: { businessId, resolution: 'PENDING' },
        _sum: { lossAmount: true },
        _count: true,
      }),
    ]);

    return {
      total: money(agregado._sum.lossAmount ?? 0).toFixed(2),
      count: agregado._count,
      /** Lo que está en el aire hasta que el proveedor conteste. */
      pending: money(pendientes._sum.lossAmount ?? 0).toFixed(2),
      pendingCount: pendientes._count,
      byReason: porMotivo
        .map((fila) => ({
          reason: fila.reason,
          total: money(fila._sum.lossAmount ?? 0).toFixed(2),
          quantity: new Prisma.Decimal(fila._sum.quantity ?? 0).toFixed(3),
          count: fila._count,
        }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
    };
  }

  // ------------------------------------------------------------------

  /**
   * El dinero que se pierde de verdad:
   *   - No la reponen      -> todo lo que costó la mercancía.
   *   - La reponen gratis  -> nada.
   *   - La reponen cobrando -> solo lo que toca pagar.
   *   - Sin respuesta aún  -> se asume lo peor, y se corrige al resolver.
   */
  private calcularPerdida(
    resolution: LossResolution,
    cantidad: Prisma.Decimal,
    costoUnitario: Prisma.Decimal,
    costoReposicion: Prisma.Decimal,
  ): Prisma.Decimal {
    switch (resolution) {
      case 'FREE':
        return new Prisma.Decimal(0);
      case 'DISCOUNTED':
        return money(cantidad.times(costoReposicion));
      case 'NONE':
      case 'PENDING':
        return money(cantidad.times(costoUnitario));
    }
  }

  private validarRespuesta(
    resolution: LossResolution,
    costoReposicion: Prisma.Decimal,
    paymentMethod?: string,
  ): void {
    if (resolution === 'DISCOUNTED') {
      if (costoReposicion.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Si el proveedor cobra por la reposición, indica cuánto cobra por unidad',
        );
      }
      if (!paymentMethod) {
        throw new BadRequestException(
          'Indica cómo se paga la reposición que cobra el proveedor',
        );
      }
    }
  }

  private async aplicarMovimientos(
    tx: Prisma.TransactionClient,
    stockLossId: string,
    datos: {
      businessId: string;
      userId: string;
      productId: string;
      cantidad: Prisma.Decimal;
      resolution: LossResolution;
    },
  ) {
    // La mercancía dañada sale siempre: no se puede vender.
    await this.movimiento(tx, {
      businessId: datos.businessId,
      userId: datos.userId,
      productId: datos.productId,
      stockLossId,
      type: 'LOSS',
      delta: datos.cantidad.negated(),
      reason: 'Mercancía dañada o perdida',
    });

    if (repone(datos.resolution)) {
      await this.movimiento(tx, {
        businessId: datos.businessId,
        userId: datos.userId,
        productId: datos.productId,
        stockLossId,
        type: 'REPLACEMENT',
        delta: datos.cantidad,
        reason: 'Reposición del proveedor',
      });
    }
  }

  private async movimiento(
    tx: Prisma.TransactionClient,
    datos: {
      businessId: string;
      userId: string;
      productId: string;
      stockLossId: string;
      type: 'LOSS' | 'REPLACEMENT';
      delta: Prisma.Decimal;
      reason: string;
    },
  ) {
    const producto = await tx.product.update({
      where: { id: datos.productId },
      data: { stock: { increment: datos.delta } },
    });

    await tx.stockMovement.create({
      data: {
        businessId: datos.businessId,
        productId: datos.productId,
        userId: datos.userId,
        stockLossId: datos.stockLossId,
        type: datos.type,
        delta: datos.delta,
        stockAfter: producto.stock,
        reason: datos.reason,
      },
    });
  }
}

/** ¿Este desenlace implica que la mercancía vuelve al inventario? */
function repone(resolution: LossResolution): boolean {
  return resolution === 'FREE' || resolution === 'DISCOUNTED';
}
