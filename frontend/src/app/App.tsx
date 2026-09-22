import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AppLayout } from './AppLayout';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import {
  PantallaDespertando,
  useEsperaLarga,
} from '@/shared/ui/despertando';

// Cada pantalla viaja en su propio trozo: quien entra a ver las ventas no
// descarga la libreria de graficas del dashboard.
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
);
const SalesPage = lazy(() =>
  import('@/features/sales/SalesPage').then((m) => ({ default: m.SalesPage })),
);
const ExpensesPage = lazy(() =>
  import('@/features/expenses/ExpensesPage').then((m) => ({
    default: m.ExpensesPage,
  })),
);
const InventoryPage = lazy(() =>
  import('@/features/inventory/InventoryPage').then((m) => ({
    default: m.InventoryPage,
  })),
);
const PurchasesPage = lazy(() =>
  import('@/features/purchases/PurchasesPage').then((m) => ({
    default: m.PurchasesPage,
  })),
);
const LossesPage = lazy(() =>
  import('@/features/losses/LossesPage').then((m) => ({ default: m.LossesPage })),
);
const AccountingPage = lazy(() =>
  import('@/features/accounting/AccountingPage').then((m) => ({
    default: m.AccountingPage,
  })),
);
const CashPage = lazy(() =>
  import('@/features/cash/CashPage').then((m) => ({ default: m.CashPage })),
);
const AccountPage = lazy(() =>
  import('@/features/cash/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const SupplierReportPage = lazy(() =>
  import('@/features/reports/SupplierReportPage').then((m) => ({
    default: m.SupplierReportPage,
  })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({
    default: m.ReportsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos de un negocio no cambian cada segundo: un minuto de cache
      // evita parpadeos al navegar entre pantallas.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Cargando() {
  return <PantallaDespertando segundos={null} />;
}

function RutaPrivada({ children }: { children: React.ReactNode }) {
  const { user, cargando } = useAuth();
  // Si comprobar la sesión se alarga, es que el servidor estaba dormido.
  const espera = useEsperaLarga(cargando);

  if (cargando) return <PantallaDespertando segundos={espera} />;

  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<Cargando />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/registro" element={<RegisterPage />} />

              <Route
                element={
                  <RutaPrivada>
                    <AppLayout />
                  </RutaPrivada>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="/ventas" element={<SalesPage />} />
                <Route path="/gastos" element={<ExpensesPage />} />
                <Route path="/inventario" element={<InventoryPage />} />
                <Route path="/compras" element={<PurchasesPage />} />
                <Route path="/perdidas" element={<LossesPage />} />
                <Route path="/contabilidad" element={<AccountingPage />} />
                <Route path="/caja" element={<CashPage />} />
                <Route path="/caja/cuenta" element={<AccountPage />} />
                <Route path="/informes" element={<ReportsPage />} />
                <Route path="/informes/proveedores" element={<SupplierReportPage />} />
                <Route path="/ajustes" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
