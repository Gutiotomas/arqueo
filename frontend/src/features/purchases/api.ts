import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type {
  Paginated,
  PaymentMethod,
  Purchase,
  PurchaseStatus,
  Supplier,
  SupplierDebt,
} from '@/shared/api/types';

/** 'unpaid' no es un estado guardado: agrupa todo lo que aún se debe. */
export type PurchaseStatusFilter = PurchaseStatus | 'unpaid';

export interface PurchaseFilters {
  from?: string;
  to?: string;
  supplierId?: string;
  status?: PurchaseStatusFilter | '';
  page: number;
  limit: number;
}

/** El listado de compras resume tres importes, no solo el total. */
export interface PurchaseList extends Omit<Paginated<Purchase>, 'summary'> {
  summary?: { total: string; paid: string; balance: string };
}

export interface PaymentPayload {
  date: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface PurchasePayload {
  date: string;
  /** Proveedor que ya existe... */
  supplierId?: string;
  /** ...o uno nuevo, que el API da de alta sobre la marcha. */
  supplierName?: string;
  invoiceNumber?: string;
  dueDate?: string;
  notes?: string;
  items: { productId: string; quantity: number; unitCost: number }[];
  /** Lo que se paga en el momento; sin esto la compra queda a deber entera. */
  initialPayment?: PaymentPayload;
}

export function usePurchases(filtros: PurchaseFilters) {
  return useQuery({
    queryKey: ['purchases', 'lista', filtros],
    queryFn: () => api.get<PurchaseList>('/purchases', { ...filtros }),
  });
}

/** Lo que se debe a proveedores, sin filtrar por fechas. */
export function useSupplierDebt() {
  return useQuery({
    queryKey: ['purchases', 'deuda'],
    queryFn: () => api.get<SupplierDebt>('/purchases/debt'),
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.get<Supplier[]>('/suppliers'),
  });
}

/**
 * Comprar mercancía no es un gasto, pero mueve casi todo lo demás: entra stock,
 * cambia el costo de lo vendido y un abono en efectivo sale de la caja del día.
 */
function useInvalidarCompras() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['purchases'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
    cliente.invalidateQueries({ queryKey: ['accounting'] });
    cliente.invalidateQueries({ queryKey: ['products'] });
    cliente.invalidateQueries({ queryKey: ['cash'] });
    cliente.invalidateQueries({ queryKey: ['suppliers'] });
  };
}

export function useCreatePurchase() {
  const invalidar = useInvalidarCompras();
  return useMutation({
    mutationFn: (datos: PurchasePayload) => api.post<Purchase>('/purchases', datos),
    onSuccess: invalidar,
  });
}

export function useDeletePurchase() {
  const invalidar = useInvalidarCompras();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/purchases/${id}`),
    onSuccess: invalidar,
  });
}

export function useAddPayment() {
  const invalidar = useInvalidarCompras();
  return useMutation({
    mutationFn: ({ purchaseId, datos }: { purchaseId: string; datos: PaymentPayload }) =>
      api.post<Purchase>(`/purchases/${purchaseId}/payments`, datos),
    onSuccess: invalidar,
  });
}

export function useDeletePayment() {
  const invalidar = useInvalidarCompras();
  return useMutation({
    mutationFn: ({ purchaseId, paymentId }: { purchaseId: string; paymentId: string }) =>
      api.delete<{ message: string }>(`/purchases/${purchaseId}/payments/${paymentId}`),
    onSuccess: invalidar,
  });
}

export function useCreateSupplier() {
  const invalidar = useInvalidarCompras();
  return useMutation({
    mutationFn: (datos: { name: string; phone?: string; notes?: string }) =>
      api.post<Supplier>('/suppliers', datos),
    onSuccess: invalidar,
  });
}
