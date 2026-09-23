import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, downloadFile } from '@/shared/api/client';
import type { Paginated, PurchaseOrder } from '@/shared/api/types';

export interface OrderFilters {
  from?: string;
  to?: string;
  supplierId?: string;
  page: number;
  limit: number;
}

export interface OrderPayload {
  date: string;
  supplierId?: string;
  supplierName?: string;
  notes?: string;
  items: { productId?: string; description?: string; quantity: number; unitPrice: number }[];
}

export function useOrders(filtros: OrderFilters) {
  return useQuery({
    queryKey: ['purchase-orders', filtros],
    queryFn: () => api.get<Paginated<PurchaseOrder>>('/purchase-orders', { ...filtros }),
  });
}

function useInvalidarPedidos() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['purchase-orders'] });
    // Un pedido puede dar de alta un proveedor nuevo.
    cliente.invalidateQueries({ queryKey: ['suppliers'] });
  };
}

export function useCreateOrder() {
  const invalidar = useInvalidarPedidos();
  return useMutation({
    mutationFn: (datos: OrderPayload) => api.post<PurchaseOrder>('/purchase-orders', datos),
    onSuccess: invalidar,
  });
}

export function useUpdateOrder() {
  const invalidar = useInvalidarPedidos();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: OrderPayload }) =>
      api.put<PurchaseOrder>(`/purchase-orders/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteOrder() {
  const invalidar = useInvalidarPedidos();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/purchase-orders/${id}`),
    onSuccess: invalidar,
  });
}

export function downloadOrderPdf(pedido: PurchaseOrder): Promise<void> {
  return downloadFile(`/purchase-orders/${pedido.id}/pdf`, undefined, `arqueo-pedido-${pedido.number}.pdf`);
}
