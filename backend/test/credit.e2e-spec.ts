import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * El registro del día y los fiados. Una venta trae varias líneas y cada una
 * se pagó a su manera: de seis arepas, dos en efectivo, dos por transferencia
 * y dos fiadas a alguien. Lo fiado va al cuaderno del cliente y se cobra
 * después; el dinero entra a la caja o a la cuenta el día que paga.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Ventas por línea y fiados (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufijo = Date.now();
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const ayer = (() => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  let token = '';
  const negocios: string[] = [];
  let arepas = '';
  let ventaId = '';
  let martaId = '';

  const http = () => request(app.getHttpServer());
  const como = (peticion: request.Test, conToken = token) =>
    peticion.set('Authorization', `Bearer ${conToken}`);

  async function registrar(nombre: string) {
    const registro = await http()
      .post('/api/v1/auth/register')
      .send({
        businessName: `${nombre} ${sufijo}`,
        name: 'Dueña',
        email: `${nombre.toLowerCase()}-${sufijo}@arqueo.test`,
        password: 'claveSegura1',
      })
      .expect(201);
    negocios.push(registro.body.user.business.id);
    return registro.body.accessToken as string;
  }

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

    token = await registrar('Fiados');
    const producto = await como(
      http()
        .post('/api/v1/products')
        .send({ name: 'Arepa de chócolo', salePrice: 3000, costPrice: 1500, stock: 20 }),
    ).expect(201);
    arepas = producto.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: negocios } } });
    await app.close();
  });

  it('para fiar una línea hay que decir a quién', async () => {
    const sinCliente = await como(
      http()
        .post('/api/v1/sales')
        .send({
          date: ayer,
          items: [{ productId: arepas, quantity: 2, unitPrice: 3000, paymentMethod: 'CREDIT' }],
        }),
    ).expect(400);
    expect(sinCliente.body.message).toMatch(/a quién/i);
  });

  it('seis arepas: dos en efectivo, dos por transferencia y dos fiadas, en una sola venta', async () => {
    const venta = await como(
      http()
        .post('/api/v1/sales')
        .send({
          date: ayer,
          items: [
            { productId: arepas, quantity: 2, unitPrice: 3000, paymentMethod: 'CASH' },
            { productId: arepas, quantity: 2, unitPrice: 3000, paymentMethod: 'TRANSFER' },
            { productId: arepas, quantity: 2, unitPrice: 3000, paymentMethod: 'CREDIT', customerName: 'Doña Marta' },
            { description: 'Jugo', quantity: 1, unitPrice: 4000, paymentMethod: 'CREDIT', customerName: 'Doña Marta' },
          ],
        }),
    ).expect(201);

    ventaId = venta.body.id;
    expect(venta.body.total).toBe('22000');
    expect(venta.body.items).toHaveLength(4);
    const fiada = venta.body.items.find((i: { paymentMethod: string }) => i.paymentMethod === 'CREDIT');
    expect(fiada.customer.name).toBe('Doña Marta');
    martaId = fiada.customer.id;

    // Todo sale del inventario, se pague como se pague.
    const producto = await como(http().get(`/api/v1/products/${arepas}`)).expect(200);
    expect(Number(producto.body.stock)).toBe(14);

    // La venta cuenta entera el día que se hace; lo fiado queda en el cuaderno.
    const conta = await como(
      http().get(`/api/v1/accounting/overview?from=${ayer}&to=${ayer}`),
    ).expect(200);
    expect(conta.body.sales).toBe('22000.00');
    expect(conta.body.cogs).toBe('9000.00');
    expect(conta.body.customerDebt).toBe('10000.00');

    const deuda = await como(http().get('/api/v1/customers/debt')).expect(200);
    expect(deuda.body.total).toBe('10000.00');
    expect(deuda.body.byCustomer).toEqual([
      expect.objectContaining({ customerId: martaId, name: 'Doña Marta', balance: '10000.00', creditCount: 2, oldestDate: ayer }),
    ]);

    // El reparto por forma de pago es por línea, no por venta.
    const reparto = await como(
      http().get(`/api/v1/dashboard/sales-by-payment-method?from=${ayer}&to=${ayer}`),
    ).expect(200);
    const filas: { paymentMethod: string; total: string }[] = Array.isArray(reparto.body)
      ? reparto.body
      : reparto.body.data;
    const porMetodo = Object.fromEntries(filas.map((f) => [f.paymentMethod, f.total]));
    expect(porMetodo).toEqual({ CASH: '6000.00', TRANSFER: '6000.00', CREDIT: '10000.00' });
  });

  it('a la caja y a la cuenta solo entra lo que se pagó, y lo fiado cuando se cobra', async () => {
    const cajaAyer = await como(
      http().get(`/api/v1/cash-closings/preview?date=${ayer}&openingCash=0`),
    ).expect(200);
    expect(cajaAyer.body.cashSales).toBe('6000.00');
    expect(cajaAyer.body.cashCollections).toBe('0.00');
    expect(cajaAyer.body.expectedCash).toBe('6000.00');

    // Hoy Marta abona 7.000 en efectivo y 1.000 por transferencia.
    const cobro = await como(
      http()
        .post(`/api/v1/customers/${martaId}/payments`)
        .send({ date: hoy, amount: 7000, paymentMethod: 'CASH' }),
    ).expect(201);
    expect(cobro.body.balance).toBe('3000.00');
    await como(
      http()
        .post(`/api/v1/customers/${martaId}/payments`)
        .send({ date: hoy, amount: 1000, paymentMethod: 'TRANSFER' }),
    ).expect(201);

    const cajaHoy = await como(
      http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`),
    ).expect(200);
    expect(cajaHoy.body.cashCollections).toBe('7000.00');
    expect(cajaHoy.body.expectedCash).toBe('7000.00');

    await como(
      http().post('/api/v1/bank-account/closings').send({ date: ayer, closingBalance: 100000 }),
    ).expect(201);
    const cuenta = await como(http().get(`/api/v1/bank-account/preview?date=${hoy}`)).expect(200);
    expect(cuenta.body.movements.collections).toBe('1000.00');
    expect(cuenta.body.expectedBalance).toBe('101000.00');

    // Cobrar no vuelve a contar la venta.
    const conta = await como(
      http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`),
    ).expect(200);
    expect(conta.body.sales).toBe('0.00');
    expect(conta.body.customerDebt).toBe('2000.00');
  });

  it('no se cobra de más ni fiado, y borrar un cobro devuelve la deuda', async () => {
    const deMas = await como(
      http()
        .post(`/api/v1/customers/${martaId}/payments`)
        .send({ date: hoy, amount: 2001, paymentMethod: 'CASH' }),
    ).expect(400);
    expect(deMas.body.message).toMatch(/supera/i);

    await como(
      http()
        .post(`/api/v1/customers/${martaId}/payments`)
        .send({ date: hoy, amount: 500, paymentMethod: 'CREDIT' }),
    ).expect(400);

    const cuenta = await como(http().get(`/api/v1/customers/${martaId}/account`)).expect(200);
    expect(cuenta.body.credited).toBe('10000.00');
    expect(cuenta.body.paid).toBe('8000.00');
    expect(
      cuenta.body.credits.map((c: { description: string }) => c.description).sort(),
    ).toEqual(['Arepa de chócolo', 'Jugo']);
    const ultimo = cuenta.body.payments[0];
    const sinCobro = await como(
      http().delete(`/api/v1/customers/${martaId}/payments/${ultimo.id}`),
    ).expect(200);
    expect(sinCobro.body.balance).toBe('3000.00');
  });

  it('editar la venta recalcula lo fiado; el listado filtra por forma de pago', async () => {
    // Al final Marta solo se llevó una arepa fiada.
    const corregida = await como(
      http()
        .put(`/api/v1/sales/${ventaId}`)
        .send({
          date: ayer,
          items: [
            { productId: arepas, quantity: 2, unitPrice: 3000, paymentMethod: 'CASH' },
            { productId: arepas, quantity: 2, unitPrice: 3000, paymentMethod: 'TRANSFER' },
            { productId: arepas, quantity: 1, unitPrice: 3000, paymentMethod: 'CREDIT', customerId: martaId },
            { description: 'Jugo', quantity: 1, unitPrice: 4000, paymentMethod: 'CREDIT', customerId: martaId },
          ],
        }),
    ).expect(200);
    expect(corregida.body.total).toBe('19000');

    const deuda = await como(http().get('/api/v1/customers/debt')).expect(200);
    // 7.000 fiados − 7.000 cobrados: ya no debe nada, así que no aparece.
    expect(deuda.body.total).toBe('0.00');
    expect(deuda.body.byCustomer).toEqual([]);

    const fiadas = await como(http().get('/api/v1/sales?paymentMethod=CREDIT')).expect(200);
    expect(fiadas.body.data.map((v: { id: string }) => v.id)).toEqual([ventaId]);
    const conTarjeta = await como(http().get('/api/v1/sales?paymentMethod=CARD')).expect(200);
    expect(conTarjeta.body.data).toEqual([]);

    const conMovimiento = await como(http().delete(`/api/v1/customers/${martaId}`)).expect(409);
    expect(conMovimiento.body.message).toMatch(/fiada/i);
  });

  it('otro negocio no ve estos clientes ni sus deudas', async () => {
    const otro = await registrar('Ajeno');
    const deuda = await como(http().get('/api/v1/customers/debt'), otro).expect(200);
    expect(deuda.body.total).toBe('0.00');
    await como(http().get(`/api/v1/customers/${martaId}/account`), otro).expect(404);
    await como(http().get(`/api/v1/sales/${ventaId}`), otro).expect(404);
  });
});
