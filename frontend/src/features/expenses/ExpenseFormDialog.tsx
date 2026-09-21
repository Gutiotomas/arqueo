import { useEffect, useState } from 'react';

import {
  useCreateExpense,
  useExpenseCategories,
  useUpdateExpense,
  type ExpensePayload,
} from './api';
import { ApiError } from '@/shared/api/client';
import {
  PAYMENT_METHODS,
  type Expense,
  type PaymentMethod,
} from '@/shared/api/types';
import { today } from '@/shared/lib/dates';
import { toNumber } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/shared/ui/field';

export function ExpenseFormDialog({
  open,
  onOpenChange,
  gasto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto?: Expense | null;
}) {
  const crear = useCreateExpense();
  const actualizar = useUpdateExpense();
  const categorias = useExpenseCategories();

  const [fecha, setFecha] = useState(today());
  const [descripcion, setDescripcion] = useState('');
  const [importe, setImporte] = useState<number | ''>('');
  const [formaDePago, setFormaDePago] = useState<PaymentMethod>('CASH');
  const [categoriaId, setCategoriaId] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Al abrir: o los datos del gasto que se edita, o un formulario limpio.
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (gasto) {
      setFecha(gasto.date.slice(0, 10));
      setDescripcion(gasto.description);
      setImporte(toNumber(gasto.amount));
      setFormaDePago(gasto.paymentMethod);
      setCategoriaId(gasto.categoryId ?? '');
      setNotas(gasto.notes ?? '');
    } else {
      setFecha(today());
      setDescripcion('');
      setImporte('');
      setFormaDePago('CASH');
      setCategoriaId('');
      setNotas('');
    }
  }, [open, gasto]);

  async function guardar() {
    setError(null);

    if (!descripcion.trim()) {
      setError('Escribe en qué se fue el dinero');
      return;
    }
    if (Number(importe || 0) <= 0) {
      setError('El importe debe ser mayor que cero');
      return;
    }

    const datos: ExpensePayload = {
      date: fecha,
      description: descripcion.trim(),
      amount: Number(importe),
      paymentMethod: formaDePago,
      // null borra la categoría de un gasto que ya la tenía.
      categoryId: categoriaId || null,
      ...(notas.trim() ? { notes: notas.trim() } : {}),
    };

    try {
      if (gasto) {
        await actualizar.mutateAsync({ id: gasto.id, datos });
      } else {
        await crear.mutateAsync(datos);
      }
      onOpenChange(false);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo guardar el gasto',
      );
    }
  }

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={gasto ? 'Editar gasto' : 'Nuevo gasto'}
      description="Apunta cada salida de dinero para que el cierre de caja cuadre."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar gasto'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <Input
              type="date"
              value={fecha}
              max={today()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </Field>
          <Field label="Importe">
            <MoneyInput
              aria-label="Importe"
              value={importe}
              onValueChange={setImporte}
            />
          </Field>
        </div>

        <Field label="Descripción">
          <Input
            value={descripcion}
            maxLength={200}
            placeholder="Arriendo del local, bolsas, transporte..."
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cómo lo pagaste">
            <Select
              value={formaDePago}
              onChange={(e) => setFormaDePago(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((metodo) => (
                <option key={metodo.value} value={metodo.value}>
                  {metodo.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Categoría"
            hint="Las categorías se gestionan desde la pantalla de gastos."
          >
            <Select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Sin categoría</option>
              {(categorias.data ?? []).map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Notas (opcional)">
          <Textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Número de factura, proveedor..."
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
