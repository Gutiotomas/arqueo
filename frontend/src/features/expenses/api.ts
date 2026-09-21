import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type {
  Category,
  Expense,
  Paginated,
  PaymentMethod,
} from '@/shared/api/types';

export interface ExpenseFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod | '';
  search?: string;
  page: number;
  limit: number;
}

export interface ExpensePayload {
  date: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  categoryId?: string | null;
  notes?: string;
}

export function useExpenses(filtros: ExpenseFilters) {
  return useQuery({
    queryKey: ['expenses', filtros],
    queryFn: () => api.get<Paginated<Expense>>('/expenses', { ...filtros }),
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get<Category[]>('/expense-categories'),
  });
}

/**
 * Tras tocar un gasto cambian también el dashboard, el contador de gastos de
 * su categoría y el cuadre de caja del día.
 */
function useInvalidarGastos() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['expenses'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
    cliente.invalidateQueries({ queryKey: ['expense-categories'] });
    cliente.invalidateQueries({ queryKey: ['cash'] });
  };
}

export function useCreateExpense() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    mutationFn: (datos: ExpensePayload) => api.post<Expense>('/expenses', datos),
    onSuccess: invalidar,
  });
}

export function useUpdateExpense() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ExpensePayload }) =>
      api.patch<Expense>(`/expenses/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteExpense() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/expenses/${id}`),
    onSuccess: invalidar,
  });
}

export function useCreateExpenseCategory() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    mutationFn: (name: string) => api.post<Category>('/expense-categories', { name }),
    onSuccess: invalidar,
  });
}

export function useRenameExpenseCategory() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Category>(`/expense-categories/${id}`, { name }),
    onSuccess: invalidar,
  });
}

export function useDeleteExpenseCategory() {
  const invalidar = useInvalidarGastos();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/expense-categories/${id}`),
    onSuccess: invalidar,
  });
}
