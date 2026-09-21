import { useQuery } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type {
  CategorySlice,
  DashboardSummary,
  DateRange,
  LossSummary,
  LowStockProduct,
  PaymentMethodSlice,
  TimeseriesPoint,
  TopProduct,
} from '@/shared/api/types';

type Rango = { from: string; to: string };

export function useSummary(rango: Rango) {
  return useQuery({
    queryKey: ['dashboard', 'summary', rango],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary', rango),
  });
}

export function useTimeseries(
  rango: Rango,
  granularity: 'day' | 'week' | 'month',
) {
  return useQuery({
    queryKey: ['dashboard', 'timeseries', rango, granularity],
    queryFn: () =>
      api.get<{ range: DateRange; data: TimeseriesPoint[] }>(
        '/dashboard/timeseries',
        { ...rango, granularity },
      ),
  });
}

export function useSalesByPaymentMethod(rango: Rango) {
  return useQuery({
    queryKey: ['dashboard', 'payment-methods', rango],
    queryFn: () =>
      api.get<{ data: PaymentMethodSlice[] }>(
        '/dashboard/sales-by-payment-method',
        rango,
      ),
  });
}

export function useExpensesByCategory(rango: Rango) {
  return useQuery({
    queryKey: ['dashboard', 'expense-categories', rango],
    queryFn: () =>
      api.get<{ data: CategorySlice[] }>(
        '/dashboard/expenses-by-category',
        rango,
      ),
  });
}

export function useTopProducts(rango: Rango) {
  return useQuery({
    queryKey: ['dashboard', 'top-products', rango],
    queryFn: () =>
      api.get<{ data: TopProduct[] }>('/dashboard/top-products', {
        ...rango,
        limit: 8,
      }),
  });
}

export function useLowStock() {
  return useQuery({
    queryKey: ['dashboard', 'low-stock'],
    queryFn: () => api.get<LowStockProduct[]>('/dashboard/low-stock'),
  });
}

/** Mercancía dañada: lo perdido y lo que sigue esperando respuesta. */
export function useLosses(rango: Rango) {
  return useQuery({
    queryKey: ['losses', 'summary', rango],
    queryFn: () => api.get<LossSummary>('/losses/summary', rango),
  });
}
