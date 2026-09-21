import { useQuery } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type { AccountingOverview, SupplierDebt } from '@/shared/api/types';

export function useAccounting(rango: { from: string; to: string }) {
  return useQuery({
    queryKey: ['accounting', 'overview', rango],
    queryFn: () => api.get<AccountingOverview>('/accounting/overview', rango),
  });
}

export function useDebt() {
  return useQuery({
    queryKey: ['purchases', 'debt'],
    queryFn: () => api.get<SupplierDebt>('/purchases/debt'),
  });
}
