import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type {
  LossReason,
  LossResolution,
  LossSummary,
  Paginated,
  PaymentMethod,
  Product,
  StockLoss,
  Supplier,
} from '@/shared/api/types';

export interface LossFilters {
  from: string;
  to: string;
  productId?: string;
  reason?: LossReason | '';
  resolution?: LossResolution | '';
  page: number;
  limit: number;
}

/** El listado, además del total, cuenta los casos sin respuesta del proveedor. */
export interface LossList extends Omit<Paginated<StockLoss>, 'summary'> {
  summary?: { total: string; pendingCount: number };
}

export interface LossPayload {
  productId: string;
  date: string;
  quantity: number;
  reason: LossReason;
  /** Sin esto el API lo guarda como PENDING: se asume lo peor. */
  resolution?: LossResolution;
  replacementUnitCost?: number;
  paymentMethod?: PaymentMethod;
  supplierId?: string;
  notes?: string;
}

/** Lo que se manda cuando el proveedor por fin contesta. */
export interface ResolveLossPayload {
  resolution: LossResolution;
  replacementUnitCost?: number;
  paymentMethod?: PaymentMethod;
  resolvedAt?: string;
  notes?: string;
}

/**
 * Lo que el negocio pierde de verdad. El API vuelve a calcularlo al guardar;
 * aquí sirve para enseñarlo en vivo mientras se rellena el formulario.
 */
export function calcularPerdida(
  resolution: LossResolution,
  cantidad: number,
  costoUnitario: number,
  costoReposicion: number,
): number {
  if (resolution === 'FREE') return 0;
  if (resolution === 'DISCOUNTED') return cantidad * costoReposicion;
  // Sin respuesta todavía se asume lo peor: se pierde toda la mercancía.
  return cantidad * costoUnitario;
}

export function useLosses(filtros: LossFilters) {
  return useQuery({
    queryKey: ['losses', 'lista', filtros],
    queryFn: () => api.get<LossList>('/losses', { ...filtros }),
  });
}

export function useLossSummary(rango: { from: string; to: string }) {
  return useQuery({
    queryKey: ['losses', 'resumen', rango],
    queryFn: () => api.get<LossSummary>('/losses/summary', { ...rango }),
  });
}

/** Catálogo para el desplegable de producto; solo se pide con el diálogo abierto. */
export function useProductosParaPerdida(enabled: boolean) {
  return useQuery({
    queryKey: ['products', 'para-perdida'],
    queryFn: () =>
      api.get<Paginated<Product>>('/products', { limit: 200, isActive: true }),
    enabled,
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<Supplier[]>('/suppliers'),
  });
}

/**
 * Una pérdida toca casi todo: sale mercancía del inventario, cambia el
 * resultado del periodo y una reposición pagada en efectivo mueve la caja
 * de ese día.
 */
function useInvalidarPerdidas() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['losses'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
    cliente.invalidateQueries({ queryKey: ['accounting'] });
    cliente.invalidateQueries({ queryKey: ['products'] });
    cliente.invalidateQueries({ queryKey: ['cash'] });
  };
}

export function useCreateLoss() {
  const invalidar = useInvalidarPerdidas();
  return useMutation({
    mutationFn: (datos: LossPayload) => api.post<StockLoss>('/losses', datos),
    onSuccess: invalidar,
  });
}

export function useResolveLoss() {
  const invalidar = useInvalidarPerdidas();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ResolveLossPayload }) =>
      api.patch<StockLoss>(`/losses/${id}/resolve`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteLoss() {
  const invalidar = useInvalidarPerdidas();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/losses/${id}`),
    onSuccess: invalidar,
  });
}
