import {
  BarChart3,
  Boxes,
  Calculator,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  PackageX,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

const NAVEGACION = [
  { to: '/', label: 'Dashboard', hint: 'Resumen y estadísticas', icon: LayoutDashboard, end: true },
  { to: '/ventas', label: 'Ventas', hint: 'Registro de ventas diarias', icon: BarChart3 },
  { to: '/gastos', label: 'Gastos', hint: 'Salidas de dinero', icon: Receipt },
  { to: '/inventario', label: 'Inventario', hint: 'Productos y stock', icon: Boxes },
  { to: '/compras', label: 'Compras', hint: 'Proveedores y deudas', icon: Truck },
  { to: '/perdidas', label: 'Pérdidas', hint: 'Mercancía dañada', icon: PackageX },
  { to: '/contabilidad', label: 'Contabilidad', hint: '¿Ganas o pierdes?', icon: Calculator },
  { to: '/caja', label: 'Cierre de caja', hint: 'Cuadre diario', icon: Wallet },
  { to: '/informes', label: 'Informes', hint: 'PDF y Excel', icon: FileText },
  { to: '/ajustes', label: 'Ajustes', hint: 'Datos del negocio', icon: Settings },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const iniciales = (user?.business.name ?? 'AR')
    .split(' ')
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="min-h-screen lg:flex">
      {/* Barra superior solo en movil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div>
          <p className="text-xs tracking-[0.2em] text-slate-400">PORTAL</p>
          <p className="text-lg font-bold text-marca-600">Arqueo</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-panel-900 text-slate-300 transition-transform lg:static lg:translate-x-0',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-5">
          <div>
            <p className="text-[11px] tracking-[0.25em] text-slate-500">PORTAL</p>
            <p className="text-2xl font-bold text-marca-300">Arqueo</p>
            <p className="mt-1 text-sm text-slate-400">
              Ventas, gastos e inventario
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAVEGACION.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                  isActive
                    ? 'bg-white/10 text-white shadow-[inset_3px_0_0_0_var(--color-marca-400)]'
                    : 'hover:bg-white/5 hover:text-white',
                )
              }
            >
              <item.icon className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-xs text-slate-400">{item.hint}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca-500 text-sm font-semibold text-white">
              {iniciales}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">
                {user?.business.name}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {user?.name}
              </span>
            </span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}

/** Cabecera comun de cada pagina. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
