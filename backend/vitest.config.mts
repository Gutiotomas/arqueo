import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Vitest en lugar de Jest: los paquetes de Nest 12 son ESM y Jest solo los
// carga en Node 24+. SWC se encarga de los decoradores y de emitir los
// metadatos que necesita la inyeccion de dependencias.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.spec.ts', 'src/main.ts'],
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
