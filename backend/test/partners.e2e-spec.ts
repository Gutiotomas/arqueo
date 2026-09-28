import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Socias y reparto de ganancias. Repartir no es un gasto: la utilidad neta no
 * cambia. Lo que cambia es el dinero: sale de la caja o de la cuenta según
 * cómo se le pagó a cada socia, y "otro" no toca ninguna de las dos.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Socias y reparto de ganancias (e2e)', () => {
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
  let sandra = '';
  let bibiana = '';
  let repartoId = '';

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    token = await registrar('Socias');
    // Hoy se vende 500.000 (sin costo, en efectivo) y se gasta 100.000: utilidad 400.000.
    await como(
      http()
        .post('/api/v1/sales')
        .send({ date: hoy, items: [{ description: 'Ventas del día', quantity: 1, unitPrice: 500000, paymentMethod: 'CASH' }] }),
    ).expect(201);
    await como(
      http()
        .post('/api/v1/expenses')
        .send({ date: hoy, description: 'Arriendo', amount: 100000, paymentMethod: 'TRANSFER' }),
    ).expect(201);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: negocios } } });
    await app.close();
  });

  it('las socias tienen su porcentaje y entre todas no pasan del 100 %', async () => {
    sandra = (await como(http().post('/api/v1/partners').send({ name: 'Sandra', sharePercent: 50 })).expect(201)).body.id;
    bibiana = (await como(http().post('/api/v1/partners').send({ name: 'Bibiana', sharePercent: 50 })).expect(201)).body.id;

    const deMas = await como(http().post('/api/v1/partners').send({ name: 'Otra', sharePercent: 10 })).expect(400);
    expect(deMas.body.message).toMatch(/100 %/);

    const socias = await como(http().get('/api/v1/partners')).expect(200);
    expect(socias.body.map((s: { name: string }) => s.name).sort()).toEqual(['Bibiana', 'Sandra']);
  });

  it('repartir no cambia la utilidad, pero sale de la caja y de la cuenta según cómo se pagó', async () => {
    // Punto de partida de la cuenta ayer, para ver el efecto hoy.
    await como(http().post('/api/v1/bank-account/closings').send({ date: ayer, closingBalance: 1000000 })).expect(201);

    const antes = await como(http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`)).expect(200);
    expect(antes.body.netProfit).toBe('400000.00');

    const reparto = await como(
      http()
        .post('/api/v1/profit-distributions')
        .send({
          date: hoy,
          notes: 'Ganancias de la semana',
          items: [
            { partnerId: sandra, amount: 150000, paymentMethod: 'CASH' },
            { partnerId: bibiana, amount: 150000, paymentMethod: 'TRANSFER' },
          ],
        }),
    ).expect(201);
    repartoId = reparto.body.id;
    expect(reparto.body.total).toBe('300000');

    const conta = await como(http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`)).expect(200);
    expect(conta.body.netProfit).toBe('400000.00');
    expect(conta.body.operatingExpenses).toBe('100000.00');
    expect(conta.body.distributed).toBe('300000.00');
    expect(conta.body.retained).toBe('100000.00');
    expect(conta.body.distributedByPartner.map((f: { name: string; amount: string }) => [f.name, f.amount]).sort()).toEqual([
      ['Bibiana', '150000.00'],
      ['Sandra', '150000.00'],
    ]);

    // Caja: 500.000 vendidos en efectivo − 150.000 que se llevó Sandra.
    const caja = await como(http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`)).expect(200);
    expect(caja.body.partnerWithdrawals).toBe('150000.00');
    expect(caja.body.expectedCash).toBe('350000.00');

    // Cuenta: 1.000.000 − 100.000 de arriendo − 150.000 que se llevó Bibiana.
    const cuenta = await como(http().get(`/api/v1/bank-account/preview?date=${hoy}`)).expect(200);
    expect(cuenta.body.movements.partnerWithdrawals).toBe('150000.00');
    expect(cuenta.body.expectedBalance).toBe('750000.00');
  });

  it('pagado como "otro" no toca ni caja ni cuenta; no se puede fiar ni repetir socia', async () => {
    const otro = await como(
      http()
        .post('/api/v1/profit-distributions')
        .send({ date: hoy, items: [{ partnerId: sandra, amount: 20000, paymentMethod: 'OTHER' }] }),
    ).expect(201);
    const caja = await como(http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`)).expect(200);
    expect(caja.body.expectedCash).toBe('350000.00');
    const cuenta = await como(http().get(`/api/v1/bank-account/preview?date=${hoy}`)).expect(200);
    expect(cuenta.body.expectedBalance).toBe('750000.00');
    await como(http().delete(`/api/v1/profit-distributions/${otro.body.id}`)).expect(200);

    const fiado = await como(
      http()
        .post('/api/v1/profit-distributions')
        .send({ date: hoy, items: [{ partnerId: sandra, amount: 1000, paymentMethod: 'CREDIT' }] }),
    ).expect(400);
    expect(fiado.body.message).toMatch(/fiar/i);

    const repetida = await como(
      http()
        .post('/api/v1/profit-distributions')
        .send({
          date: hoy,
          items: [
            { partnerId: sandra, amount: 1000, paymentMethod: 'CASH' },
            { partnerId: sandra, amount: 1000, paymentMethod: 'CASH' },
          ],
        }),
    ).expect(400);
    expect(repetida.body.message).toMatch(/una sola vez/i);
  });

  it('una socia con repartos se desactiva en vez de borrarse; borrar el reparto lo deshace', async () => {
    const quitar = await como(http().delete(`/api/v1/partners/${sandra}`)).expect(200);
    expect(quitar.body.message).toMatch(/desactivó/i);
    // Desactivada, su 50 % queda libre.
    await como(http().post('/api/v1/partners').send({ name: 'Nueva', sharePercent: 50 })).expect(201);

    await como(http().delete(`/api/v1/profit-distributions/${repartoId}`)).expect(200);
    const conta = await como(http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`)).expect(200);
    expect(conta.body.distributed).toBe('0.00');
    expect(conta.body.retained).toBe('400000.00');
  });

  it('otro negocio no ve estas socias ni sus repartos', async () => {
    const otro = await registrar('Ajeno');
    expect((await como(http().get('/api/v1/partners'), otro).expect(200)).body).toEqual([]);
    expect((await como(http().get('/api/v1/profit-distributions'), otro).expect(200)).body).toEqual([]);
    const ajena = await como(
      http()
        .post('/api/v1/profit-distributions')
        .send({ date: hoy, items: [{ partnerId: bibiana, amount: 1000, paymentMethod: 'CASH' }] }),
      otro,
    ).expect(400);
    expect(ajena.body.message).toMatch(/no existe/i);
  });
});
