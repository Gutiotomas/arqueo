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
    expect(pedido.body.subtotal).toBe('124600');
    expect(pedido.body.discount).toBe('0');
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

  it('se puede corregir sin perder el número, lleva lo que el proveedor descuenta y se descarga en PDF', async () => {
    // El proveedor descuenta dos cuajadas malas de la vez pasada y una promoción.
    const corregido = await como(
      http()
        .put(`/api/v1/purchase-orders/${pedidoId}`)
        .send({
          date: '2026-09-07',
          supplierName: 'Gustavo',
          items: [
            { productId: cuajadas, quantity: 8, unitPrice: 6800 },
            { productId: cuajadas, quantity: 2, unitPrice: 6800, isDiscount: true },
            { description: 'Promoción del mes', quantity: 1, unitPrice: 1000, isDiscount: true },
          ],
        }),
    ).expect(200);
    expect(corregido.body.number).toBe(1);
    expect(corregido.body.subtotal).toBe('54400');
    expect(corregido.body.discount).toBe('14600');
    expect(corregido.body.total).toBe('39800');
    expect(corregido.body.items.map((i: { isDiscount: boolean; subtotal: string }) => [i.isDiscount, i.subtotal])).toEqual([
      [false, '54400'],
      [true, '13600'],
      [true, '1000'],
    ]);

    const deMas = await como(
      http()
        .put(`/api/v1/purchase-orders/${pedidoId}`)
        .send({
          date: '2026-09-07',
          items: [
            { productId: cuajadas, quantity: 8, unitPrice: 6800 },
            { description: 'Cruce', quantity: 1, unitPrice: 60000, isDiscount: true },
          ],
        }),
    ).expect(400);
    expect(deMas.body.message).toMatch(/descuenta/i);

    const soloDescuento = await como(
      http()
        .put(`/api/v1/purchase-orders/${pedidoId}`)
        .send({
          date: '2026-09-07',
          items: [{ description: 'Cruce', quantity: 1, unitPrice: 100, isDiscount: true }],
        }),
    ).expect(400);
    expect(soloDescuento.body.message).toMatch(/al menos una línea/i);

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

  it('registrar la compra desde el pedido lo marca como llegado y lo bloquea; borrar la compra lo reabre', async () => {
    const pedido = await como(
      http()
        .post('/api/v1/purchase-orders')
        .send({ date: '2026-09-10', supplierName: 'Gustavo', items: [{ productId: cuajadas, quantity: 4, unitPrice: 6800 }] }),
    ).expect(201);
    expect(pedido.body.status).toBe('PENDING');

    const compra = await como(
      http()
        .post('/api/v1/purchases')
        .send({
          date: '2026-09-12',
          supplierName: 'Gustavo',
          orderId: pedido.body.id,
          items: [{ productId: cuajadas, quantity: 4, unitCost: 6800 }],
        }),
    ).expect(201);

    const llegado = await como(http().get(`/api/v1/purchase-orders/${pedido.body.id}`)).expect(200);
    expect(llegado.body.status).toBe('RECEIVED');
    expect(llegado.body.receivedAt).toMatch(/^2026-09-12/);
    expect(llegado.body.purchase.id).toBe(compra.body.id);

    const editar = await como(
      http()
        .put(`/api/v1/purchase-orders/${pedido.body.id}`)
        .send({ date: '2026-09-10', items: [{ productId: cuajadas, quantity: 9, unitPrice: 6800 }] }),
    ).expect(400);
    expect(editar.body.message).toMatch(/ya llegó/i);
    const borrar = await como(http().delete(`/api/v1/purchase-orders/${pedido.body.id}`)).expect(400);
    expect(borrar.body.message).toMatch(/ya llegó/i);
    // La misma compra no puede "llegar" dos veces.
    const repetido = await como(
      http()
        .post('/api/v1/purchases')
        .send({ date: '2026-09-12', orderId: pedido.body.id, items: [{ productId: cuajadas, quantity: 1, unitCost: 6800 }] }),
    ).expect(400);
    expect(repetido.body.message).toMatch(/ya está marcado/i);

    // La única forma de que llegue es con su compra; sin ella, no hay "llegó" a mano.
    await como(http().patch(`/api/v1/purchase-orders/${pedido.body.id}/receive`)).expect(404);
    const pendientes = await como(http().get('/api/v1/purchase-orders?status=PENDING')).expect(200);
    expect(pendientes.body.data.map((p: { id: string }) => p.id)).not.toContain(pedido.body.id);

    // Borrar la compra lo devuelve solo a pendiente.
    await como(http().delete(`/api/v1/purchases/${compra.body.id}`)).expect(200);
    const reabierto = await como(http().get(`/api/v1/purchase-orders/${pedido.body.id}`)).expect(200);
    expect(reabierto.body.status).toBe('PENDING');
    expect(reabierto.body.purchase).toBeNull();
    const yaPendiente = await como(http().get('/api/v1/purchase-orders?status=PENDING')).expect(200);
    expect(yaPendiente.body.data.map((p: { id: string }) => p.id)).toContain(pedido.body.id);
  });
});
