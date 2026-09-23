import { ClipboardList, Truck } from 'lucide-react';

/** Compras (lo que ya llegó) y pedidos (lo que se le pide al proveedor). */
export const PESTANAS_COMPRAS = [
  { to: '/compras', label: 'Compras', icon: Truck },
  { to: '/compras/pedidos', label: 'Pedidos', icon: ClipboardList },
];
