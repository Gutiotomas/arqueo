import { FileText, Truck } from 'lucide-react';

/** Las dos clases de informe comparten cabecera: el del negocio y el de proveedor. */
export const PESTANAS_INFORMES = [
  { to: '/informes', label: 'Del negocio', icon: FileText },
  { to: '/informes/proveedores', label: 'Por proveedor', icon: Truck },
];
