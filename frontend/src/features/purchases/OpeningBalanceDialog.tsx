import { useState } from 'react';

import {
  useCreateOpeningBalance,
  useSuppliers,
  type OpeningBalancePayload,
} from './api';
import { ApiError } from '@/shared/api/client';
import { today } from '@/shared/lib/dates';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

/** Valor del desplegable de proveedor cuando se va a escribir uno nuevo. */
const PROVEEDOR_NUEVO = '__nuevo__';

/**
 * Lo que se le debía a un proveedor antes de empezar a usar Arqueo, por
 * mercancía que ya se vendió. Queda como deuda y se abona igual que una
 * compra, pero no mete nada al inventario.
 */
export function OpeningBalanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crear = useCreateOpeningBalance();
  const proveedores = useSuppliers();

  const [proveedorId, setProveedorId] = useState('');
  const [proveedorNuevo, setProveedorNuevo] = useState('');
  const [monto, setMonto] = useState<number | ''>('');
  const [fecha, setFecha] = useState(today());
  const [vencimiento, setVencimiento] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** Al cerrar se limpia, para que la próxima vez empiece en blanco. */
  function cerrar() {
    setProveedorId('');
    setProveedorNuevo('');
    setMonto('');
    setFecha(today());
    setVencimiento('');
    setNotas('');
    setError(null);
    onOpenChange(false);
  }

  async function guardar() {
    setError(null);

    if (!proveedorId || (proveedorId === PROVEEDOR_NUEVO && !proveedorNuevo.trim())) {
      setError('Elige o escribe el proveedor al que le debes');
      return;
    }
    if (Number(monto || 0) <= 0) {
      setError('Escribe cuánto le debes');
      return;
    }

    const datos: OpeningBalancePayload = {
      date: fecha,
      ...(proveedorId === PROVEEDOR_NUEVO
        ? { supplierName: proveedorNuevo.trim() }
        : { supplierId: proveedorId }),
      amount: Number(monto),
      ...(vencimiento ? { dueDate: vencimiento } : {}),
      ...(notas.trim() ? { notes: notas.trim() } : {}),
    };

    try {
      await crear.mutateAsync(datos);
      cerrar();
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar la deuda',
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => !abierto && cerrar()}
      title="Deuda anterior con un proveedor"
      description="Lo que ya le debías antes de usar Arqueo, por mercancía que ya vendiste."
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando...' : 'Guardar deuda'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-marca-50 px-3 py-2.5 text-sm text-marca-800">
          No entra nada al inventario ni cuenta como compra del mes: solo queda
          lo que debes, y lo vas abonando como cualquier compra. Si esa
          mercancía todavía la tienes en la estantería, regístrala mejor como{' '}
          <strong>Nueva compra</strong>.
        </p>

        <Field label="Proveedor">
          <Select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            aria-label="Proveedor"
          >
            <option value="">Elige un proveedor</option>
            {(proveedores.data ?? []).map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.name}
              </option>
            ))}
            <option value={PROVEEDOR_NUEVO}>+ Escribir uno nuevo</option>
          </Select>
          {proveedorId === PROVEEDOR_NUEVO && (
            <Input
              className="mt-2"
              autoFocus
              maxLength={120}
              placeholder="Nombre del proveedor"
              value={proveedorNuevo}
              onChange={(e) => setProveedorNuevo(e.target.value)}
            />
          )}
        </Field>

        <Field label="Cuánto le debes hoy">
          <MoneyInput aria-label="Deuda" value={monto} onValueChange={setMonto} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" hint="Normalmente, hoy.">
            <Input
              type="date"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          <Field
            label="Fecha de vencimiento (opcional)"
            hint="El día en que el proveedor espera cobrar."
          >
            <Input
              type="date"
              value={vencimiento}
              min={fecha}
              onChange={(e) => setVencimiento(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Saldo de las facturas de agosto..."
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
