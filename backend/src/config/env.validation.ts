import { z } from 'zod';

/**
 * Valida las variables de entorno al arrancar. Si falta algo, la app no
 * levanta: es preferible fallar en el despliegue que a medianoche.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  /**
   * Medio dia por defecto. No es por seguridad: es para que la primera
   * visita del dia caiga en la pantalla de login, que es donde se puede
   * explicar la espera mientras Render despierta el servidor.
   */
  JWT_EXPIRES_IN: z.string().default('12h'),
  /** Origenes permitidos por CORS, separados por comas. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SEED_DEMO: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  SEED_EMAIL: z.string().email().default('demo@arqueo.app'),
  SEED_PASSWORD: z.string().default('demo1234'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno invalidas:\n${detalle}`);
  }

  return result.data;
}
