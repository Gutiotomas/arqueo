import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * La prueba que sostiene todo el modelo multi-empresa: la empresa A no puede
 * ver, tocar ni adivinar nada de la empresa B. Si esto se rompe, se rompe el
 * producto entero.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Aislamiento entre empresas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sufijo = Date.now();
  /**
   * El dia del negocio, no el de UTC: a las 7 de la tarde en Bogota ya es
   * manana en UTC, y el dashboard (que usa la zona del negocio) no mostraria
   * una venta fechada en el futuro.
   */
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const empresaA = {
    businessName: `Empresa A ${sufijo}`,
    name: 'Dueno A',
    email: `a-${sufijo}@arqueo.test`,
    password: 'claveSegura1',
  };
  const empresaB = {
    businessName: `Empresa B ${sufijo}`,
    name: 'Dueno B',
    email: `b-${sufijo}@arqueo.test`,
    password: 'claveSegura2',
  };

  let tokenA = '';
  let tokenB = '';
  let businessIdA = '';
  let businessIdB = '';
  let productoDeB = '';
  let ventaDeB = '';

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

    const registroA = await http().post('/api/v1/auth/register').send(empresaA);
    tokenA = registroA.body.accessToken;
    businessIdA = registroA.body.user.business.id;

    const registroB = await http().post('/api/v1/auth/register').send(empresaB);
    tokenB = registroB.body.accessToken;
    businessIdB = registroB.body.user.business.id;

    // La empresa B se monta su inventario y vende algo.
    const producto = await http()
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Producto secreto de B', salePrice: 10000, costPrice: 6000, stock: 10 });
    productoDeB = producto.body.id;

    const venta = await http()
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        date: hoy,
        paymentMethod: 'CASH',
        items: [{ productId: productoDeB, quantity: 2, unitPrice: 10000 }],
      });
    ventaDeB = venta.body.id;
  });

  afterAll(async () => {
    // Borrar el negocio arrastra en cascada todo lo que creo la prueba.
    await prisma.business.deleteMany({
      where: { id: { in: [businessIdA, businessIdB] } },
    });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const comoA = (peticion: request.Test) =>
    peticion.set('Authorization', `Bearer ${tokenA}`);

  it('sin token no se entra a ningun sitio', async () => {
    await http().get('/api/v1/products').expect(401);
    await http().get('/api/v1/sales').expect(401);
    await http().get('/api/v1/dashboard/summary').expect(401);
  });

  it('A no ve los productos de B en el listado', async () => {
    const respuesta = await comoA(http().get('/api/v1/products')).expect(200);
    expect(respuesta.body.data).toHaveLength(0);
    expect(respuesta.body.meta.total).toBe(0);
  });

  it('A no puede abrir un producto de B ni conociendo su id', async () => {
    await comoA(http().get(`/api/v1/products/${productoDeB}`)).expect(404);
  });

  it('A no puede editar ni borrar un producto de B', async () => {
    await comoA(
      http().patch(`/api/v1/products/${productoDeB}`).send({ name: 'Secuestrado' }),
    ).expect(404);
    await comoA(http().delete(`/api/v1/products/${productoDeB}`)).expect(404);

    const producto = await prisma.product.findUniqueOrThrow({
      where: { id: productoDeB },
    });
    expect(producto.name).toBe('Producto secreto de B');
    expect(producto.isActive).toBe(true);
  });

  it('A no puede mover el stock de un producto de B', async () => {
    await comoA(
      http().post(`/api/v1/products/${productoDeB}/stock-in`).send({ quantity: 100 }),
    ).expect(404);

    const producto = await prisma.product.findUniqueOrThrow({
      where: { id: productoDeB },
    });
    expect(Number(producto.stock)).toBe(8); // 10 iniciales - 2 vendidas
  });

  it('A no puede colar un producto de B dentro de una venta suya', async () => {
    const respuesta = await comoA(
      http()
        .post('/api/v1/sales')
        .send({
          date: hoy,
          paymentMethod: 'CASH',
          items: [{ productId: productoDeB, quantity: 1, unitPrice: 10000 }],
        }),
    ).expect(400);

    expect(respuesta.body.message).toMatch(/no existe o no pertenece/i);
  });

  it('A no ve ni puede borrar las ventas de B', async () => {
    const listado = await comoA(http().get('/api/v1/sales')).expect(200);
    expect(listado.body.data).toHaveLength(0);

    await comoA(http().get(`/api/v1/sales/${ventaDeB}`)).expect(404);
    await comoA(http().delete(`/api/v1/sales/${ventaDeB}`)).expect(404);

    expect(await prisma.sale.count({ where: { id: ventaDeB } })).toBe(1);
  });

  it('los numeros del dashboard de A no incluyen nada de B', async () => {
    const respuesta = await comoA(http().get('/api/v1/dashboard/summary')).expect(200);
    expect(respuesta.body.sales).toBe('0.00');
    expect(respuesta.body.salesCount).toBe(0);
  });

  it('el informe de A sale vacio aunque B tenga movimiento', async () => {
    const respuesta = await comoA(
      http().get('/api/v1/reports/preview?period=month'),
    ).expect(200);

    expect(respuesta.body.business.name).toBe(empresaA.businessName);
    expect(respuesta.body.kpis.sales).toBe('0.00');
    expect(respuesta.body.sales).toHaveLength(0);
  });

  it('B sigue viendo lo suyo intacto', async () => {
    const respuesta = await http()
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(respuesta.body.sales).toBe('20000.00');
    expect(respuesta.body.salesCount).toBe(1);
  });

  it('no se puede registrar dos veces el mismo correo', async () => {
    await http().post('/api/v1/auth/register').send(empresaA).expect(409);
  });

  it('un token manipulado no sirve', async () => {
    await http()
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${tokenA}modificado`)
      .expect(401);
  });
});
