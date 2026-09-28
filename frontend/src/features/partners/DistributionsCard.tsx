import { Trash2, Users } from 'lucide-react';
import { useState } from 'react';

import { useDeleteDistribution, useDistributions } from './api';
import { DistributionDialog } from './DistributionDialog';
import { useAuth } from '@/features/auth/auth-context';
import { PAYMENT_METHOD_LABELS, type ProfitDistribution } from '@/shared/api/types';
import { formatDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card, CardHeader } from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/dialog';
import { EmptyState, ErrorMessage, Loading } from '@/shared/ui/feedback';

/** Los repartos de ganancias del periodo, con el botón para hacer uno nuevo. */
export function DistributionsCard({
  rango,
  queda,
  porSocia,
}: {
  rango: { from: string; to: string };
  /** Utilidad del periodo menos lo ya repartido. */
  queda: number;
  porSocia: { partnerId: string; name: string; amount: string }[];
}) {
  const { currency } = useAuth();
  const repartos = useDistributions(rango);
  const borrar = useDeleteDistribution();
  const [abierto, setAbierto] = useState(false);
  const [aBorrar, setABorrar] = useState<ProfitDistribution | null>(null);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-marca-600" />
            Reparto de ganancias
          </span>
        }
        description="Lo que se han llevado las socias en el periodo. No es gasto: sale de lo que el negocio ganó."
        action={
          <Button size="sm" onClick={() => setAbierto(true)}>
            Repartir ganancias
          </Button>
        }
      />

      {porSocia.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {porSocia.map((socia) => (
            <span
              key={socia.partnerId}
              className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
            >
              {socia.name}:{' '}
              <span className="tabular font-semibold text-slate-900">
                {formatMoney(socia.amount, currency)}
              </span>
            </span>
          ))}
        </div>
      )}

      {repartos.isLoading ? (
        <Loading rows={3} />
      ) : repartos.isError ? (
        <ErrorMessage error={repartos.error} onRetry={() => repartos.refetch()} />
      ) : !repartos.data?.length ? (
        <EmptyState
          title="No se han repartido ganancias en el periodo"
          message="Cuando las socias se repartan la ganancia, apúntalo aquí: no cambia la utilidad, pero sí lo que queda en el negocio."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {repartos.data.map((reparto) => (
            <li key={reparto.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
              <span className="min-w-0 text-sm">
                <span className="font-medium text-slate-900">{formatDate(reparto.date)}</span>
                {reparto.notes && <span className="text-slate-500"> · {reparto.notes}</span>}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {reparto.items
                    .map(
                      (item) =>
                        `${item.partner.name} ${formatMoney(item.amount, currency)} (${PAYMENT_METHOD_LABELS[item.paymentMethod].toLowerCase()})`,
                    )
                    .join(' · ')}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="tabular text-sm font-semibold text-slate-900">
                  {formatMoney(reparto.total, currency)}
                </span>
                <Button
                  variant="dangerGhost"
                  size="icon"
                  aria-label="Borrar reparto"
                  onClick={() => setABorrar(reparto)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <DistributionDialog open={abierto} onOpenChange={setAbierto} sugerido={queda} />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abrir) => !abrir && setABorrar(null)}
        title="Borrar este reparto"
        message="Deja de contar en lo repartido y, si fue en efectivo o por transferencia, en la caja o la cuenta de ese día."
        loading={borrar.isPending}
        onConfirm={async () => {
          if (!aBorrar) return;
          await borrar.mutateAsync(aBorrar.id);
          setABorrar(null);
        }}
      />
    </Card>
  );
}
