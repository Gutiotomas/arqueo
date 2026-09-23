import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type {
  Customer,
  CustomerAccount,
  CustomerDebt,
  Paginated,
  PaymentMethod,
  Sale,
} from '@/shared/api/types';

export interface SaleFilters {
  from?: string;
  to?: string;
  /** Ventas con alguna línea pagada así. */
  paymentMethod?: PaymentMethod | '';
  customerId?: string;
  search?: string;
  page: number;
  limit: number;
}

/** Una línea de la venta: un producto (o parte de él) y cómo se pagó. */
export interface SaleItemPayload {
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  paymentMethod: PaymentMethod;
  /** Al fiar, a quién: uno existente... */
  customerId?: string;
  /** ...o uno nuevo, que el API da de alta sobre la marcha. */
  customerName?: string;
}

export interface SalePayload {
  date: string;
  notes?: string;
  items: SaleItemPayload[];
}

/** Un cobro a un cliente que debe. */
export interface CustomerPaymentPayload {
  date: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export function useSales(filtros: SaleFilters) {
  return useQuery({
    queryKey: ['sales', filtros],
    queryFn: () => api.get<Paginated<Sale>>('/sales', { ...filtros }),
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
  });
}

/** Lo que deben los clientes, y quién. */
export function useCustomerDebt() {
  return useQuery({
    queryKey: ['customers', 'deuda'],
    queryFn: () => api.get<CustomerDebt>('/customers/debt'),
  });
}

/** El cuaderno de un cliente: fiado, cobrado y saldo. */
export function useCustomerAccount(id: string | null) {
  return useQuery({
    queryKey: ['customers', 'cuenta', id],
    queryFn: () => api.get<CustomerAccount>(`/customers/${id}/account`),
    enabled: Boolean(id),
  });
}

/**
 * Tras tocar una venta cambian también el stock, el dashboard y, si hay
 * líneas fiadas, el cuaderno de los clientes; con cada cobro, la caja y la
 * cuenta.
 */
function useInvalidarVentas() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['sales'] });
    cliente.invalidateQueries({ queryKey: ['customers'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
    cliente.invalidateQueries({ queryKey: ['accounting'] });
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

export function useAddCustomerPayment() {
  const invalidar = useInvalidarVentas();
  return useMutation({
    mutationFn: ({ customerId, datos }: { customerId: string; datos: CustomerPaymentPayload }) =>
      api.post<CustomerAccount>(`/customers/${customerId}/payments`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteCustomerPayment() {
  const invalidar = useInvalidarVentas();
  return useMutation({
    mutationFn: ({ customerId, paymentId }: { customerId: string; paymentId: string }) =>
      api.delete<CustomerAccount>(`/customers/${customerId}/payments/${paymentId}`),
    onSuccess: invalidar,
  });
}
