import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * La cuenta del negocio y la comisión del datáfono, con números a mano.
 *
 * Ayer se hace el primer cierre (punto de partida: 1.000.000). Hoy pasa de
 * todo, en efectivo y por la cuenta, y el cierre de hoy tiene que saber qué
 * es de la cuenta y qué no.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Cuenta del negocio (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufijo = Date.now();
  const enBogota = (fecha: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(fecha);
  const hoy = enBogota(new Date());
  const sumarDias = (fecha: string, dias: number) => {
    const d = new Date(`${fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  const ayer = sumarDias(hoy, -1);

  let token = '';
  const negocios: string[] = [];
  let cierreAyer = '';
  let cierreHoy = '';

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

  const venta = (paymentMethod: string, unitPrice: number) =>
    como(
      http()
        .post('/api/v1/sales')
        .send({
          date: hoy,
          paymentMethod,
          items: [{ description: 'Pedido', quantity: 1, unitPrice }],
        }),
    ).expect(201);

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

    token = await registrar('Cuenta');
    // El datáfono se queda el 3 % de cada venta con tarjeta.
    await como(http().patch('/api/v1/business').send({ cardFeePercent: 3 })).expect(200);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: negocios } } });
    await app.close();
  });

  it('sin cierres todavía no se sabe cuánto hay en la cuenta', async () => {
    const resumen = await como(http().get('/api/v1/bank-account/summary')).expect(200);
    expect(resumen.body.lastClosing).toBeNull();
    expect(resumen.body.estimatedBalance).toBeNull();
  });

  it('el primer cierre es el punto de partida: no hay descuadre posible', async () => {
    const preview = await como(
      http().get(`/api/v1/bank-account/preview?date=${ayer}`),
    ).expect(200);
    expect(preview.body.isStartingPoint).toBe(true);

    const cierre = await como(
      http()
        .post('/api/v1/bank-account/closings')
        .send({ date: ayer, closingBalance: 1000000 }),
    ).expect(201);

    cierreAyer = cierre.body.id;
    expect(cierre.body.openingBalance).toBeNull();
    expect(cierre.body.expectedBalance).toBe('1000000');
    expect(cierre.body.difference).toBe('0');
  });

  it('la venta con tarjeta guarda lo que se queda el datáfono', async () => {
    const conTarjeta = await venta('CARD', 100000);
    expect(conTarjeta.body.cardFee).toBe('3000');

    const enEfectivo = await venta('CASH', 20000);
    expect(enEfectivo.body.cardFee).toBe('0');
  });

  it('el saldo esperado solo cuenta lo que pasa por la cuenta', async () => {
    await venta('TRANSFER', 50000);

    for (const [paymentMethod, amount] of [
      ['TRANSFER', 10000],
      ['CASH', 5000],
    ] as const) {
      await como(
        http()
          .post('/api/v1/expenses')
          .send({ date: hoy, description: 'Servicios', amount, paymentMethod }),
      ).expect(201);
    }

    const deuda = await como(
      http()
        .post('/api/v1/purchases/opening-balance')
        .send({ date: hoy, supplierName: 'Proveedor', amount: 100000 }),
    ).expect(201);
    await como(
      http()
        .post(`/api/v1/purchases/${deuda.body.id}/payments`)
        .send({ date: hoy, amount: 30000, paymentMethod: 'TRANSFER' }),
    ).expect(201);

    for (const [type, amount] of [
      ['CASH_DEPOSIT', 200000],
      ['CASH_WITHDRAWAL', 40000],
      ['OTHER_OUT', 15000],
    ] as const) {
      await como(
        http().post('/api/v1/bank-account/movements').send({ date: hoy, type, amount }),
      ).expect(201);
    }

    const preview = await como(
      http().get(`/api/v1/bank-account/preview?date=${hoy}`),
    ).expect(200);
    const m = preview.body.movements;

    expect(preview.body.isStartingPoint).toBe(false);
    expect(preview.body.openingBalance).toBe('1000000.00');
    expect(m.transferSales).toBe('50000.00');
    expect(m.cardSales).toBe('100000.00');
    expect(m.cardFees).toBe('3000.00');
    expect(m.expenses).toBe('10000.00');
    expect(m.supplierPayments).toBe('30000.00');
    expect(m.cashDeposits).toBe('200000.00');
    expect(m.cashWithdrawals).toBe('40000.00');
    expect(m.otherOut).toBe('15000.00');
    // 50.000 + 97.000 + 200.000 − 10.000 − 30.000 − 40.000 − 15.000
    expect(m.net).toBe('252000.00');
    expect(preview.body.expectedBalance).toBe('1252000.00');

    const resumen = await como(http().get('/api/v1/bank-account/summary')).expect(200);
    expect(resumen.body.estimatedBalance).toBe('1252000.00');
  });

  it('el cierre compara el saldo del banco con el esperado', async () => {
    const cierre = await como(
      http()
        .post('/api/v1/bank-account/closings')
        .send({ date: hoy, closingBalance: 1250000, notes: 'Cuota de manejo' }),
    ).expect(201);

    cierreHoy = cierre.body.id;
    expect(cierre.body.openingBalance).toBe('1000000');
    expect(cierre.body.expectedBalance).toBe('1252000');
    expect(cierre.body.difference).toBe('-2000');
  });

  it('los cierres van en orden y solo se toca el último', async () => {
    const repetido = await como(
      http().post('/api/v1/bank-account/closings').send({ date: hoy, closingBalance: 1 }),
    ).expect(400);
    expect(repetido.body.message).toMatch(/ya tiene cierre/i);

    const anterior = await como(
      http()
        .post('/api/v1/bank-account/closings')
        .send({ date: sumarDias(hoy, -3), closingBalance: 1 }),
    ).expect(400);
    expect(anterior.body.message).toMatch(/posterior/i);

    const futuro = await como(
      http()
        .post('/api/v1/bank-account/closings')
        .send({ date: sumarDias(hoy, 1), closingBalance: 1 }),
    ).expect(400);
    expect(futuro.body.message).toMatch(/todavía no llega/i);

    const borrarViejo = await como(
      http().delete(`/api/v1/bank-account/closings/${cierreAyer}`),
    ).expect(400);
    expect(borrarViejo.body.message).toMatch(/último/i);

    const corregido = await como(
      http()
        .patch(`/api/v1/bank-account/closings/${cierreHoy}`)
        .send({ closingBalance: 1252000 }),
    ).expect(200);
    expect(corregido.body.difference).toBe('0');
  });

  it('la caja descuenta lo consignado y suma lo que se sacó del banco', async () => {
    const caja = await como(
      http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=300000`),
    ).expect(200);

    expect(caja.body.cashSales).toBe('20000.00');
    expect(caja.body.cashExpenses).toBe('5000.00');
    expect(caja.body.depositedToAccount).toBe('200000.00');
    expect(caja.body.withdrawnFromAccount).toBe('40000.00');
    // 300.000 + 20.000 − 5.000 − 200.000 + 40.000
    expect(caja.body.expectedCash).toBe('155000.00');
  });

  it('la comisión del datáfono resta en la utilidad y no cambia si cambia el %', async () => {
    const conta = () =>
      como(http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`)).expect(200);

    const antes = await conta();
    // 170.000 de ventas sin costo − 15.000 de gastos − 3.000 del datáfono
    expect(antes.body.cardFees).toBe('3000.00');
    expect(antes.body.netProfit).toBe('152000.00');

    const tablero = await como(
      http().get(`/api/v1/dashboard/summary?from=${hoy}&to=${hoy}`),
    ).expect(200);
    expect(tablero.body.profit).toBe('152000.00');

    await como(http().patch('/api/v1/business').send({ cardFeePercent: 5 })).expect(200);
    const despues = await conta();
    expect(despues.body.cardFees).toBe('3000.00');
  });

  it('otro negocio no ve la cuenta de este', async () => {
    const otro = await registrar('Ajeno');

    const resumen = await como(http().get('/api/v1/bank-account/summary'), otro).expect(200);
    expect(resumen.body.lastClosing).toBeNull();

    await como(http().get(`/api/v1/bank-account/closings/${cierreHoy}`), otro).expect(404);
    const movimientos = await como(http().get('/api/v1/bank-account/movements'), otro).expect(
      200,
    );
    expect(movimientos.body).toEqual([]);
  });

  it('el último cierre sí se puede borrar', async () => {
    await como(http().delete(`/api/v1/bank-account/closings/${cierreHoy}`)).expect(200);
    const resumen = await como(http().get('/api/v1/bank-account/summary')).expect(200);
    expect(resumen.body.lastClosing.date).toBe(ayer);
  });
});
