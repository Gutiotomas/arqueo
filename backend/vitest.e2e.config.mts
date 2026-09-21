import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Las pruebas e2e hablan con la base de datos real: se ejecutan en serie para
// que no se pisen entre ellas.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
