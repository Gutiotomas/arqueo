import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';

import { cn } from '@/shared/lib/cn';

/**
 * Pestañas bajo la cabecera de una página. Cada una es una ruta, así se puede
 * enlazar directamente a ella y el menú lateral sigue marcando la sección.
 */
export function PageTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { to: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <nav
      aria-label={label}
      className="flex gap-1 border-b border-slate-200 bg-white px-2 sm:px-4"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
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
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
