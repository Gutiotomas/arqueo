import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type { Partner, PaymentMethod, ProfitDistribution } from '@/shared/api/types';

export interface PartnerPayload {
  name: string;
  sharePercent: number;
  isActive?: boolean;
}

export interface DistributionPayload {
  date: string;
  notes?: string;
  items: { partnerId: string; amount: number; paymentMethod: PaymentMethod }[];
}

export function usePartners() {
  return useQuery({
    queryKey: ['partners'],
    queryFn: () => api.get<Partner[]>('/partners'),
  });
}

export function useDistributions(rango: { from: string; to: string }) {
  return useQuery({
    queryKey: ['distributions', rango],
    queryFn: () => api.get<ProfitDistribution[]>('/profit-distributions', rango),
  });
}

/**
 * Un reparto no cambia la utilidad, pero sí lo que queda en el negocio y el
 * dinero de la caja y la cuenta del día.
 */
function useInvalidarSocias() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['partners'] });
    cliente.invalidateQueries({ queryKey: ['distributions'] });
    cliente.invalidateQueries({ queryKey: ['accounting'] });
    cliente.invalidateQueries({ queryKey: ['cash'] });
    cliente.invalidateQueries({ queryKey: ['account'] });
  };
}

export function useCreatePartner() {
  const invalidar = useInvalidarSocias();
  return useMutation({
    mutationFn: (datos: PartnerPayload) => api.post<Partner>('/partners', datos),
    onSuccess: invalidar,
  });
}

export function useUpdatePartner() {
  const invalidar = useInvalidarSocias();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: PartnerPayload }) =>
      api.patch<Partner>(`/partners/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useDeletePartner() {
  const invalidar = useInvalidarSocias();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/partners/${id}`),
    onSuccess: invalidar,
  });
}

export function useCreateDistribution() {
  const invalidar = useInvalidarSocias();
  return useMutation({
    mutationFn: (datos: DistributionPayload) =>
      api.post<ProfitDistribution>('/profit-distributions', datos),
    onSuccess: invalidar,
  });
}

export function useDeleteDistribution() {
  const invalidar = useInvalidarSocias();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/profit-distributions/${id}`),
    onSuccess: invalidar,
  });
}
