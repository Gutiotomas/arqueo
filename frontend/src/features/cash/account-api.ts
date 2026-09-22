import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type {
  AccountClosing,
  AccountMovement,
  AccountMovementType,
  AccountPreview,
  AccountSummary,
} from '@/shared/api/types';

export interface AccountClosingPayload {
  date: string;
  closingBalance: number;
  notes?: string;
}

export interface AccountMovementPayload {
  date: string;
  type: AccountMovementType;
  amount: number;
  description?: string;
}

/** Cuánto hay en la cuenta hoy, según el último cierre. */
export function useAccountSummary() {
  return useQuery({
    queryKey: ['account', 'summary'],
    queryFn: () => api.get<AccountSummary>('/bank-account/summary'),
  });
}

export function useAccountPreview(date: string) {
  return useQuery({
    queryKey: ['account', 'preview', date],
    queryFn: () => api.get<AccountPreview>('/bank-account/preview', { date }),
    enabled: Boolean(date),
    placeholderData: (anterior) => anterior,
  });
}

export function useAccountClosing(id: string | null) {
  return useQuery({
    queryKey: ['account', 'closing', id],
    queryFn: () => api.get<AccountClosing>(`/bank-account/closings/${id}`),
    enabled: Boolean(id),
  });
}

export function useAccountClosings(rango: { from: string; to: string }) {
  return useQuery({
    queryKey: ['account', 'closings', rango],
    queryFn: () => api.get<AccountClosing[]>('/bank-account/closings', rango),
  });
}

export function useAccountMovements(rango: { from: string; to: string }) {
  return useQuery({
    queryKey: ['account', 'movements', rango],
    queryFn: () => api.get<AccountMovement[]>('/bank-account/movements', rango),
  });
}

/**
 * Consignar o sacar efectivo cambia la cuenta y también la caja del día,
 * así que se refrescan las dos.
 */
function useInvalidarCuenta() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['account'] });
    cliente.invalidateQueries({ queryKey: ['cash'] });
  };
}

export function useCreateAccountClosing() {
  const invalidar = useInvalidarCuenta();
  return useMutation({
    mutationFn: (datos: AccountClosingPayload) =>
      api.post<AccountClosing>('/bank-account/closings', datos),
    onSuccess: invalidar,
  });
}

export function useUpdateAccountClosing() {
  const invalidar = useInvalidarCuenta();
  return useMutation({
    mutationFn: ({
      id,
      datos,
    }: {
      id: string;
      datos: { closingBalance?: number; notes?: string };
    }) => api.patch<AccountClosing>(`/bank-account/closings/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteAccountClosing() {
  const invalidar = useInvalidarCuenta();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/bank-account/closings/${id}`),
    onSuccess: invalidar,
  });
}

export function useCreateAccountMovement() {
  const invalidar = useInvalidarCuenta();
  return useMutation({
    mutationFn: (datos: AccountMovementPayload) =>
      api.post<AccountMovement>('/bank-account/movements', datos),
    onSuccess: invalidar,
  });
}

export function useDeleteAccountMovement() {
  const invalidar = useInvalidarCuenta();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/bank-account/movements/${id}`),
    onSuccess: invalidar,
  });
}
