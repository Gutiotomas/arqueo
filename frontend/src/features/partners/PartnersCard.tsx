import { Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useState } from 'react';

import {
  useCreatePartner,
  useDeletePartner,
  usePartners,
  useUpdatePartner,
} from './api';
import { ApiError } from '@/shared/api/client';
import type { Partner } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { ErrorMessage, Loading } from '@/shared/ui/feedback';
import { Input } from '@/shared/ui/field';

/** Nombre y porcentaje, para añadir una socia o editar la que se toca. */
function FilaEditable({
  inicial,
  onGuardar,
  onCancelar,
  guardando,
}: {
  inicial: { name: string; sharePercent: number | '' };
  onGuardar: (datos: { name: string; sharePercent: number }) => void;
  onCancelar?: () => void;
  guardando: boolean;
}) {
  const [nombre, setNombre] = useState(inicial.name);
  const [porcentaje, setPorcentaje] = useState<number | ''>(inicial.sharePercent);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="min-w-0 flex-1"
        maxLength={120}
        placeholder="Nombre de la socia"
        aria-label="Nombre de la socia"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <div className="relative w-28">
        <Input
          type="number"
          min="0"
          max="100"
          step="any"
          inputMode="decimal"
          aria-label="Porcentaje"
          placeholder="0"
          className="pr-8 text-right tabular"
          value={porcentaje}
          onChange={(e) => setPorcentaje(e.target.value === '' ? '' : Number(e.target.value))}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
          %
        </span>
      </div>
      <Button
        size="icon"
        aria-label="Guardar socia"
        disabled={guardando || !nombre.trim()}
        onClick={() => onGuardar({ name: nombre.trim(), sharePercent: Number(porcentaje || 0) })}
      >
        {inicial.name ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </Button>
      {onCancelar && (
        <Button variant="ghost" size="icon" aria-label="Cancelar" onClick={onCancelar}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Las socias del negocio y su porcentaje de las ganancias. El porcentaje solo
 * propone cuánto le toca a cada una al repartir; lo que se lleva cada una se
 * puede ajustar en cada reparto.
 */
export function PartnersCard() {
  const socias = usePartners();
  const crear = useCreatePartner();
  const actualizar = useUpdatePartner();
  const borrar = useDeletePartner();
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const activas = (socias.data ?? []).filter((socia) => socia.isActive);
  const suma = activas.reduce((total, socia) => total + toNumber(socia.sharePercent), 0);

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    setAviso(null);
    try {
      await accion();
      return true;
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar');
      return false;
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-marca-600" />
            Socias
          </span>
        }
        description="Quiénes se reparten las ganancias y qué porcentaje le toca a cada una"
      />
      {socias.isLoading ? (
        <Loading rows={2} />
      ) : socias.isError ? (
        <ErrorMessage error={socias.error} onRetry={() => socias.refetch()} />
      ) : (
        <CardBody className="space-y-3">
          {(socias.data ?? []).length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {(socias.data ?? []).map((socia: Partner) => (
                <li key={socia.id} className="px-3 py-2.5">
                  {editando === socia.id ? (
                    <FilaEditable
                      inicial={{ name: socia.name, sharePercent: toNumber(socia.sharePercent) }}
                      guardando={actualizar.isPending}
                      onCancelar={() => setEditando(null)}
                      onGuardar={async (datos) => {
                        const ok = await ejecutar(() =>
                          actualizar.mutateAsync({ id: socia.id, datos: { ...datos, isActive: socia.isActive } }),
                        );
                        if (ok) setEditando(null);
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn('min-w-0 text-sm', !socia.isActive && 'text-slate-400')}>
                        <span className="font-medium text-slate-900">{socia.name}</span>
                        {!socia.isActive && ' · inactiva'}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="tabular mr-2 text-sm font-semibold text-slate-900">
                          {toNumber(socia.sharePercent)} %
                        </span>
                        {socia.isActive ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar a ${socia.name}`}
                              onClick={() => setEditando(socia.id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="dangerGhost"
                              size="icon"
                              aria-label={`Quitar a ${socia.name}`}
                              onClick={async () => {
                                setError(null);
                                try {
                                  const r = await borrar.mutateAsync(socia.id);
                                  setAviso(r.message);
                                } catch (fallo) {
                                  setError(fallo instanceof ApiError ? fallo.detalle : 'No se pudo quitar');
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              ejecutar(() =>
                                actualizar.mutateAsync({
                                  id: socia.id,
                                  datos: {
                                    name: socia.name,
                                    sharePercent: toNumber(socia.sharePercent),
                                    isActive: true,
                                  },
                                }),
                              )
                            }
                          >
                            Reactivar
                          </Button>
                        )}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {activas.length > 0 && (
            <p
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                Math.abs(suma - 100) < 0.005
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900',
              )}
            >
              {Math.abs(suma - 100) < 0.005
                ? 'Entre todas suman 100 %.'
                : `Entre todas suman ${suma} %. Lo normal es que sumen 100 %.`}
            </p>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">Añadir una socia</p>
            <FilaEditable
              // Se reinicia cuando cambia la lista: vacío y con el % que queda.
              key={`nueva-${activas.length}-${suma}`}
              inicial={{ name: '', sharePercent: activas.length ? Math.max(0, 100 - suma) : 100 }}
              guardando={crear.isPending}
              onGuardar={(datos) => ejecutar(() => crear.mutateAsync(datos))}
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {aviso && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{aviso}</p>}
        </CardBody>
      )}
    </Card>
  );
}
