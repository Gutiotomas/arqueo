import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/shared/api/client';
import type {
  Category,
  Paginated,
  Product,
  StockMovement,
} from '@/shared/api/types';

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  isActive?: boolean;
  page: number;
  limit: number;
}

/** `stock` solo viaja al crear; despues se mueve con entrada o ajuste. */
export interface ProductPayload {
  name: string;
  sku?: string;
  unit?: string;
  categoryId?: string | null;
  costPrice?: number;
  salePrice?: number;
  stock?: number;
  minStock?: number;
  isActive?: boolean;
}

export interface StockInPayload {
  quantity: number;
  unitCost?: number;
  reason?: string;
}

export interface AdjustStockPayload {
  stock: number;
  reason?: string;
}

/** El API archiva en lugar de borrar cuando el producto ya tiene historial. */
export interface DeleteProductResult {
  message: string;
  archived: boolean;
}

interface StockResult {
  product: Product;
  movement: StockMovement;
}

export function useProducts(filtros: ProductFilters) {
  return useQuery({
    queryKey: ['products', filtros],
    queryFn: () => api.get<Paginated<Product>>('/products', { ...filtros }),
  });
}

export function useProductMovements(
  productId: string | null,
  page: number,
  limit = 10,
) {
  return useQuery({
    queryKey: ['products', productId, 'movements', page, limit],
    queryFn: () =>
      api.get<Paginated<StockMovement>>(`/products/${productId}/movements`, {
        page,
        limit,
      }),
    enabled: !!productId,
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get<Category[]>('/product-categories'),
  });
}

/** Mover inventario cambia tambien los avisos de bajo mínimo del dashboard. */
function useInvalidarInventario() {
  const cliente = useQueryClient();
  return () => {
    cliente.invalidateQueries({ queryKey: ['products'] });
    cliente.invalidateQueries({ queryKey: ['dashboard'] });
    cliente.invalidateQueries({ queryKey: ['product-categories'] });
  };
}

export function useCreateProduct() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: (datos: ProductPayload) => api.post<Product>('/products', datos),
    onSuccess: invalidar,
  });
}

export function useUpdateProduct() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ProductPayload }) =>
      api.patch<Product>(`/products/${id}`, datos),
    onSuccess: invalidar,
  });
}

export function useDeleteProduct() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<DeleteProductResult>(`/products/${id}`),
    onSuccess: invalidar,
  });
}

export function useStockIn() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: StockInPayload }) =>
      api.post<StockResult>(`/products/${id}/stock-in`, datos),
    onSuccess: invalidar,
  });
}

export function useAdjustStock() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: AdjustStockPayload }) =>
      api.post<StockResult>(`/products/${id}/adjust-stock`, datos),
    onSuccess: invalidar,
  });
}

export function useCreateCategory() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<Category>('/product-categories', { name }),
    onSuccess: invalidar,
  });
}

export function useUpdateCategory() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Category>(`/product-categories/${id}`, { name }),
    onSuccess: invalidar,
  });
}

export function useDeleteCategory() {
  const invalidar = useInvalidarInventario();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/product-categories/${id}`),
    onSuccess: invalidar,
  });
}
