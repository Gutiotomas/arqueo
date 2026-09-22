import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Estado de cuenta de un proveedor, con números a mano.
 *
 *   hace 10 días  compra A: 30.000, abona 10.000, vence hace 2 días
 *   hace 5 días   deuda anterior: 50.000
 *   ayer          abono a la compra A: 5.000
 *   hoy           compra B: 20.000, pagada entera
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Informe por proveedor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufijo = Date.now();
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const hace = (dias: number) => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
  };
  const ddmmaaaa = (iso: string) => iso.split('-').reverse().join('-');

  let token = '';
  const negocios: string[] = [];
  let proveedorId = '';

  const http = () => request(app.getHttpServer());
  const como = (peticion: request.Test, conToken = token) =>
    peticion.set('Authorization', `Bearer ${conToken}`);
  const informe = (consulta: string, conToken = token) =>
    como(http().get(`/api/v1/reports/supplier/preview?supplierId=${proveedorId}${consulta}`), conToken);

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

    token = await registrar('Proveedores');

    const producto = await como(
      http().post('/api/v1/products').send({ name: 'Arroz', salePrice: 5000, stock: 0 }),
    ).expect(201);
    const productId = producto.body.id;
    const proveedor = { supplierName: 'Distribución Ñandú' };

    const compraA = await como(
      http()
        .post('/api/v1/purchases')
        .send({
          ...proveedor,
          date: hace(10),
          dueDate: hace(2),
          invoiceNumber: 'FV-1',
          items: [{ productId, quantity: 10, unitCost: 3000 }],
          initialPayment: { date: hace(10), amount: 10000, paymentMethod: 'TRANSFER' },
        }),
    ).expect(201);
    proveedorId = compraA.body.supplier.id;

    await como(
      http()
        .post('/api/v1/purchases/opening-balance')
        .send({ supplierId: proveedorId, date: hace(5), amount: 50000 }),
    ).expect(201);

    await como(
      http()
        .post(`/api/v1/purchases/${compraA.body.id}/payments`)
        .send({ date: hace(1), amount: 5000, paymentMethod: 'CASH' }),
    ).expect(201);

    await como(
      http()
        .post('/api/v1/purchases')
        .send({
          supplierId: proveedorId,
          date: hoy,
          items: [{ productId, quantity: 5, unitCost: 4000 }],
          initialPayment: { date: hoy, amount: 20000, paymentMethod: 'CASH' },
        }),
    ).expect(201);

    // Una compra a otro proveedor no debe colarse en el informe.
    await como(
      http()
        .post('/api/v1/purchases')
        .send({
          supplierName: 'Otro proveedor',
          date: hoy,
          items: [{ productId, quantity: 1, unitCost: 99999 }],
        }),
    ).expect(201);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: negocios } } });
    await app.close();
  });

  it('todo el historial: lo comprado, lo abonado y lo que se debe hoy', async () => {
    const { body } = await informe('').expect(200);

    expect(body.supplier.name).toBe('Distribución Ñandú');
    expect(body.period.allTime).toBe(true);
    expect(body.summary).toMatchObject({
      openingBalance: '0.00',
      purchased: '100000.00',
      paid: '35000.00',
      closingBalance: '65000.00',
      // A: 30.000 − 15.000; deuda anterior: 50.000; B: pagada
      currentBalance: '65000.00',
      overdue: '15000.00',
      purchasesCount: 3,
      paymentsCount: 3,
    });

    expect(body.purchases.map((c: { detail: string }) => c.detail)).toEqual([
      'FV-1 · Arroz',
      'Deuda anterior',
      'Arroz',
    ]);
    expect(body.payments.map((a: { purchase: string }) => a.purchase)).toEqual([
      `Compra del ${hace(10).split('-').reverse().join('/')} · FV-1`,
      `Compra del ${hace(10).split('-').reverse().join('/')} · FV-1`,
      `Compra del ${hoy.split('-').reverse().join('/')}`,
    ]);

    // Lo vencido primero.
    expect(body.pending).toHaveLength(2);
    expect(body.pending[0]).toMatchObject({ balance: '15000.00', daysOverdue: 2 });
    expect(body.pending[1]).toMatchObject({ balance: '50000.00', daysOverdue: 0 });
  });

  it('con fechas, parte de lo que ya se debía al empezar', async () => {
    const { body } = await informe(`&from=${hace(5)}&to=${hoy}`).expect(200);

    expect(body.period.allTime).toBe(false);
    expect(body.summary).toMatchObject({
      // Antes del periodo: compra A (30.000) menos su primer abono (10.000)
      openingBalance: '20000.00',
      purchased: '70000.00',
      paid: '25000.00',
      closingBalance: '65000.00',
      purchasesCount: 2,
      paymentsCount: 2,
    });

    const antes = await informe(`&from=${hace(10)}&to=${hace(6)}`).expect(200);
    expect(antes.body.summary).toMatchObject({
      openingBalance: '0.00',
      purchased: '30000.00',
      paid: '10000.00',
      closingBalance: '20000.00',
    });
  });

  it('descarga el PDF y el Excel con el nombre del proveedor', async () => {
    const pdf = await como(
      http()
        .get(`/api/v1/reports/supplier/pdf?supplierId=${proveedorId}`)
        .buffer(true)
        .parse((res, callback) => {
          const trozos: Buffer[] = [];
          res.on('data', (trozo: Buffer) => trozos.push(trozo));
          res.on('end', () => callback(null, Buffer.concat(trozos)));
        }),
    ).expect(200);

    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe(
      `attachment; filename="arqueo-proveedor-distribucion-nandu-${ddmmaaaa(hoy)}.pdf"`,
    );
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const excel = await como(
      http().get(`/api/v1/reports/supplier/xlsx?supplierId=${proveedorId}&from=${hace(5)}&to=${hoy}`),
    ).expect(200);
    expect(excel.headers['content-disposition']).toBe(
      `attachment; filename="arqueo-proveedor-distribucion-nandu-${ddmmaaaa(hace(5))}-a-${ddmmaaaa(hoy)}.xlsx"`,
    );
  });

  it('valida las fechas y no deja ver proveedores de otro negocio', async () => {
    const alReves = await informe(`&from=${hoy}&to=${hace(3)}`).expect(400);
    expect(alReves.body.message).toMatch(/posterior/i);

    const otro = await registrar('Curioso');
    await informe('', otro).expect(404);
  });
});
