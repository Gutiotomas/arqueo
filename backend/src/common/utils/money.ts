import { Prisma } from '../../generated/prisma/client';

/**
 * Todo el dinero se maneja con Decimal (nunca con float): en pesos, un
 * redondeo mal hecho se nota en la caja al final del dia.
 *
 * Hacia el cliente los importes viajan como string ("1250000.00"): asi no se
 * pierde precision al serializar a JSON.
 */

export type DecimalLike = Prisma.Decimal | string | number;

export function toDecimal(value: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** Redondea a 2 decimales (half-up), que es como se cobra. */
export function money(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sumDecimals(values: DecimalLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (total, value) => total.plus(toDecimal(value)),
    new Prisma.Decimal(0),
  );
}

/** Cantidades de inventario: hasta 3 decimales (kg, litros...). */
export function quantity(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/** Para respuestas JSON. */
export function decimalToString(value: DecimalLike): string {
  return toDecimal(value).toFixed(2);
}

/** Para calculos en memoria (informes, porcentajes). */
export function decimalToNumber(value: DecimalLike): number {
  return toDecimal(value).toNumber();
}
