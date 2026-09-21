import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prisma aplica las migraciones por orden alfabético del nombre de carpeta, y
 * ese nombre empieza por la fecha. Si una carpeta lleva la hora local y otra
 * la de UTC, el orden alfabético deja de ser el cronológico: en local no se
 * nota (las viejas ya están aplicadas), pero una base nueva revienta.
 *
 * Esto ya pasó en el primer despliegue. Estas pruebas lo impiden sin
 * necesidad de levantar una base de datos.
 */

const CARPETA = join(__dirname, 'migrations');

const migraciones = readdirSync(CARPETA, { withFileTypes: true })
  .filter((entrada) => entrada.isDirectory())
  .map((entrada) => entrada.name)
  .sort();

function sql(migracion: string): string {
  return readFileSync(join(CARPETA, migracion, 'migration.sql'), 'utf8');
}

describe('migraciones', () => {
  it('todas tienen nombre con fecha y su fichero SQL', () => {
    for (const migracion of migraciones) {
      expect(migracion).toMatch(/^\d{14}_[a-z0-9_]+$/);
      expect(existsSync(join(CARPETA, migracion, 'migration.sql'))).toBe(true);
    }
  });

  it('la inicial es la primera en aplicarse', () => {
    expect(migraciones[0]).toMatch(/_init$/);
  });

  it('ninguna toca una tabla que aún no existe en ese punto del orden', () => {
    const creadas = new Set<string>();

    for (const migracion of migraciones) {
      const contenido = sql(migracion);

      for (const [, tabla] of contenido.matchAll(/CREATE TABLE "([^"]+)"/g)) {
        creadas.add(tabla!);
      }

      for (const [, tabla] of contenido.matchAll(/ALTER TABLE "([^"]+)"/g)) {
        expect(
          creadas.has(tabla!),
          `${migracion} modifica "${tabla}" antes de que ninguna migración anterior la cree`,
        ).toBe(true);
      }
    }
  });
});
