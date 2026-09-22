import type { AccountMovementType } from '@/shared/api/types';

/** Cómo se llama cada movimiento de la cuenta en la pantalla. */
export const ETIQUETA_MOVIMIENTO: Record<AccountMovementType, string> = {
  CASH_DEPOSIT: 'Consignación desde la caja',
  CASH_WITHDRAWAL: 'Retiro para la caja',
  OTHER_IN: 'Otro ingreso',
  OTHER_OUT: 'Otra salida',
};

/** Si el movimiento suma a la cuenta (true) o resta (false). */
export const SUMA_A_LA_CUENTA: Record<AccountMovementType, boolean> = {
  CASH_DEPOSIT: true,
  CASH_WITHDRAWAL: false,
  OTHER_IN: true,
  OTHER_OUT: false,
};

/** Las opciones del formulario, con lo que significa cada una. */
export const OPCIONES_MOVIMIENTO: {
  tipo: AccountMovementType;
  titulo: string;
  pie: string;
}[] = [
  {
    tipo: 'CASH_DEPOSIT',
    titulo: 'Consigné efectivo',
    pie: 'Sale de la caja y entra a la cuenta',
  },
  {
    tipo: 'CASH_WITHDRAWAL',
    titulo: 'Saqué para la caja',
    pie: 'Sale de la cuenta y entra a la caja',
  },
  {
    tipo: 'OTHER_IN',
    titulo: 'Otro ingreso',
    pie: 'Un aporte tuyo, un préstamo (no es venta)',
  },
  {
    tipo: 'OTHER_OUT',
    titulo: 'Otra salida',
    pie: 'Un retiro personal (no es gasto del negocio)',
  },
];
