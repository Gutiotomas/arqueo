import { useEffect, useState } from 'react';

import { useProductMovements } from './api';
import type { Product, StockMovement } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/dates';
import { toNumber } from '@/shared/lib/money';
import { cantidadConUnidad } from '@/shared/lib/unidades';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import {
  Badge,
  EmptyState,
  ErrorMessage,
  Loading,
  Pagination,
} from '@/shared/ui/feedback';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

const ETIQUETAS: Record<StockMovement['type'], string> = {
  IN: 'Entrada',
  OUT: 'Salida',
  ADJUSTMENT: 'Ajuste',
  LOSS: 'Pérdida',
  REPLACEMENT: 'Reposición',
};

const TONOS: Record<
  StockMovement['type'],
  'success' | 'info' | 'warning' | 'danger'
> = {
  IN: 'success',
  OUT: 'info',
  ADJUSTMENT: 'warning',
  LOSS: 'danger',
  REPLACEMENT: 'success',
};

/** '2026-09-19T14:05:00.000Z' -> '14:05' */
function formatHora(fecha: string): string {
  return new Date(fecha).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MovementsDialog({
  open,
  onOpenChange,
  producto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Product | null;
}) {
  const [pagina, setPagina] = useState(1);
  const movimientos = useProductMovements(
    open && producto ? producto.id : null,
    pagina,
  );

  // Cambiar de producto no debe heredar la pagina del anterior.
  useEffect(() => {
    if (open) setPagina(1);
  }, [open, producto]);

  const unidad = producto?.unit ?? 'ud';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Movimientos de stock"
      description={producto?.name}
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      }
    >
      {movimientos.isLoading ? (
        <Loading rows={5} />
      ) : movimientos.isError ? (
        <ErrorMessage
          error={movimientos.error}
          onRetry={() => movimientos.refetch()}
        />
      ) : !movimientos.data?.data.length ? (
        <EmptyState
          title="Este producto no tiene movimientos"
          message="Aquí verás cada entrada, cada venta y cada ajuste."
        />
      ) : (
        <div className="-mx-5 -my-4">
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th align="right">Cantidad</Th>
                <Th align="right">Queda</Th>
                <Th>Motivo</Th>
              </tr>
            </thead>
            <tbody>
              {movimientos.data.data.map((movimiento) => {
                const delta = toNumber(movimiento.delta);
                return (
                  <Tr key={movimiento.id}>
                    <Td className="whitespace-nowrap">
                      {formatDate(movimiento.createdAt)}
                      <span className="ml-1 text-xs text-slate-400">
                        {formatHora(movimiento.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={TONOS[movimiento.type]}>
                        {ETIQUETAS[movimiento.type]}
                      </Badge>
                    </Td>
                    <Td
                      align="right"
                      className={cn(
                        'font-medium whitespace-nowrap',
                        delta > 0
                          ? 'text-emerald-700'
                          : delta < 0
                            ? 'text-red-700'
                            : 'text-slate-500',
                      )}
                    >
                      {delta > 0 ? '+' : ''}
                      {cantidadConUnidad(delta, unidad)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-slate-900">
                      {cantidadConUnidad(movimiento.stockAfter, unidad)}
                    </Td>
                    <Td>
                      <span className="text-slate-600">
                        {movimiento.reason ?? '—'}
                      </span>
                      {movimiento.saleItem && (
                        <span className="ml-1 text-xs text-slate-400">
                          (por una venta)
                        </span>
                      )}
                      {movimiento.user && (
                        <span className="block text-xs text-slate-400">
                          {movimiento.user.name}
                        </span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>

          <Pagination
            page={movimientos.data.meta.page}
            totalPages={movimientos.data.meta.totalPages}
            total={movimientos.data.meta.total}
            onPageChange={setPagina}
          />
        </div>
      )}
    </Dialog>
  );
}
