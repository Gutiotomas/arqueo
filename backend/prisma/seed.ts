/**
 * Datos de demostracion: una tienda de barrio con dos meses de movimiento.
 *
 * Sirve para ver el dashboard y los informes con datos que parecen reales
 * desde el primer arranque. Solo se ejecuta si SEED_DEMO=true.
 *
 *   npm run seed
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, Prisma } from '../src/generated/prisma/client';
import type { PaymentMethod } from '../src/generated/prisma/enums';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3 }),
});

const DIAS_DE_HISTORIA = 60;

const CATEGORIAS_PRODUCTO = ['Bebidas', 'Snacks', 'Aseo', 'Papelería'];

const CATEGORIAS_GASTO = [
  'Arriendo',
  'Servicios públicos',
  'Nómina',
  'Proveedores',
  'Transporte',
  'Otros',
];

/** Precios en pesos colombianos, con magnitudes realistas. */
const PRODUCTOS = [
  { name: 'Gaseosa 1.5 L', categoria: 'Bebidas', costPrice: 3200, salePrice: 5000, stock: 48, minStock: 12 },
  { name: 'Agua botella 600 ml', categoria: 'Bebidas', costPrice: 900, salePrice: 2000, stock: 60, minStock: 20 },
  { name: 'Jugo caja 200 ml', categoria: 'Bebidas', costPrice: 1200, salePrice: 2500, stock: 36, minStock: 12 },
  { name: 'Cerveza lata', categoria: 'Bebidas', costPrice: 2600, salePrice: 4500, stock: 72, minStock: 24 },
  { name: 'Papas fritas grandes', categoria: 'Snacks', costPrice: 2800, salePrice: 5000, stock: 30, minStock: 10 },
  { name: 'Galletas surtidas', categoria: 'Snacks', costPrice: 1500, salePrice: 3000, stock: 40, minStock: 10 },
  { name: 'Chocolatina', categoria: 'Snacks', costPrice: 1100, salePrice: 2200, stock: 8, minStock: 15 },
  { name: 'Maní salado', categoria: 'Snacks', costPrice: 1800, salePrice: 3500, stock: 25, minStock: 8 },
  { name: 'Jabón de manos', categoria: 'Aseo', costPrice: 4200, salePrice: 7500, stock: 18, minStock: 6 },
  { name: 'Papel higiénico x4', categoria: 'Aseo', costPrice: 6500, salePrice: 11000, stock: 5, minStock: 8 },
  { name: 'Detergente 1 kg', categoria: 'Aseo', costPrice: 8000, salePrice: 13500, stock: 14, minStock: 5 },
  { name: 'Cuaderno 100 hojas', categoria: 'Papelería', costPrice: 3500, salePrice: 6000, stock: 22, minStock: 6 },
  { name: 'Bolígrafo', categoria: 'Papelería', costPrice: 700, salePrice: 1800, stock: 50, minStock: 15 },
];

/** Gastos recurrentes de una tienda pequena. */
const GASTOS_FIJOS = [
  { description: 'Arriendo del local', categoria: 'Arriendo', amount: 900000, diaDelMes: 5, paymentMethod: 'TRANSFER' },
  { description: 'Energía eléctrica', categoria: 'Servicios públicos', amount: 280000, diaDelMes: 12, paymentMethod: 'TRANSFER' },
  { description: 'Agua y alcantarillado', categoria: 'Servicios públicos', amount: 95000, diaDelMes: 15, paymentMethod: 'TRANSFER' },
  { description: 'Internet y teléfono', categoria: 'Servicios públicos', amount: 120000, diaDelMes: 18, paymentMethod: 'CARD' },
  { description: 'Pago a auxiliar de tienda', categoria: 'Nómina', amount: 1000000, diaDelMes: 28, paymentMethod: 'TRANSFER' },
];

// Comprar mercancia ya no vive aqui: es una compra al proveedor, no un gasto.
const GASTOS_VARIABLES = [
  { description: 'Transporte de mercancía', categoria: 'Transporte', min: 20000, max: 60000 },
  { description: 'Bolsas y empaques', categoria: 'Otros', min: 15000, max: 45000 },
  { description: 'Mantenimiento de la nevera', categoria: 'Otros', min: 60000, max: 180000 },
];

const PROVEEDORES = [
  'Distribuidora El Trigal',
  'Surtitienda del Norte',
  'Comercializadora La 45',
];

const FORMAS_DE_PAGO: PaymentMethod[] = ['CASH', 'CASH', 'CASH', 'CARD', 'TRANSFER', 'OTHER'];

// Generador con semilla: la demo sale igual en cada maquina.
let semilla = 20260919;
function aleatorio(): number {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}

function entre(min: number, max: number): number {
  return Math.floor(aleatorio() * (max - min + 1)) + min;
}

function elegir<T>(opciones: T[]): T {
  return opciones[Math.floor(aleatorio() * opciones.length)]!;
}

function fechaIso(diasAtras: number): string {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() - diasAtras);
  return fecha.toISOString().slice(0, 10);
}

function fecha(diasAtras: number): Date {
  return new Date(`${fechaIso(diasAtras)}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  if (process.env.SEED_DEMO !== 'true') {
    console.log('SEED_DEMO no es "true": no se crean datos de demostración.');
    return;
  }

  const email = process.env.SEED_EMAIL ?? 'demo@arqueo.app';
  const password = process.env.SEED_PASSWORD ?? 'demo1234';

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) {
    console.log(`Ya existe el usuario ${email}: borrando su negocio para volver a sembrarlo...`);
    await prisma.business.delete({ where: { id: existente.businessId } });
  }

  const business = await prisma.business.create({
    data: {
      name: 'Tienda La Esquina',
      currency: 'COP',
      timezone: 'America/Bogota',
      users: {
        create: {
          email,
          name: 'Dueña de la tienda',
          passwordHash: await bcrypt.hash(password, 12),
        },
      },
      productCategories: { create: CATEGORIAS_PRODUCTO.map((name) => ({ name })) },
      expenseCategories: { create: CATEGORIAS_GASTO.map((name) => ({ name })) },
    },
    include: { users: true, productCategories: true, expenseCategories: true },
  });

  const businessId = business.id;

  const proveedores = [];
  for (const nombre of PROVEEDORES) {
    proveedores.push(
      await prisma.supplier.create({ data: { businessId, name: nombre } }),
    );
  }
  const userId = business.users[0]!.id;
  const categoriaProducto = new Map(
    business.productCategories.map((c) => [c.name, c.id]),
  );
  const categoriaGasto = new Map(
    business.expenseCategories.map((c) => [c.name, c.id]),
  );

  // --- Productos, con su movimiento de stock inicial ---------------------
  const productos = [];
  /** Stock vivo de cada producto mientras se siembra. */
  const stockActual = new Map<string, number>();
  const minimoPorProducto = new Map<string, number>();
  /** Costo promedio vivo de cada producto mientras se siembra. */
  const costoActual = new Map<string, number>();
  for (const item of PRODUCTOS) {
    const producto = await prisma.product.create({
      data: {
        businessId,
        name: item.name,
        categoryId: categoriaProducto.get(item.categoria) ?? null,
        unit: 'ud',
        costPrice: new Prisma.Decimal(item.costPrice),
        salePrice: new Prisma.Decimal(item.salePrice),
        stock: new Prisma.Decimal(item.stock),
        minStock: new Prisma.Decimal(item.minStock),
      },
    });

    minimoPorProducto.set(producto.id, item.minStock);

    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: producto.id,
        userId,
        type: 'IN',
        delta: producto.stock,
        stockAfter: producto.stock,
        reason: 'Stock inicial',
      },
    });

    productos.push(producto);
    stockActual.set(producto.id, item.stock);
    costoActual.set(producto.id, item.costPrice);
  }

  // --- Ventas diarias -----------------------------------------------------
  let totalVentas = 0;
  let totalEntradas = 0;
  let totalCompras = 0;

  for (let diasAtras = DIAS_DE_HISTORIA; diasAtras >= 0; diasAtras--) {
    const dia = fecha(diasAtras);
    const diaSemana = dia.getUTCDay();

    // Los martes llega el pedido al proveedor: se repone lo que anda escaso.
    // Los tres ultimos productos se dejan sin reponer a proposito, para que el
    // aviso de "hay que reponer" del dashboard tenga algo que enseñar.
    if (diaSemana === 2) {
      const aReponer = productos
        .slice(0, -3)
        .filter(
          (producto) =>
            stockActual.get(producto.id)! <= minimoPorProducto.get(producto.id)! * 2,
        );

      if (aReponer.length) {
        const lineas: Prisma.PurchaseItemCreateManyPurchaseInput[] = [];
        let totalCompra = new Prisma.Decimal(0);

        for (const producto of aReponer) {
          const entrada = entre(24, 60);
          // El proveedor no siempre cobra lo mismo: de ahi que el costo del
          // producto sea un promedio ponderado.
          const costoUnitario = new Prisma.Decimal(
            Math.round(Number(producto.costPrice) * (0.92 + aleatorio() * 0.18)),
          );
          const cantidad = new Prisma.Decimal(entrada);
          const subtotal = costoUnitario.times(cantidad);

          lineas.push({
            productId: producto.id,
            quantity: cantidad,
            unitCost: costoUnitario,
            subtotal,
          });
          totalCompra = totalCompra.plus(subtotal);
        }

        // Unas se pagan de contado, otras quedan a deber y se van abonando.
        const suerte = aleatorio();
        const abonado =
          suerte < 0.5
            ? totalCompra
            : suerte < 0.8
              ? new Prisma.Decimal(Math.round(Number(totalCompra) * 0.4))
              : new Prisma.Decimal(0);

        const compra = await prisma.purchase.create({
          data: {
            businessId,
            userId,
            supplierId: elegir(proveedores).id,
            date: dia,
            invoiceNumber: `FV-${entre(10000, 99999)}`,
            dueDate: new Date(dia.getTime() + 30 * 86_400_000),
            total: totalCompra,
            paidAmount: abonado,
            items: { createMany: { data: lineas } },
          },
          include: { items: true },
        });

        if (abonado.greaterThan(0)) {
          await prisma.purchasePayment.create({
            data: {
              businessId,
              purchaseId: compra.id,
              userId,
              date: dia,
              amount: abonado,
              paymentMethod: elegir(['CASH', 'TRANSFER'] as PaymentMethod[]),
            },
          });
        }

        for (const item of compra.items) {
          const actual = stockActual.get(item.productId)!;
          const producto = productos.find((p) => p.id === item.productId)!;
          const entrada = item.quantity.toNumber();
          const nuevo = actual + entrada;
          stockActual.set(item.productId, nuevo);

          // Costo promedio ponderado, igual que hace la aplicacion.
          const costoAnterior = costoActual.get(item.productId)!;
          const base = Math.max(actual, 0);
          const costoNuevo =
            base + entrada > 0
              ? (base * costoAnterior + entrada * item.unitCost.toNumber()) /
                (base + entrada)
              : item.unitCost.toNumber();
          costoActual.set(item.productId, costoNuevo);

          await prisma.product.update({
            where: { id: producto.id },
            data: {
              stock: new Prisma.Decimal(nuevo),
              costPrice: new Prisma.Decimal(costoNuevo.toFixed(2)),
            },
          });
          await prisma.stockMovement.create({
            data: {
              businessId,
              productId: producto.id,
              userId,
              purchaseItemId: item.id,
              type: 'IN',
              delta: item.quantity,
              stockAfter: new Prisma.Decimal(nuevo),
              reason: 'Compra a proveedor',
            },
          });
          totalEntradas++;
        }
        totalCompras++;
      }
    }
    // Los fines de semana se vende mas; los lunes, menos.
    const ventasDelDia =
      diaSemana === 0 ? entre(6, 11) : diaSemana === 6 ? entre(12, 19) : entre(8, 15);

    for (let i = 0; i < ventasDelDia; i++) {
      const lineas = entre(1, 3);
      const items: Prisma.SaleItemCreateManySaleInput[] = [];
      let total = new Prisma.Decimal(0);

      for (let j = 0; j < lineas; j++) {
        const disponibles = productos.filter(
          (candidato) => (stockActual.get(candidato.id) ?? 0) > 0,
        );
        if (!disponibles.length) break;

        const producto = elegir(disponibles);
        const cantidad = new Prisma.Decimal(
          Math.min(entre(1, 3), stockActual.get(producto.id)!),
        );
        const precio = new Prisma.Decimal(producto.salePrice);
        const subtotal = precio.times(cantidad);

        items.push({
          productId: producto.id,
          description: producto.name,
          quantity: cantidad,
          unitPrice: precio,
          unitCost: new Prisma.Decimal(
            costoActual.get(producto.id)!.toFixed(2),
          ),
          subtotal,
        });
        total = total.plus(subtotal);
        stockActual.set(
          producto.id,
          stockActual.get(producto.id)! - cantidad.toNumber(),
        );
      }

      // Una de cada diez ventas es un servicio sin producto (concepto libre).
      if (aleatorio() < 0.1) {
        const importe = new Prisma.Decimal(entre(5, 30) * 1000);
        items.push({
          productId: null,
          description: elegir([
            'Recarga de celular',
            'Fotocopias',
            'Servicio de impresión',
            'Domicilio',
          ]),
          quantity: new Prisma.Decimal(1),
          unitPrice: importe,
          unitCost: new Prisma.Decimal(0),
          subtotal: importe,
        });
        total = total.plus(importe);
      }

      if (!items.length) continue;

      const venta = await prisma.sale.create({
        data: {
          businessId,
          userId,
          date: dia,
          paymentMethod: elegir(FORMAS_DE_PAGO),
          total,
          items: { createMany: { data: items } },
        },
        include: { items: true },
      });

      // Cada linea con producto descuenta stock y deja su movimiento.
      for (const item of venta.items) {
        if (!item.productId) continue;
        const actualizado = await prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
        await prisma.stockMovement.create({
          data: {
            businessId,
            productId: item.productId,
            userId,
            saleItemId: item.id,
            type: 'OUT',
            delta: item.quantity.negated(),
            stockAfter: actualizado.stock,
            reason: 'Venta',
          },
        });
      }

      totalVentas++;
    }
  }

  // --- Gastos -------------------------------------------------------------
  let totalGastos = 0;
  for (let diasAtras = DIAS_DE_HISTORIA; diasAtras >= 0; diasAtras--) {
    const dia = fecha(diasAtras);

    for (const gasto of GASTOS_FIJOS) {
      if (dia.getUTCDate() !== gasto.diaDelMes) continue;
      await prisma.expense.create({
        data: {
          businessId,
          userId,
          date: dia,
          description: gasto.description,
          amount: new Prisma.Decimal(gasto.amount),
          paymentMethod: gasto.paymentMethod as PaymentMethod,
          categoryId: categoriaGasto.get(gasto.categoria) ?? null,
        },
      });
      totalGastos++;
    }

    // Compras a proveedor un par de veces por semana.
    if (aleatorio() < 0.3) {
      const gasto = elegir(GASTOS_VARIABLES);
      await prisma.expense.create({
        data: {
          businessId,
          userId,
          date: dia,
          description: gasto.description,
          amount: new Prisma.Decimal(entre(gasto.min, gasto.max)),
          paymentMethod: elegir(['CASH', 'TRANSFER'] as PaymentMethod[]),
          categoryId: categoriaGasto.get(gasto.categoria) ?? null,
        },
      });
      totalGastos++;
    }
  }

  // --- Abonos posteriores: las compras viejas se van pagando ---------------
  // Las tres mas recientes se dejan a deber, que es lo que hace interesante
  // la pantalla de compras.
  const pendientes = await prisma.purchase.findMany({
    where: { businessId },
    orderBy: { date: 'asc' },
  });

  let totalAbonos = 0;
  for (const compra of pendientes.slice(0, -3)) {
    const saldo = compra.total.minus(compra.paidAmount);
    if (saldo.lessThanOrEqualTo(0)) continue;

    // Se termina de pagar una o dos semanas despues de la compra.
    const fechaAbono = new Date(
      compra.date.getTime() + entre(7, 16) * 86_400_000,
    );
    if (fechaAbono > new Date()) continue;

    await prisma.purchasePayment.create({
      data: {
        businessId,
        purchaseId: compra.id,
        userId,
        date: fechaAbono,
        amount: saldo,
        paymentMethod: elegir(['CASH', 'TRANSFER'] as PaymentMethod[]),
        notes: 'Saldo de la factura',
      },
    });
    await prisma.purchase.update({
      where: { id: compra.id },
      data: { paidAmount: compra.total },
    });
    totalAbonos++;
  }

  // --- Mercancia danada, con los tres desenlaces ---------------------------
  // Una que el proveedor repone gratis, otra que repone cobrando, otra que no
  // repone (perdida total) y una a la espera de respuesta.
  const CASOS_DE_PERDIDA: {
    producto: string;
    diasAtras: number;
    cantidad: number;
    reason: 'DAMAGED' | 'EXPIRED' | 'THEFT' | 'OTHER';
    resolution: 'FREE' | 'DISCOUNTED' | 'NONE' | 'PENDING';
    costoReposicion?: number;
    notes: string;
  }[] = [
    {
      producto: 'Gaseosa 1.5 L',
      diasAtras: 12,
      cantidad: 6,
      reason: 'DAMAGED',
      resolution: 'FREE',
      notes: 'Llegaron golpeadas en el pedido; el proveedor las cambió sin cobrar',
    },
    {
      producto: 'Jugo caja 200 ml',
      diasAtras: 9,
      cantidad: 8,
      reason: 'EXPIRED',
      resolution: 'DISCOUNTED',
      costoReposicion: 400,
      notes: 'Se vencieron en la bodega; el proveedor repuso cobrando la mitad',
    },
    {
      producto: 'Papas fritas grandes',
      diasAtras: 5,
      cantidad: 4,
      reason: 'DAMAGED',
      resolution: 'NONE',
      notes: 'Se rompieron las bolsas en la tienda; no entran en garantía',
    },
    {
      producto: 'Chocolatina',
      diasAtras: 2,
      cantidad: 3,
      reason: 'THEFT',
      resolution: 'PENDING',
      notes: 'Faltante en el conteo; pendiente de hablar con el proveedor',
    },
  ];

  let totalPerdidas = 0;
  for (const caso of CASOS_DE_PERDIDA) {
    // Si el producto elegido se agoto vendiendo, la merma se registra sobre
    // el que mas existencias tenga: en la demo no debe verse stock negativo.
    const preferido = productos.find((p) => p.name === caso.producto);
    const producto =
      preferido && stockActual.get(preferido.id)! >= caso.cantidad
        ? preferido
        : [...productos].sort(
            (a, b) => stockActual.get(b.id)! - stockActual.get(a.id)!,
          )[0]!;

    if (stockActual.get(producto.id)! < caso.cantidad) continue;

    const dia = fecha(caso.diasAtras);
    const cantidad = new Prisma.Decimal(caso.cantidad);
    const costoUnitario = new Prisma.Decimal(
      costoActual.get(producto.id)!.toFixed(2),
    );
    const costoReposicion = new Prisma.Decimal(caso.costoReposicion ?? 0);
    const repone = caso.resolution === 'FREE' || caso.resolution === 'DISCOUNTED';

    const perdida =
      caso.resolution === 'FREE'
        ? new Prisma.Decimal(0)
        : caso.resolution === 'DISCOUNTED'
          ? cantidad.times(costoReposicion)
          : cantidad.times(costoUnitario);

    const registro = await prisma.stockLoss.create({
      data: {
        businessId,
        userId,
        productId: producto.id,
        supplierId: elegir(proveedores).id,
        date: dia,
        quantity: cantidad,
        unitCost: costoUnitario,
        reason: caso.reason,
        resolution: caso.resolution,
        replacementUnitCost: costoReposicion,
        paymentMethod: caso.resolution === 'DISCOUNTED' ? 'CASH' : null,
        lossAmount: perdida,
        resolvedAt: caso.resolution === 'PENDING' ? null : dia,
        notes: caso.notes,
      },
    });

    // La mercancia danada sale siempre; si la reponen, vuelve a entrar.
    const actual = stockActual.get(producto.id)!;
    const trasLaMerma = actual - caso.cantidad;
    stockActual.set(producto.id, repone ? actual : trasLaMerma);

    await prisma.product.update({
      where: { id: producto.id },
      data: { stock: new Prisma.Decimal(stockActual.get(producto.id)!) },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: producto.id,
        userId,
        stockLossId: registro.id,
        type: 'LOSS',
        delta: cantidad.negated(),
        stockAfter: new Prisma.Decimal(trasLaMerma),
        reason: 'Mercancía dañada o perdida',
      },
    });
    if (repone) {
      await prisma.stockMovement.create({
        data: {
          businessId,
          productId: producto.id,
          userId,
          stockLossId: registro.id,
          type: 'REPLACEMENT',
          delta: cantidad,
          stockAfter: new Prisma.Decimal(actual),
          reason: 'Reposición del proveedor',
        },
      });
    }
    totalPerdidas++;
  }

  // --- Cierres de caja de la ultima semana --------------------------------
  let totalCierres = 0;
  for (let diasAtras = 7; diasAtras >= 1; diasAtras--) {
    const dia = fecha(diasAtras);

    const [ventasEfectivo, gastosEfectivo] = await Promise.all([
      prisma.sale.aggregate({
        where: { businessId, date: dia, paymentMethod: 'CASH' },
        _sum: { total: true },
      }),
      prisma.expense.aggregate({
        where: { businessId, date: dia, paymentMethod: 'CASH' },
        _sum: { amount: true },
      }),
    ]);

    const apertura = new Prisma.Decimal(100000);
    const esperado = apertura
      .plus(ventasEfectivo._sum.total ?? 0)
      .minus(gastosEfectivo._sum.amount ?? 0);
    // Casi siempre cuadra; de vez en cuando falta o sobra algo de suelto.
    const descuadre = aleatorio() < 0.3 ? new Prisma.Decimal(entre(-5000, 5000)) : new Prisma.Decimal(0);
    const contado = esperado.plus(descuadre);

    await prisma.cashClosing.create({
      data: {
        businessId,
        userId,
        date: dia,
        openingCash: apertura,
        closingCash: contado,
        expectedCash: esperado,
        difference: contado.minus(esperado),
        notes: descuadre.isZero() ? null : 'Descuadre de suelto',
      },
    });
    totalCierres++;
  }

  console.log('Datos de demostración creados:');
  console.log(`  Negocio:  ${business.name} (${business.currency})`);
  console.log(`  Usuario:  ${email} / ${password}`);
  console.log(`  Productos: ${productos.length}`);
  console.log(`  Compras:   ${totalCompras} (${totalEntradas} entradas de stock)`);
  console.log(`  Abonos:    ${totalAbonos} pagos posteriores a proveedor`);
  console.log(`  Ventas:    ${totalVentas}`);
  console.log(`  Gastos:    ${totalGastos}`);
  console.log(`  Pérdidas:  ${totalPerdidas} casos de mercancía dañada`);
  console.log(`  Cierres:   ${totalCierres}`);
}

main()
  .catch((error) => {
    console.error('Fallo el seed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
