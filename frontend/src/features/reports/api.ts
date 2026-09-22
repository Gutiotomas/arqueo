import { useQuery } from '@tanstack/react-query';

import { api, downloadFile } from '@/shared/api/client';
import type { ReportData, SupplierStatement } from '@/shared/api/types';

export type ReportPeriod = 'day' | 'week' | 'month';

/** O `period` + `date`, o un rango suelto con `from` y `to`. */
export interface ReportFilters {
  period?: ReportPeriod;
  date?: string;
  from?: string;
  to?: string;
}

export function useReportPreview(filtros: ReportFilters) {
  return useQuery({
    queryKey: ['reports', 'preview', filtros],
    queryFn: () => api.get<ReportData>('/reports/preview', { ...filtros }),
  });
}

export function downloadReport(
  formato: 'pdf' | 'xlsx',
  filtros: ReportFilters,
): Promise<void> {
  return downloadFile(
    `/reports/${formato}`,
    { ...filtros },
    `arqueo-informe.${formato}`,
  );
}

/** Sin fechas, el estado de cuenta cubre todo el historial con el proveedor. */
export interface SupplierReportFilters {
  supplierId: string;
  from?: string;
  to?: string;
}

export function useSupplierReport(filtros: SupplierReportFilters) {
  return useQuery({
    queryKey: ['reports', 'proveedor', filtros],
    queryFn: () =>
      api.get<SupplierStatement>('/reports/supplier/preview', { ...filtros }),
    enabled: Boolean(filtros.supplierId),
  });
}

export function downloadSupplierReport(
  formato: 'pdf' | 'xlsx',
  filtros: SupplierReportFilters,
): Promise<void> {
  return downloadFile(
    `/reports/supplier/${formato}`,
    { ...filtros },
    `arqueo-proveedor.${formato}`,
  );
}
