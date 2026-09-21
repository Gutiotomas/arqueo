import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: la URL de conexion vive aqui, ya no en schema.prisma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'npm run seed',
  },
});
