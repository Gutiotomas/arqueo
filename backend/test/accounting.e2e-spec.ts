import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Las reglas de contabilidad, comprobadas con numeros a mano.
 *
 * La idea que se defiende aqui: comprar mercancia no empobrece al negocio
 * (cambia dinero por inventario), y el margen real solo aparece cuando esa
 * mercancia se vende.
 *
 * Necesita la base de datos levantada (./db.sh start).
 */
describe('Contabilidad y compras (e2e)', () => {
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
        businessName: `Contabilidad ${sufijo}`,
        name: 'Dueña',
        email: `conta-${sufijo}@arqueo.test`,
        password: 'claveSegura1',
      });
    token = registro.body.accessToken;
    businessId = registro.body.user.business.id;

    // Producto sin existencias: el costo saldra de las compras.
    const producto = await como(
      http().post('/api/v1/products').send({
        name: 'Arroz 500 g',
        salePrice: 5000,
        costPrice: 0,
        stock: 0,
      }),
    );
    productoId = producto.body.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await app.close();
  });

  it('comprar mercancía sube el stock y fija el costo, sin pagar nada', async () => {
    const compra = await como(
      http()
        .post('/api/v1/purchases')
        .send({
          date: hoy,
          supplierName: 'Distribuidora de prueba',
          items: [{ productId: productoId, quantity: 10, unitCost: 3000 }],
        }),
    ).expect(201);

    expect(compra.body.total).toBe('30000');
    expect(compra.body.balance).toBe('30000.00');
    expect(compra.body.status).toBe('pending');

    const producto = await como(http().get(`/api/v1/products/${productoId}`));
    expect(Number(producto.body.stock)).toBe(10);
    expect(Number(producto.body.costPrice)).toBe(3000);
  });

  it('una segunda compra más cara deja el costo en el promedio ponderado', async () => {
    await como(
      http()
        .post('/api/v1/purchases')
        .send({
          date: hoy,
          supplierName: 'Distribuidora de prueba',
          items: [{ productId: productoId, quantity: 10, unitCost: 4000 }],
        }),
    ).expect(201);

    // 10 a 3.000 + 10 a 4.000 = 20 unidades a 3.500
    const producto = await como(http().get(`/api/v1/products/${productoId}`));
    expect(Number(producto.body.stock)).toBe(20);
    expect(Number(producto.body.costPrice)).toBe(3500);
  });

  it('comprar no es un gasto: no toca el estado de resultados', async () => {
    const conta = await como(
      http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`),
    ).expect(200);

    expect(conta.body.operatingExpenses).toBe('0.00');
    expect(conta.body.cogs).toBe('0.00');
    // Las 70.000 compradas estan en el inventario, no en los gastos.
    expect(conta.body.purchases).toBe('70000.00');
    expect(Number(conta.body.inventoryValue)).toBe(70000);
    expect(Number(conta.body.supplierDebt)).toBe(70000);
  });

  it('la venta genera el costo de lo vendido y la utilidad bruta', async () => {
    await como(
      http()
        .post('/api/v1/sales')
        .send({
          date: hoy,
          paymentMethod: 'CASH',
          items: [{ productId: productoId, quantity: 4, unitPrice: 5000 }],
        }),
    ).expect(201);

    const conta = await como(
      http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`),
    ).expect(200);

    // 4 x 5.000 = 20.000 de venta; 4 x 3.500 = 14.000 de costo
    expect(conta.body.sales).toBe('20000.00');
    expect(conta.body.cogs).toBe('14000.00');
    expect(conta.body.grossProfit).toBe('6000.00');
    expect(conta.body.grossMargin).toBe(30);
    expect(conta.body.netProfit).toBe('6000.00');
    expect(conta.body.verdict).toBe('profit');

    // El inventario baja justo lo que se vendio: 16 unidades a 3.500
    expect(Number(conta.body.inventoryValue)).toBe(56000);
  });

  it('un gasto de operar sí resta en la utilidad neta', async () => {
    await como(
      http().post('/api/v1/expenses').send({
        date: hoy,
        description: 'Arriendo del local',
        amount: 10000,
        paymentMethod: 'TRANSFER',
      }),
    ).expect(201);

    const conta = await como(
      http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`),
    ).expect(200);

    expect(conta.body.grossProfit).toBe('6000.00');
    expect(conta.body.operatingExpenses).toBe('10000.00');
    expect(conta.body.netProfit).toBe('-4000.00');
    expect(conta.body.verdict).toBe('loss');
  });

  it('los abonos bajan la deuda y no pueden pasarse del saldo', async () => {
    const listado = await como(http().get('/api/v1/purchases?limit=50'));
    const compra = listado.body.data.find(
      (fila: { balance: string }) => Number(fila.balance) > 0,
    );

    const excesivo = await como(
      http()
        .post(`/api/v1/purchases/${compra.id}/payments`)
        .send({ date: hoy, amount: 999999, paymentMethod: 'CASH' }),
    ).expect(400);
    expect(excesivo.body.message).toMatch(/queda por pagar/i);

    const abonado = await como(
      http()
        .post(`/api/v1/purchases/${compra.id}/payments`)
        .send({ date: hoy, amount: 10000, paymentMethod: 'CASH' }),
    ).expect(201);

    expect(abonado.body.status).toBe('partial');
    expect(Number(abonado.body.balance)).toBe(Number(compra.balance) - 10000);

    const deuda = await como(http().get('/api/v1/purchases/debt')).expect(200);
    expect(Number(deuda.body.total)).toBe(60000);
  });

  it('el abono en efectivo también sale del cierre de caja', async () => {
    const caja = await como(
      http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`),
    ).expect(200);

    // 20.000 de venta en efectivo - 10.000 abonados al proveedor en efectivo
    expect(caja.body.cashSales).toBe('20000.00');
    expect(caja.body.cashSupplierPayments).toBe('10000.00');
    expect(caja.body.expectedCash).toBe('10000.00');
  });

  it('no se puede borrar una compra cuya mercancía ya se vendió', async () => {
    const listado = await como(http().get('/api/v1/purchases?limit=50'));
    const compra = listado.body.data[listado.body.data.length - 1];

    // Quedan 16 de 20: borrar una compra de 10 dejaria el stock en 6, asi que
    // la primera se puede borrar pero no las dos.
    await como(http().delete(`/api/v1/purchases/${compra.id}`)).expect(200);

    const otra = await como(http().get('/api/v1/purchases?limit=50'));
    const respuesta = await como(
      http().delete(`/api/v1/purchases/${otra.body.data[0].id}`),
    ).expect(400);
    expect(respuesta.body.message).toMatch(/ya se vendió/i);
  });

  /** Un producto aparte para cada prueba, sin arrastrar el stock de las demás. */
  async function productoNuevo(nombre: string, costPrice: number, stock: number) {
    const producto = await como(
      http().post('/api/v1/products').send({ name: nombre, salePrice: 9000, costPrice, stock }),
    ).expect(201);
    return producto.body.id as string;
  }

  async function costoYStock(id: string) {
    const producto = await como(http().get(`/api/v1/products/${id}`)).expect(200);
    return { costo: Number(producto.body.costPrice), stock: Number(producto.body.stock) };
  }

  it('borrar una compra mal apuntada devuelve el costo que tenía el producto', async () => {
    // Se crea con costo 2.500 y sin stock, como se recomienda antes de comprar.
    const id = await productoNuevo(`Aceite ${sufijo}`, 2500, 0);

    const compra = await como(
      http()
        .post('/api/v1/purchases')
        .send({
          date: hoy,
          supplierName: 'Distribuidora de prueba',
          // Error de dedo: 40.000 en vez de 4.000.
          items: [{ productId: id, quantity: 5, unitCost: 40000 }],
        }),
    ).expect(201);
    expect(await costoYStock(id)).toEqual({ costo: 40000, stock: 5 });

    await como(http().delete(`/api/v1/purchases/${compra.body.id}`)).expect(200);
    expect(await costoYStock(id)).toEqual({ costo: 2500, stock: 0 });
  });

  it('el mismo producto en dos líneas promedia bien y se deshace entero', async () => {
    const id = await productoNuevo(`Azúcar ${sufijo}`, 1000, 10);

    const compra = await como(
      http()
        .post('/api/v1/purchases')
        .send({
          date: hoy,
          supplierName: 'Distribuidora de prueba',
          items: [
            { productId: id, quantity: 5, unitCost: 2000 },
            { productId: id, quantity: 10, unitCost: 4000 },
          ],
        }),
    ).expect(201);

    // 10 a 1.000 + 5 a 2.000 + 10 a 4.000 = 25 a 2.400
    expect(await costoYStock(id)).toEqual({ costo: 2400, stock: 25 });

    await como(http().delete(`/api/v1/purchases/${compra.body.id}`)).expect(200);
    expect(await costoYStock(id)).toEqual({ costo: 1000, stock: 10 });
  });

  it('si entró otra compra después, el costo queda como si la borrada no existiera', async () => {
    const id = await productoNuevo(`Café ${sufijo}`, 1000, 10);
    const comprar = (quantity: number, unitCost: number) =>
      como(
        http()
          .post('/api/v1/purchases')
          .send({
            date: hoy,
            supplierName: 'Distribuidora de prueba',
            items: [{ productId: id, quantity, unitCost }],
          }),
      ).expect(201);

    const primera = await comprar(10, 3000); // 20 a 2.000
    await comprar(20, 4000); // 40 a 3.000

    await como(http().delete(`/api/v1/purchases/${primera.body.id}`)).expect(200);
    // Sin la primera: 10 a 1.000 + 20 a 4.000 = 30 a 3.000
    expect(await costoYStock(id)).toEqual({ costo: 3000, stock: 30 });
  });

  it('una deuda anterior suma a lo que se debe sin tocar inventario ni compras del periodo', async () => {
    const [deudaAntes, contaAntes] = await Promise.all([
      como(http().get('/api/v1/purchases/debt')),
      como(http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`)),
    ]);

    const sinProveedor = await como(
      http().post('/api/v1/purchases/opening-balance').send({ date: hoy, amount: 50000 }),
    ).expect(400);
    expect(sinProveedor.body.message).toMatch(/proveedor/i);

    const deuda = await como(
      http()
        .post('/api/v1/purchases/opening-balance')
        .send({ date: hoy, supplierName: 'Proveedor de antes', amount: 50000 }),
    ).expect(201);

    expect(deuda.body.isOpeningBalance).toBe(true);
    expect(deuda.body.items).toEqual([]);
    expect(deuda.body.balance).toBe('50000.00');
    expect(deuda.body.status).toBe('pending');

    const [deudaDespues, contaDespues] = await Promise.all([
      como(http().get('/api/v1/purchases/debt')),
      como(http().get(`/api/v1/accounting/overview?from=${hoy}&to=${hoy}`)),
    ]);

    expect(Number(deudaDespues.body.total)).toBe(Number(deudaAntes.body.total) + 50000);
    expect(Number(contaDespues.body.supplierDebt)).toBe(
      Number(contaAntes.body.supplierDebt) + 50000,
    );
    // Ni es mercancía comprada hoy ni cambia lo que hay en la estantería.
    expect(contaDespues.body.purchases).toBe(contaAntes.body.purchases);
    expect(contaDespues.body.inventoryValue).toBe(contaAntes.body.inventoryValue);
  });

  it('la deuda anterior se abona como cualquier compra y el efectivo sale de la caja', async () => {
    const cajaAntes = await como(
      http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`),
    );
    const listado = await como(http().get('/api/v1/purchases?limit=50'));
    const deuda = listado.body.data.find(
      (fila: { isOpeningBalance: boolean }) => fila.isOpeningBalance,
    );

    const abonada = await como(
      http()
        .post(`/api/v1/purchases/${deuda.id}/payments`)
        .send({ date: hoy, amount: 20000, paymentMethod: 'CASH' }),
    ).expect(201);
    expect(abonada.body.balance).toBe('30000.00');
    expect(abonada.body.status).toBe('partial');

    const cajaDespues = await como(
      http().get(`/api/v1/cash-closings/preview?date=${hoy}&openingCash=0`),
    );
    expect(Number(cajaDespues.body.cashSupplierPayments)).toBe(
      Number(cajaAntes.body.cashSupplierPayments) + 20000,
    );

    await como(http().delete(`/api/v1/purchases/${deuda.id}`)).expect(200);
  });
});
