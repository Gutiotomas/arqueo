import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type { Paginated, PaymentMethod, Sale } from '@/shared/api/types';

export interface SaleFilters {
  from?: string;
  to?: string;
  paymentMethod?: PaymentMethod | '';
  search?: string;
  page: number;
  limit: number;
}

export interface SalePayload {
  date: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  items: {
    productId?: string;
    description?: string;
    quantity: number;
    unitPrice: number;
  }[];
}

export function useSales(filtros: SaleFilters) {
  return useQuery({
    queryKey: ['sales', filtros],
    queryFn: () => api.get<Paginated<Sale>>('/sales', { ...filtros }),
  });
}

/** Tras tocar una venta cambian tambien el stock y el dashboard. */
function useInvalidarVentas() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['sales'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
    cliente.invalidateQueries({ queryKey: ['products'] });
    cliente.invalidateQueries({ queryKey: ['cash'] });
    cliente.invalidateQueries({ queryKey: ['account'] });
  };
}

export function useCreateSale() {
  const invalidar = useInvalidarVentas();
  return useMutation({
    mutationFn: (datos: SalePayload) => api.post<Sale>('/sales', datos),
    onSuccess: invalidar,
  });
}

export function useUpdateSale() {
  const invalidar = useInvalidarVentas();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: SalePayload }) =>
      api.put<Sale>(`/sales/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteSale() {
  const invalidar = useInvalidarVentas();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/sales/${id}`),
    onSuccess: invalidar,
  });
}
