import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Ajustes de inventario que van más allá de contar: dividir canastas y
 * corregir compras mal apuntadas.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Ajustes de inventario (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufijo = Date.now();
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  let token = '';
  let businessId = '';
  let canasta30 = '';
  let canasta15 = '';

  const http = () => request(app.getHttpServer());
  const como = (peticion: request.Test) =>
    peticion.set('Authorization', `Bearer ${token}`);

  async function producto(nombre: string, unit: string, costPrice: number, stock: number) {
    const r = await como(
      http().post('/api/v1/products').send({ name: nombre, unit, costPrice, stock, salePrice: 1 }),
    ).expect(201);
    return r.body.id as string;
  }
  async function estado(id: string) {
    const r = await como(http().get(`/api/v1/products/${id}`)).expect(200);
    return { stock: Number(r.body.stock), costo: Number(r.body.costPrice) };
  }
  async function compra(id: string, quantity: number, unitCost: number, extra = {}) {
    const r = await como(
      http()
        .post('/api/v1/purchases')
        .send({
          date: hoy,
          supplierName: 'Avícola de prueba',
          items: [{ productId: id, quantity, unitCost }],
          ...extra,
        }),
    ).expect(201);
    return r.body;
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

    const registro = await http()
      .post('/api/v1/auth/register')
      .send({
        businessName: `Inventario ${sufijo}`,
        name: 'Dueña',
        email: `inv-${sufijo}@arqueo.test`,
        password: 'claveSegura1',
      })
      .expect(201);
    token = registro.body.accessToken;
    businessId = registro.body.user.business.id;

    // 10 canastas de 30 huevos compradas a 12.000; ninguna de 15 (costo puesto a ojo).
    canasta30 = await producto('Huevos', '30 uds', 0, 0);
    canasta15 = await producto('Huevos', '15 uds', 7000, 0);
    await compra(canasta30, 10, 12000);
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await app.close();
  });

  it('dividir canastas pasa el stock y el costo al otro producto sin tocar la compra', async () => {
    const r = await como(
      http()
        .post(`/api/v1/products/${canasta30}/convert`)
        .send({ toProductId: canasta15, quantity: 2, resultingQuantity: 4 }),
    ).expect(201);

    expect(Number(r.body.from.stock)).toBe(8);
    expect(Number(r.body.to.stock)).toBe(4);
    // Dos canastas a 12.000 = 24.000, repartido en 4: cada una a 6.000.
    expect(await estado(canasta15)).toEqual({ stock: 4, costo: 6000 });
    expect(await estado(canasta30)).toEqual({ stock: 8, costo: 12000 });

    const compras = await como(http().get(`/api/v1/products/${canasta30}/purchases`)).expect(200);
    expect(compras.body).toHaveLength(1);
    expect(compras.body[0].quantity).toBe('10.000');
    expect(compras.body[0].total).toBe('120000.00');

    const movimientos = await como(
      http().get(`/api/v1/products/${canasta15}/movements`),
    ).expect(200);
    expect(movimientos.body.data[0].reason).toMatch(/Viene de 2 30 uds de Huevos/);
  });

  it('no se puede convertir más de lo que hay, ni al mismo producto', async () => {
    const deMas = await como(
      http()
        .post(`/api/v1/products/${canasta30}/convert`)
        .send({ toProductId: canasta15, quantity: 9, resultingQuantity: 18 }),
    ).expect(400);
    expect(deMas.body.message).toMatch(/Solo hay 8/);

    await como(
      http()
        .post(`/api/v1/products/${canasta30}/convert`)
        .send({ toProductId: canasta30, quantity: 1, resultingQuantity: 1 }),
    ).expect(400);
  });

  it('un ajuste ligado a una compra corrige la línea, el total y la deuda', async () => {
    const [ref] = (await como(http().get(`/api/v1/products/${canasta30}/purchases`))).body;

    // En realidad llegaron 9 canastas, no 10: quedan 7 en la estantería.
    await como(
      http()
        .post(`/api/v1/products/${canasta30}/adjust-stock`)
        .send({ stock: 7, purchaseId: ref.purchaseId }),
    ).expect(201);

    const corregida = await como(http().get(`/api/v1/purchases/${ref.purchaseId}`)).expect(200);
    expect(corregida.body.items[0].quantity).toBe('9');
    expect(corregida.body.total).toBe('108000');
    expect(corregida.body.balance).toBe('108000.00');
    // Restar no toca el costo.
    expect(await estado(canasta30)).toEqual({ stock: 7, costo: 12000 });

    const movimientos = await como(
      http().get(`/api/v1/products/${canasta30}/movements`),
    ).expect(200);
    expect(movimientos.body.data[0].reason).toMatch(/Corrección de la compra del/);
  });

  it('una entrada ligada a una compra la hace crecer y entra a su costo', async () => {
    const [ref] = (await como(http().get(`/api/v1/products/${canasta30}/purchases`))).body;

    await como(
      http()
        .post(`/api/v1/products/${canasta30}/stock-in`)
        .send({ quantity: 2, purchaseId: ref.purchaseId }),
    ).expect(201);

    const corregida = await como(http().get(`/api/v1/purchases/${ref.purchaseId}`)).expect(200);
    expect(corregida.body.items[0].quantity).toBe('11');
    expect(corregida.body.total).toBe('132000');
    expect(await estado(canasta30)).toEqual({ stock: 9, costo: 12000 });
  });

  it('un ajuste sin compra solo mueve el inventario', async () => {
    const [ref] = (await como(http().get(`/api/v1/products/${canasta30}/purchases`))).body;
    await como(
      http().post(`/api/v1/products/${canasta30}/adjust-stock`).send({ stock: 8 }),
    ).expect(201);

    const compra = await como(http().get(`/api/v1/purchases/${ref.purchaseId}`)).expect(200);
    expect(compra.body.total).toBe('132000');
    expect(await estado(canasta30)).toEqual({ stock: 8, costo: 12000 });
  });

  it('no deja la compra sin ese producto, por debajo de lo abonado, ni tocar una deuda anterior', async () => {
    const [ref] = (await como(http().get(`/api/v1/products/${canasta30}/purchases`))).body;

    // Una compra de una sola canasta de 15: bajar dos la dejaría en menos de cero.
    const otraCompra = await compra(canasta15, 1, 7000);
    const vacia = await como(
      http()
        .post(`/api/v1/products/${canasta15}/adjust-stock`)
        .send({ stock: 3, purchaseId: otraCompra.id }),
    ).expect(400);
    expect(vacia.body.message).toMatch(/borra la compra/i);

    // Abona 130.000 de 132.000: no se puede bajar la compra a 120.000.
    await como(
      http()
        .post(`/api/v1/purchases/${ref.purchaseId}/payments`)
        .send({ date: hoy, amount: 130000, paymentMethod: 'CASH' }),
    ).expect(201);
    const abonada = await como(
      http()
        .post(`/api/v1/products/${canasta30}/adjust-stock`)
        .send({ stock: 7, purchaseId: ref.purchaseId }),
    ).expect(400);
    expect(abonada.body.message).toMatch(/abono/i);

    const deuda = await como(
      http()
        .post('/api/v1/purchases/opening-balance')
        .send({ date: hoy, supplierName: 'Avícola de prueba', amount: 5000 }),
    ).expect(201);
    const anterior = await como(
      http()
        .post(`/api/v1/products/${canasta30}/adjust-stock`)
        .send({ stock: 7, purchaseId: deuda.body.id }),
    ).expect(400);
    expect(anterior.body.message).toMatch(/deuda anterior/i);

    const ajena = await como(
      http()
        .post(`/api/v1/products/${canasta30}/adjust-stock`)
        .send({ stock: 7, purchaseId: otraCompra.id }),
    ).expect(400);
    expect(ajena.body.message).toMatch(/no venía/i);

    // Nada de eso movió el stock.
    expect(await estado(canasta30)).toEqual({ stock: 8, costo: 12000 });
  });
});
