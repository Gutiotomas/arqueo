import { Banknote, Landmark } from 'lucide-react';
import { NavLink } from 'react-router';

import { PageHeader } from '@/app/AppLayout';
import { cn } from '@/shared/lib/cn';

const PESTANAS = [
  { to: '/caja', label: 'Efectivo', icon: Banknote },
  { to: '/caja/cuenta', label: 'Cuenta', icon: Landmark },
];

/** La caja (efectivo) y la cuenta (transferencias y tarjeta) se cuadran aquí. */
export function CabeceraCierres() {
  return (
    <>
      <PageHeader
        title="Caja y cuenta"
        description="Cuadra el efectivo de la caja y el saldo del banco"
      />
      <nav
        aria-label="Qué cuadrar"
        className="flex gap-1 border-b border-slate-200 bg-white px-2 sm:px-4"
      >
        {PESTANAS.map((pestana) => (
          <NavLink
            key={pestana.to}
            to={pestana.to}
            end
            className={({ isActive }) =>
              cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-marca-600 text-marca-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800',
              )
            }
          >
            <pestana.icon className="h-4 w-4" />
            {pestana.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
