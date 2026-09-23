import {
  BarChart3,
  Boxes,
  Calculator,
  FileText,
  HandCoins,
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
import { Link, NavLink, Outlet, useLocation } from 'react-router';

import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

const NAVEGACION = [
  { to: '/', label: 'Dashboard', hint: 'Resumen y estadísticas', icon: LayoutDashboard, end: true },
  { to: '/ventas', label: 'Ventas', hint: 'Registro de ventas diarias', icon: BarChart3 },
  { to: '/gastos', label: 'Gastos', hint: 'Salidas de dinero', icon: Receipt },
  { to: '/inventario', label: 'Inventario', hint: 'Productos y stock', icon: Boxes },
  { to: '/compras', label: 'Compras', hint: 'Proveedores y deudas', icon: Truck },
  { to: '/fiados', label: 'Fiados', hint: 'Lo que te deben los clientes', icon: HandCoins },
  { to: '/perdidas', label: 'Pérdidas', hint: 'Mercancía dañada', icon: PackageX },
  { to: '/contabilidad', label: 'Contabilidad', hint: '¿Ganas o pierdes?', icon: Calculator },
  { to: '/caja', label: 'Caja y cuenta', hint: 'Cuadre del efectivo y el banco', icon: Wallet },
  { to: '/informes', label: 'Informes', hint: 'PDF y Excel', icon: FileText },
  { to: '/ajustes', label: 'Ajustes', hint: 'Datos del negocio', icon: Settings },
];

/**
 * Iniciales de una persona. En los nombres de aquí suelen ir dos nombres y
 * dos apellidos: "Sandra Bibiana Orrego Restrepo" es SO, no SB.
 */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  const apellido = partes.length >= 4 ? partes[2]! : partes[1]!;
  return (partes[0]!.charAt(0) + apellido.charAt(0)).toUpperCase();
}

/** La marca de siempre: "PORTAL" pequeño y "Arqueo" debajo. */
function Logo({ claro }: { claro?: boolean }) {
  return (
    <span className="block leading-tight">
      <span
        className={cn(
          'block text-[10px] tracking-[0.25em]',
          claro ? 'text-slate-400' : 'text-slate-500',
        )}
      >
        PORTAL
      </span>
      <span
        className={cn(
          'block text-xl font-bold',
          claro ? 'text-marca-600' : 'text-marca-300',
        )}
      >
        Arqueo
      </span>
    </span>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  const seccion =
    NAVEGACION.find((item) =>
      item.end ? pathname === item.to : pathname.startsWith(item.to),
    )?.label ?? '';

  return (
    <div className="min-h-screen bg-slate-50">
      {/*
        El usuario y la salida viven arriba, a la vista siempre. Así el menú
        lateral solo tiene secciones y le caben todas sin desplazarse.
      */}
      <header className="sticky top-0 z-30 flex h-16">
        <div className="hidden w-72 shrink-0 items-center bg-panel-900 px-6 lg:flex">
          <Link to="/" aria-label="Ir al dashboard">
            <Logo />
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 lg:hidden"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Link to="/" className="lg:hidden" aria-label="Ir al dashboard">
              <Logo claro />
            </Link>

            <nav
              aria-label="Ruta"
              className="hidden min-w-0 items-center gap-2 text-sm lg:flex"
            >
              <span className="truncate text-slate-500">
                {user?.business.name}
              </span>
              {seccion && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="truncate font-medium text-slate-900">
                    {seccion}
                  </span>
                </>
              )}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/ajustes"
              title={`${user?.name ?? ''} · ${user?.business.name ?? ''}`}
              aria-label="Tu cuenta y los datos del negocio"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-panel-900 text-sm font-semibold text-white transition-colors hover:bg-panel-800"
            >
              {iniciales(user?.name ?? '')}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="text-slate-500 hover:text-red-600"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      <div className="lg:flex">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-panel-900 text-slate-300 transition-transform',
            // En escritorio queda pegado bajo la barra superior, con la altura
            // justa de la pantalla. Sin el bloque de usuario, le caben todas
            // las secciones; el desplazamiento solo aparece en pantallas muy bajas.
            'lg:sticky lg:top-16 lg:bottom-auto lg:h-[calc(100vh-4rem)] lg:shrink-0 lg:translate-x-0',
            menuAbierto ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Cabecera del cajón, solo en móvil */}
          <div className="flex h-16 items-center justify-between px-6 lg:hidden">
            <Logo />
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:bg-white/10 hover:text-white"
              onClick={() => setMenuAbierto(false)}
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="scrollbar-oscuro min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
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
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
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
