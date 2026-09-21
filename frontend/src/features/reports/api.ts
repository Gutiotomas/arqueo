import { useQuery } from '@tanstack/react-query';

import { api, downloadFile } from '@/shared/api/client';
import type { ReportData } from '@/shared/api/types';

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
