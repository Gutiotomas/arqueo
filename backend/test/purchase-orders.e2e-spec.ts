import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Pedidos al proveedor: la cuenta a mano pasada a la app. No mueven el
 * inventario ni la deuda; solo dicen qué se necesita y cuánto cuesta.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Pedidos a proveedor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufijo = Date.now();
  let token = '';
  const negocios: string[] = [];
  let cuajadas = '';
  let pedidoId = '';

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

    token = await registrar('Pedidos');
    const producto = await como(
      http().post('/api/v1/products').send({ name: 'Cuajadas', unit: 'ud', costPrice: 6800, salePrice: 9000, stock: 3 }),
    ).expect(201);
    cuajadas = producto.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: negocios } } });
    await app.close();
  });

  it('un pedido mezcla productos del inventario y líneas libres, con total y número', async () => {
    const pedido = await como(
      http()
        .post('/api/v1/purchase-orders')
        .send({
          date: '2026-09-07',
          supplierName: 'Gustavo',
          items: [
            { productId: cuajadas, quantity: 6, unitPrice: 6800 },
            { description: 'Quesito hoja', quantity: 6, unitPrice: 10300 },
            { description: 'Suero', quantity: 4, unitPrice: 5500 },
          ],
          notes: 'Para el lunes',
        }),
    ).expect(201);

    pedidoId = pedido.body.id;
    expect(pedido.body.number).toBe(1);
    expect(pedido.body.supplier.name).toBe('Gustavo');
    expect(pedido.body.total).toBe('124600');
    expect(pedido.body.items.map((i: { description: string; subtotal: string }) => [i.description, i.subtotal])).toEqual([
      ['Cuajadas', '40800'],
      ['Quesito hoja', '61800'],
      ['Suero', '22000'],
    ]);

    // Pedir no es comprar: el inventario y la deuda siguen igual.
    const producto = await como(http().get(`/api/v1/products/${cuajadas}`)).expect(200);
    expect(Number(producto.body.stock)).toBe(3);
    const deuda = await como(http().get('/api/v1/purchases/debt')).expect(200);
    expect(deuda.body.total).toBe('0.00');

    const segundo = await como(
      http()
        .post('/api/v1/purchase-orders')
        .send({ date: '2026-09-08', items: [{ description: 'Yogur', quantity: 6, unitPrice: 8500 }] }),
    ).expect(201);
    expect(segundo.body.number).toBe(2);
    expect(segundo.body.supplier).toBeNull();
  });

  it('se puede corregir sin perder el número, y se descarga en PDF', async () => {
    const corregido = await como(
      http()
        .put(`/api/v1/purchase-orders/${pedidoId}`)
        .send({
          date: '2026-09-07',
          supplierName: 'Gustavo',
          items: [{ productId: cuajadas, quantity: 8, unitPrice: 6800 }],
        }),
    ).expect(200);
    expect(corregido.body.number).toBe(1);
    expect(corregido.body.total).toBe('54400');
    expect(corregido.body.items).toHaveLength(1);

    const pdf = await como(
      http()
        .get(`/api/v1/purchase-orders/${pedidoId}/pdf`)
        .buffer(true)
        .parse((res, callback) => {
          const trozos: Buffer[] = [];
          res.on('data', (trozo: Buffer) => trozos.push(trozo));
          res.on('end', () => callback(null, Buffer.concat(trozos)));
        }),
    ).expect(200);
    expect(pdf.headers['content-disposition']).toBe(
      'attachment; filename="arqueo-pedido-1-07-09-2026.pdf"',
    );
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('valida las líneas y aísla por negocio', async () => {
    const vacia = await como(
      http()
        .post('/api/v1/purchase-orders')
        .send({ date: '2026-09-07', items: [{ quantity: 1, unitPrice: 100 }] }),
    ).expect(400);
    expect(vacia.body.message).toMatch(/producto o una descripción/i);

    const otro = await registrar('Ajeno');
    await como(http().get(`/api/v1/purchase-orders/${pedidoId}`), otro).expect(404);
    const lista = await como(http().get('/api/v1/purchase-orders'), otro).expect(200);
    expect(lista.body.data).toEqual([]);

    const ajeno = await como(
      http()
        .post('/api/v1/purchase-orders')
        .send({ date: '2026-09-07', items: [{ productId: cuajadas, quantity: 1, unitPrice: 100 }] }),
      otro,
    ).expect(400);
    expect(ajeno.body.message).toMatch(/no existe o no pertenece/i);

    await como(http().delete(`/api/v1/purchase-orders/${pedidoId}`)).expect(200);
    await como(http().get(`/api/v1/purchase-orders/${pedidoId}`)).expect(404);
  });
});
