# Arqueo

Ventas, gastos e inventario para negocios pequeños, con un dashboard que responde
a la única pregunta que importa: **¿cómo va el negocio?**

Nace para un solo negocio, pero la base de datos y la API son multi-empresa desde
el primer día: cada tabla lleva su `businessId` y toda consulta lo filtra, así que
abrirlo a más clientes no obliga a reescribir nada.

---

## Qué hace

| | |
|---|---|
| **Ventas** | Cada venta tiene líneas: pueden ser productos del inventario (descuentan stock) o conceptos libres (servicios, recargas, lo que no está catalogado). |
| **Gastos** | Con categorías, forma de pago y notas. |
| **Inventario** | Productos con costo promedio ponderado y precio de venta, stock mínimo, entradas de mercancía y ajustes por conteo físico. Cada movimiento queda registrado. |
| **Compras y deudas** | Las compras a proveedor entran al inventario (no son gasto) y pueden quedar a deber: se van pagando con abonos parciales y la app lleva el saldo por proveedor, con aviso de lo vencido. |
| **Pérdidas** | Mercancía dañada, vencida o robada. Sale del inventario siempre, pero lo que pierdes depende del proveedor: si la repone gratis no pierdes nada, si la repone cobrando pierdes solo eso, y si no la repone pierdes el costo entero. Los casos sin respuesta quedan marcados hasta que el proveedor conteste. |
| **Contabilidad** | Estado de resultados de verdad: ventas − costo de lo vendido = utilidad bruta; menos la mercancía perdida y los gastos de operar = utilidad neta. Con un veredicto claro de si el negocio gana o pierde, más el valor del inventario y la deuda pendiente. |
| **Cierre de caja** | Efectivo esperado = apertura + ventas en efectivo − gastos en efectivo − abonos a proveedores en efectivo. La app calcula el esperado y muestra el descuadre. |
| **Dashboard** | KPIs con variación frente al periodo anterior (ventas, utilidad bruta, gastos, utilidad neta), ingresos contra gastos día a día, reparto por forma de pago, gastos por categoría, productos más vendidos con su margen y avisos de stock bajo. |
| **Informes** | PDF y Excel del día, la semana, el mes o un rango libre. Ambos salen de la misma fuente de datos que el dashboard, así que nunca se contradicen. |

---

## Stack

**Backend:** NestJS 12 · Prisma 7 · PostgreSQL · JWT · Swagger · Vitest
**Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v4 · TanStack Query · Recharts
**Despliegue:** Render (API) · Vercel (web) · Clever Cloud (PostgreSQL)

Por qué NestJS y no Express pelado: los módulos, los guards y la inyección de
dependencias son justo lo que hace falta cuando lleguen los roles y permisos y el
alta de más empresas. Por qué React con Vite y no Next.js: todo va detrás de un
login, así que el SSR no aporta nada y sí añade una capa de servidor extra frente
a una API que ya existe.

---

## Arranque en local

Necesitas Node 22.12 o superior y PostgreSQL 17 (`brew install postgresql@17`).

```bash
# 1. Base de datos (el servidor NO queda arrancando con el Mac)
./db.sh start

# 2. API
cd backend
cp .env.example .env         # revisa DATABASE_URL
npm install
npm run prisma:migrate       # crea las tablas
npm run seed                 # datos de demostración: 60 días de movimiento
npm run start:dev            # http://localhost:3000/api/v1 · docs en /docs

# 3. Web
cd ../frontend
npm install
npm run dev                  # http://localhost:5173
```

Entra con **demo@arqueo.app** / **demo1234**.

El script `db.sh` levanta y para PostgreSQL a mano (`start`, `stop`, `status`,
`psql`, `logs`). Se hizo así a propósito, en vez de `brew services start`, para no
dejar un servidor corriendo en cada arranque del ordenador.

Para conectar DBeaver: `localhost:5432`, base `arqueo`, usuario `arqueo`,
contraseña `arqueo`.

---

## Variables de entorno

**backend/.env**

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Cadena de conexión de PostgreSQL. En producción, el `POSTGRESQL_ADDON_URI` de Clever Cloud. |
| `JWT_SECRET` | Firma de los tokens. En producción, algo largo y aleatorio. |
| `JWT_EXPIRES_IN` | Duración de la sesión (`12h` por defecto, ver abajo). |
| `PORT` | Puerto del API (3000). |
| `CORS_ORIGIN` | Orígenes permitidos, separados por comas. En producción, la URL de Vercel. |
| `SEED_DEMO` | Si es `true`, `npm run seed` crea el negocio de demostración. |

**frontend/.env**

| Variable | Para qué |
|---|---|
| `VITE_API_URL` | URL del API. **Vacía en local** (Vite hace de proxy a `localhost:3000`); en Vercel, la URL de Render, sin barra final. |

En local no necesitas crear `frontend/.env`: sin esa variable, las llamadas van
a `/api` y Vite las reenvía al backend. En Vercel la variable **no sale de
ningún fichero del repositorio**: se define en *Settings → Environment
Variables*. Y ojo con dos detalles de Vite: solo expone las variables que
empiezan por `VITE_`, y las incrusta al compilar, así que cambiarla exige
volver a desplegar. Como acaba dentro del JavaScript que descarga el
navegador, ahí nunca va un secreto.

La app valida las variables al arrancar: si falta alguna o es inválida, no levanta.
Es preferible enterarse en el despliegue que un martes por la tarde.

---

## Comandos

```bash
# backend
npm run start:dev       # desarrollo con recarga
npm run build           # genera el cliente de Prisma y compila
npm test                # pruebas unitarias
npm run test:e2e        # pruebas end to end (necesitan la BD levantada)
npm run typecheck       # comprobación de tipos
npm run prisma:migrate  # nueva migración en desarrollo
npm run prisma:deploy   # aplica migraciones (producción)
npm run prisma:studio   # explorador de la base de datos

# frontend
npm run dev             # servidor de desarrollo
npm run build           # compilación de producción
```

---

## La API

Prefijo `/api/v1`. Todo pide `Authorization: Bearer <token>` salvo el registro, el
login y `/health`. Documentación interactiva en `/docs`.

| Recurso | Endpoints |
|---|---|
| **auth** | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `PATCH /auth/password` |
| **business** | `GET /business` · `PATCH /business` |
| **products** | `GET /products` · `POST` · `GET /:id` · `PATCH /:id` · `DELETE /:id` · `POST /:id/stock-in` · `POST /:id/adjust-stock` · `GET /:id/movements` · `GET /products/low-stock` |
| **purchases** | `GET /purchases` · `POST` · `GET /:id` · `DELETE /:id` · `POST /:id/payments` · `DELETE /:id/payments/:paymentId` · `GET /purchases/debt` |
| **suppliers** | `GET` · `POST` · `PATCH /:id` · `DELETE /:id` |
| **losses** | `GET /losses` · `POST` · `GET /:id` · `PATCH /:id/resolve` · `DELETE /:id` · `GET /losses/summary` |
| **product-categories** | `GET` · `POST` · `PATCH /:id` · `DELETE /:id` |
| **sales** | `GET /sales` · `POST` · `GET /:id` · `PUT /:id` · `DELETE /:id` |
| **expenses** | `GET /expenses` · `POST` · `GET /:id` · `PATCH /:id` · `DELETE /:id` |
| **expense-categories** | `GET` · `POST` · `PATCH /:id` · `DELETE /:id` |
| **cash-closings** | `GET` · `GET /preview?date` · `POST` · `GET /:id` · `PATCH /:id` · `DELETE /:id` |
| **dashboard** | `GET /dashboard/summary` · `/timeseries` · `/sales-by-payment-method` · `/expenses-by-category` · `/top-products` · `/low-stock` |
| **accounting** | `GET /accounting/overview` · `GET /accounting/profit-and-loss` |
| **reports** | `GET /reports/preview` · `GET /reports/pdf` · `GET /reports/xlsx` (con `period=day\|week\|month&date=` o `from=&to=`) |
| **health** | `GET /health` |

Los listados devuelven `{ data, meta: { page, limit, total, totalPages } }` y, en
ventas y gastos, un `summary.total` con el total de todo el filtro (no solo de la
página).

---

## Decisiones que conviene conocer

**Los importes viajan como texto.** `"1250000.00"`, no `1250000`. En la base de
datos son `DECIMAL(14,2)` y en el servidor se manejan con `Decimal`, nunca con
números en coma flotante: en pesos, un redondeo mal hecho se nota al cuadrar la
caja. El frontend los convierte con `Number()` al pintarlos.

**Comprar mercancía no es un gasto.** Es la decisión que ordena toda la
contabilidad: cuando compras al proveedor, cambias dinero (o deuda) por
inventario, que sigue siendo tuyo. El gasto aparece cuando esa mercancía se
vende, y se llama costo de lo vendido. Por eso las compras (`Purchase`) viven
aparte de los gastos (`Expense`, que son arriendo, servicios, nómina) y por eso
el estado de resultados sale cuadrado sin hacer nada raro.

**El costo del producto es un promedio ponderado.** Si tienes 10 unidades a
3.000 y entran 10 a 4.000, el costo pasa a 3.500. Cada venta congela ese costo
en su línea, así que el margen de hace un mes no cambia porque el proveedor
haya subido los precios esta semana.

**Al proveedor se le puede ir pagando de a poco.** Una compra guarda su total y
lo abonado; cada abono es una salida de caja de verdad (y se descuenta en el
cierre de caja si fue en efectivo), mientras que la compra en sí no toca la
caja hasta que se paga.

**Lo que se daña no se pierde siempre.** Una caja rota sale del inventario, pero
el dinero solo se pierde si el proveedor no la repone. Por eso cada registro de
pérdida guarda qué hizo el proveedor —la repuso gratis, la repuso cobrando algo,
o no la repuso— y solo lo último se lleva el costo entero al estado de
resultados. Mientras no haya respuesta se asume lo peor, y se corrige cuando
llega. Lo perdido se valora **al costo**, nunca al precio de venta: lo que dejas
de ganar no es dinero que tuvieras.

**La sesión dura media jornada, y no es por seguridad.** En el plan gratuito de
Render el servidor se apaga tras 15 minutos sin uso y tarda cerca de un minuto
en despertar. Si la sesión siguiera viva al día siguiente, el dueño abriría la
aplicación, vería el dashboard de siempre, empezaría a registrar una venta y se
quedaría colgado sin entender por qué. Con `JWT_EXPIRES_IN=12h`, la primera
visita del día cae en la pantalla de login, que es donde esperar resulta
natural. Y por si la espera ocurre igualmente (la sesión aún vale pero el
servidor se durmió), la aplicación no deja un spinner mudo: a los 2,5 segundos
aparece **"Despertando el servidor"** con el motivo y los segundos que llevas.
Si prefieres que dure un día entero, es cambiar esa variable; si prefieres que
no haya espera, es el plan Starter de Render.

**El stock es un libro de movimientos.** `StockMovement` es la verdad;
`Product.stock` es una caché que se actualiza dentro de la misma transacción. La
suma de los movimientos de un producto siempre iguala su stock, y hay una prueba
que lo comprueba. Editar o borrar una venta devuelve el stock al inventario.

**Las fechas de negocio no tienen hora.** Una venta pertenece a un día, así que en
la base de datos son `DATE` y en el código se tratan como `'YYYY-MM-DD'` en UTC.
La zona horaria del negocio solo decide qué día es "hoy".

**Una cuenta por negocio, de momento.** El modelo ya admite varios usuarios y
tiene el campo `role`: cuando hagan falta permisos, se añade un `RolesGuard` sin
tocar el esquema.

**Se permite vender sin stock.** El inventario queda en negativo y la app avisa,
pero no bloquea: en una tienda la venta ya ocurrió, y el sistema tiene que
reflejar la realidad, no discutirla.

---

## Despliegue

### 1. Base de datos (Clever Cloud)

Crea un addon PostgreSQL y copia `POSTGRESQL_ADDON_URI`. Ojo: desde octubre de
2025 los planes DEV no incluyen copias de seguridad y solo admiten 5 conexiones
simultáneas (por eso el pool del API está limitado a 3). Para producción de
verdad, un plan de pago o un `pg_dump` programado.

### 2. API (Render)

Con el `render.yaml` de la raíz: **New → Blueprint**, apuntando al repositorio.
Luego rellena `DATABASE_URL` y `CORS_ORIGIN` en el panel. Las migraciones se
aplican solas en cada arranque.

En el plan gratuito el servicio se duerme tras 15 minutos sin uso y tarda cerca de
un minuto en despertar. El plan Starter lo evita.

### 3. Web (Vercel)

**Add New → Project**, con *Root Directory* = `frontend`. Framework: Vite. En
*Settings → Environment Variables* añade `VITE_API_URL` con la URL de Render
(por ejemplo `https://arqueo-api.onrender.com`, sin barra final) y vuelve a
desplegar: Vite incrusta esa variable al compilar. El `vercel.json` ya redirige
todas las rutas a `index.html` para que la navegación funcione al recargar.

Después, vuelve a Render y pon en `CORS_ORIGIN` la URL que te dé Vercel. Si
usas también los despliegues de vista previa de cada rama, añade esa URL a la
lista separada por comas: el navegador bloqueará cualquier origen que no esté
declarado.

---

## Pruebas

```bash
cd backend
npm test        # utilidades de fechas y dinero
npm run test:e2e   # aislamiento entre empresas, con base de datos real
```

Las e2e son las importantes. Una crea dos negocios y comprueba que uno no puede
ver, editar ni borrar nada del otro ni conociendo los identificadores: si eso se
rompe, se rompe el producto entero. La otra recorre el ciclo completo del dinero
con números a mano —comprar a crédito, promediar el costo, vender, abonar al
proveedor— y verifica que la utilidad y la caja cuadran.

---

## Lo que vendrá después

Roles y permisos con varios usuarios por negocio · alta de empresas desde la propia
web · clientes y ventas a crédito · adjuntar fotos de facturas · envío del informe
mensual por correo · varias sucursales.

---

## Licencia

MIT
