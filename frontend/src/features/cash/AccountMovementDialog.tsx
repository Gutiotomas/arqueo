import { useState } from 'react';

import { useCreateAccountMovement } from './account-api';
import { OPCIONES_MOVIMIENTO } from './movimientos';
import { ApiError } from '@/shared/api/client';
import type { AccountMovementType } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { today } from '@/shared/lib/dates';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput } from '@/shared/ui/field';

/**
 * Dinero que entra o sale de la cuenta sin ser venta, gasto ni abono: sobre
 * todo, llevar el efectivo de la caja al banco y al revés.
 */
export function AccountMovementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crear = useCreateAccountMovement();

  const [tipo, setTipo] = useState<AccountMovementType>('CASH_DEPOSIT');
  const [monto, setMonto] = useState<number | ''>('');
  const [fecha, setFecha] = useState(today());
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** Al cerrar se limpia, para que la próxima vez empiece en blanco. */
  function cerrar() {
    setTipo('CASH_DEPOSIT');
    setMonto('');
    setFecha(today());
    setDescripcion('');
    setError(null);
    onOpenChange(false);
  }

  async function guardar() {
    setError(null);

    if (Number(monto || 0) <= 0) {
      setError('Escribe el importe');
      return;
    }

    try {
      await crear.mutateAsync({
        date: fecha,
        type: tipo,
        amount: Number(monto),
        ...(descripcion.trim() ? { description: descripcion.trim() } : {}),
      });
      cerrar();
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar el movimiento',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => !abierto && cerrar()}
      title="Movimiento de la cuenta"
      description="Dinero que entra o sale de la cuenta sin ser venta, gasto ni abono."
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {OPCIONES_MOVIMIENTO.map((opcion) => (
            <button
              key={opcion.tipo}
              type="button"
              onClick={() => setTipo(opcion.tipo)}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left transition-colors',
                tipo === opcion.tipo
                  ? 'border-marca-500 bg-marca-50 text-marca-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className="block text-sm font-medium">{opcion.titulo}</span>
              <span className="block text-xs opacity-80">{opcion.pie}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Importe">
            <MoneyInput aria-label="Importe" value={monto} onValueChange={setMonto} />
          </Field>
          <Field label="Fecha">
            <Input
              type="date"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Descripción (opcional)">
          <Input
            maxLength={200}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Consignación en Bancolombia..."
          />
        </Field>

        <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          ¿El banco te cobró la cuota de manejo o el 4x1000? Regístralo en{' '}
          <strong>Gastos</strong> pagado por transferencia: así sale de la cuenta y
          también resta en la utilidad.
        </p>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>
    </Dialog>
  );
}
