import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type { Business } from '@/shared/api/types';

export interface BusinessPayload {
  name?: string;
  currency?: string;
  timezone?: string;
}

export interface PasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useBusiness() {
  return useQuery({
    queryKey: ['business'],
    queryFn: () => api.get<Business>('/business'),
  });
}

export function useUpdateBusiness() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: BusinessPayload) => api.patch<Business>('/business', datos),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['business'] });
      // La moneda y la zona horaria se usan al formatear todo lo demas.
      cliente.invalidateQueries({ queryKey: ['dashboard'] });
      cliente.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (datos: PasswordPayload) =>
      api.patch<{ message: string }>('/auth/password', datos),
  });
}
