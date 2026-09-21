import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type { CashClosing, CashPreview } from '@/shared/api/types';

export interface CashClosingPayload {
  date: string;
  openingCash: number;
  closingCash: number;
  notes?: string;
}

export function useCashClosings(rango: { from: string; to: string }) {
  return useQuery({
    queryKey: ['cash', 'closings', rango],
    queryFn: () => api.get<CashClosing[]>('/cash-closings', rango),
  });
}

/** Ventas y gastos en efectivo del dia elegido, para cuadrar la caja. */
export function useCashPreview(date: string, openingCash: number | '') {
  return useQuery({
    queryKey: ['cash', 'preview', date, openingCash],
    queryFn: () =>
      api.get<CashPreview>('/cash-closings/preview', {
        date,
        openingCash: openingCash === '' ? undefined : openingCash,
      }),
    enabled: Boolean(date),
    // Sin esto la pantalla parpadea cada vez que cambia la apertura.
    placeholderData: (anterior) => anterior,
  });
}

/** Detalle del cierre que ya existe ese dia, para poder corregirlo. */
export function useCashClosing(id: string | null) {
  return useQuery({
    queryKey: ['cash', 'closing', id],
    queryFn: () => api.get<CashClosing>(`/cash-closings/${id}`),
    enabled: Boolean(id),
  });
}

/** El cierre resume el efectivo del dia: al tocarlo cambia tambien el resumen. */
function useInvalidarCaja() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['cash'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateCashClosing() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: (datos: CashClosingPayload) =>
      api.post<CashClosing>('/cash-closings', datos),
    onSuccess: invalidar,
  });
}

export function useUpdateCashClosing() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: Partial<CashClosingPayload> }) =>
      api.patch<CashClosing>(`/cash-closings/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteCashClosing() {
  const invalidar = useInvalidarCaja();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/cash-closings/${id}`),
    onSuccess: invalidar,
  });
}
