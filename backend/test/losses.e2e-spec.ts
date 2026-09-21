import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Mercancia danada, con los tres desenlaces posibles.
 *
 * Lo que se pierde no es el precio de venta: es lo que te costo a ti, y solo
 * si el proveedor no lo repone.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Mercancía dañada (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufijo = Date.now();
  // El dia del negocio (America/Bogota), no el de UTC.
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  let token = '';
  let businessId = '';
  let productoId = '';

  const http = () => request(app.getHttpServer());
  const como = (peticion: request.Test) =>
    peticion.set('Authorization', `Bearer ${token}`);

  const stock = async () => {
    const { body } = await como(http().get(`/api/v1/products/${productoId}`));
    return Number(body.stock);
  };

  const contabilidad = async () => {
    const { body } = await como(
      http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`),
    );
    return body;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registro = await http()
      .post('/api/v1/auth/register')
      .send({
        businessName: `Mermas ${sufijo}`,
        name: 'Dueña',
        email: `merma-${sufijo}@arqueo.test`,
        password: 'claveSegura1',
      });
    token = registro.body.accessToken;
    businessId = registro.body.user.business.id;

    // 30 unidades a 1.000 de costo.
    const producto = await como(
      http().post('/api/v1/products').send({
        name: 'Huevos AA',
        salePrice: 1500,
        costPrice: 1000,
        stock: 30,
      }),
    );
    productoId = producto.body.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await app.close();
  });

  it('si el proveedor no repone, se pierde el costo entero', async () => {
    const perdida = await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: hoy,
        quantity: 5,
        reason: 'DAMAGED',
        resolution: 'NONE',
      }),
    ).expect(201);

    // 5 unidades a 1.000 de costo
    expect(perdida.body.lossAmount).toBe('5000');
    expect(await stock()).toBe(25);

    const conta = await contabilidad();
    expect(conta.losses).toBe('5000.00');
    expect(conta.netProfit).toBe('-5000.00');
  });

  it('si la repone gratis, no se pierde nada y el stock vuelve', async () => {
    const perdida = await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: hoy,
        quantity: 4,
        reason: 'DAMAGED',
        resolution: 'FREE',
      }),
    ).expect(201);

    expect(perdida.body.lossAmount).toBe('0');
    // Salen 4 dañadas y entran 4 repuestas: el stock no se mueve.
    expect(await stock()).toBe(25);

    const conta = await contabilidad();
    expect(conta.losses).toBe('5000.00'); // sigue siendo solo la primera
  });

  it('si la repone cobrando, solo se pierde lo que toca pagar', async () => {
    const perdida = await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: hoy,
        quantity: 10,
        reason: 'DAMAGED',
        resolution: 'DISCOUNTED',
        replacementUnitCost: 300,
        paymentMethod: 'CASH',
      }),
    ).expect(201);

    // No se pierden los 10.000 que costaron: solo los 3.000 de la reposición.
    expect(perdida.body.lossAmount).toBe('3000');
    expect(await stock()).toBe(25);

    const conta = await contabilidad();
    expect(conta.losses).toBe('8000.00');
  });

  it('cobrar por la reposición exige decir cuánto y cómo se paga', async () => {
    const sinPrecio = await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: hoy,
        quantity: 1,
        reason: 'DAMAGED',
        resolution: 'DISCOUNTED',
      }),
    ).expect(400);
    expect(sinPrecio.body.message).toMatch(/cuánto cobra/i);

    const sinMetodo = await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: hoy,
        quantity: 1,
        reason: 'DAMAGED',
        resolution: 'DISCOUNTED',
        replacementUnitCost: 300,
      }),
    ).expect(400);
    expect(sinMetodo.body.message).toMatch(/cómo se paga/i);
  });

  it('lo pendiente se asume perdido hasta que el proveedor contesta', async () => {
    const pendiente = await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: hoy,
        quantity: 3,
        reason: 'EXPIRED',
        resolution: 'PENDING',
      }),
    ).expect(201);

    expect(pendiente.body.resolution).toBe('PENDING');
    expect(pendiente.body.lossAmount).toBe('3000');
    expect(await stock()).toBe(22);

    // El proveedor responde que lo repone gratis: la pérdida desaparece y la
    // mercancía vuelve al inventario.
    const resuelta = await como(
      http()
        .patch(`/api/v1/losses/${pendiente.body.id}/resolve`)
        .send({ resolution: 'FREE', resolvedAt: hoy }),
    ).expect(200);

    expect(resuelta.body.lossAmount).toBe('0');
    expect(resuelta.body.resolvedAt).not.toBeNull();
    // Al dejar de haber cobro no queda rastro del costo de reposición.
    expect(Number(resuelta.body.replacementUnitCost)).toBe(0);
    expect(resuelta.body.paymentMethod).toBeNull();
    expect(await stock()).toBe(25);

    const conta = await contabilidad();
    expect(conta.losses).toBe('8000.00');
  });

  it('la reposición pagada en efectivo sale de la caja del día', async () => {
    const caja = await como(
      http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`),
    ).expect(200);

    // Los 3.000 de la reposición cobrada
    expect(caja.body.cashSupplierPayments).toBe('3000.00');
    expect(caja.body.expectedCash).toBe('-3000.00');
  });

  it('si el proveedor cobra días después, la caja lo nota ese día, no antes', async () => {
    // Ayer contado desde el día del negocio, no desde UTC.
    const ayer = new Date(`${hoy}T00:00:00.000Z`);
    ayer.setUTCDate(ayer.getUTCDate() - 1);
    const ayerIso = ayer.toISOString().slice(0, 10);

    const perdida = await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: ayerIso,
        quantity: 2,
        reason: 'DAMAGED',
      }),
    ).expect(201);

    // Se dañó ayer, pero el proveedor cobra la reposición hoy.
    await como(
      http()
        .patch(`/api/v1/losses/${perdida.body.id}/resolve`)
        .send({
          resolution: 'DISCOUNTED',
          replacementUnitCost: 250,
          paymentMethod: 'CASH',
          resolvedAt: hoy,
        }),
    ).expect(200);

    const cajaAyer = await como(
      http().get(`/api/v1/cash-closings/preview?date=${ayerIso}&openingCash=0`),
    ).expect(200);
    expect(cajaAyer.body.cashSupplierPayments).toBe('0.00');

    const cajaHoy = await como(
      http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`),
    ).expect(200);
    // 3.000 de la reposición anterior + 500 de esta
    expect(cajaHoy.body.cashSupplierPayments).toBe('3500.00');
  });

  it('borrar el registro devuelve la mercancía al inventario', async () => {
    const listado = await como(http().get('/api/v1/losses?limit=50'));
    const total = listado.body.data.find(
      (fila: { resolution: string }) => fila.resolution === 'NONE',
    );

    await como(http().delete(`/api/v1/losses/${total.id}`)).expect(200);

    expect(await stock()).toBe(30);
    const conta = await contabilidad();
    expect(conta.losses).toBe('3000.00');
  });

  it('el resumen agrupa por motivo y cuenta lo que sigue en el aire', async () => {
    await como(
      http().post('/api/v1/losses').send({
        productId: productoId,
        date: hoy,
        quantity: 2,
        reason: 'THEFT',
      }),
    ).expect(201);

    const resumen = await como(
      http().get(`/api/v1/losses/summary?from=${hoy}&to=${hoy}`),
    ).expect(200);

    expect(resumen.body.pendingCount).toBe(1);
    expect(resumen.body.pending).toBe('2000.00');
    expect(resumen.body.byReason.map((f: { reason: string }) => f.reason)).toContain(
      'THEFT',
    );
  });
});
