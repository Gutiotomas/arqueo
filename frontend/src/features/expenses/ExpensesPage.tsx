import { Check, FileSpreadsheet, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  useCreateExpenseCategory,
  useDeleteExpense,
  useDeleteExpenseCategory,
  useExpenseCategories,
  useExpenses,
  useRenameExpenseCategory,
  type ExpenseFilters,
} from './api';
import { ExpenseFormDialog } from './ExpenseFormDialog';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError, downloadFile } from '@/shared/api/client';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type Expense,
  type PaymentMethod,
} from '@/shared/api/types';
import { formatDate, startOfMonth, today } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmDialog, Dialog } from '@/shared/ui/dialog';
import {
  Badge,
  EmptyState,
  ErrorMessage,
  Loading,
  Pagination,
} from '@/shared/ui/feedback';
import { Input, Select } from '@/shared/ui/field';
import { MobileCard, MobileList, TableWrapper } from '@/shared/ui/mobile-list';
import { RangePicker } from '@/shared/ui/range-picker';
import { Table, Td, Th, Tr } from '@/shared/ui/table';

export function ExpensesPage() {
  const { currency } = useAuth();
  const [filtros, setFiltros] = useState<ExpenseFilters>({
    from: startOfMonth(),
    to: today(),
    categoryId: '',
    paymentMethod: '',
    search: '',
    page: 1,
    limit: 20,
  });
  const [formulario, setFormulario] = useState<{
    abierto: boolean;
    gasto: Expense | null;
  }>({ abierto: false, gasto: null });
  const [aBorrar, setABorrar] = useState<Expense | null>(null);
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const gastos = useExpenses(filtros);
  const categorias = useExpenseCategories();
  const borrar = useDeleteExpense();

  function cambiarFiltros(cambios: Partial<ExpenseFilters>) {
    // Cualquier cambio de filtro vuelve a la primera página.
    setFiltros((previos) => ({ ...previos, ...cambios, page: cambios.page ?? 1 }));
  }

  async function exportar() {
    setDescargando(true);
    try {
      await downloadFile(
        '/reports/xlsx',
        { from: filtros.from, to: filtros.to },
        'arqueo-gastos.xlsx',
      );
    } finally {
      setDescargando(false);
    }
  }

  /** Las mismas acciones en la tabla y en la tarjeta. */
  function acciones(gasto: Expense) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Editar gasto"
          onClick={() => setFormulario({ abierto: true, gasto })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="dangerGhost"
          size="icon"
          aria-label="Borrar gasto"
          onClick={() => setABorrar(gasto)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Gastos"
        description="Todo lo que sale de la caja"
        action={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={exportar}
              disabled={descargando}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {descargando ? 'Generando...' : 'Exportar Excel'}
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setFormulario({ abierto: true, gasto: null })}
            >
              <Plus className="h-4 w-4" />
              Nuevo gasto
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {/* En el celular los filtros ocupan todo el ancho; los dos desplegables
            comparten línea y el resto va uno debajo de otro. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <RangePicker
            className="w-full sm:w-auto"
            value={{ from: filtros.from ?? '', to: filtros.to ?? '' }}
            onChange={(rango) => cambiarFiltros(rango)}
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Select
              className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
              value={filtros.categoryId}
              onChange={(e) => cambiarFiltros({ categoryId: e.target.value })}
              aria-label="Categoría"
            >
              <option value="">Todas las categorías</option>
              {(categorias.data ?? []).map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.name}
                </option>
              ))}
            </Select>
            <Select
              className="w-full sm:h-8 sm:w-auto sm:py-0 sm:text-xs"
              value={filtros.paymentMethod}
              onChange={(e) =>
                cambiarFiltros({ paymentMethod: e.target.value as PaymentMethod | '' })
              }
              aria-label="Forma de pago"
            >
              <option value="">Todas las formas de pago</option>
              {PAYMENT_METHODS.map((metodo) => (
                <option key={metodo.value} value={metodo.value}>
                  {metodo.label}
                </option>
              ))}
            </Select>
          </div>
          <Input
            className="w-full sm:h-8 sm:w-48 sm:py-0 sm:text-xs"
            placeholder="Buscar descripción"
            value={filtros.search}
            onChange={(e) => cambiarFiltros({ search: e.target.value })}
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-10 w-full sm:h-8 sm:w-auto"
            onClick={() => setCategoriasAbiertas(true)}
          >
            <Tags className="h-4 w-4" />
            Gestionar categorías
          </Button>
        </div>

        <Card>
          {gastos.isLoading ? (
            <Loading rows={6} />
          ) : gastos.isError ? (
            <ErrorMessage error={gastos.error} onRetry={() => gastos.refetch()} />
          ) : !gastos.data?.data.length ? (
            <EmptyState
              title="Aún no hay gastos en este periodo"
              message="Apunta el primer gasto y aparecerá aquí."
              action={
                <Button onClick={() => setFormulario({ abierto: true, gasto: null })}>
                  <Plus className="h-4 w-4" />
                  Nuevo gasto
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <span className="text-sm text-slate-500">
                  Total del periodo filtrado
                </span>
                <span className="tabular text-lg font-semibold text-slate-900">
                  {formatMoney(gastos.data.summary?.total ?? 0, currency)}
                </span>
              </div>

              <MobileList>
                {gastos.data.data.map((gasto) => (
                  <MobileCard
                    key={gasto.id}
                    title={gasto.description}
                    subtitle={
                      <>
                        {formatDate(gasto.date)} ·{' '}
                        {PAYMENT_METHOD_LABELS[gasto.paymentMethod]}
                        {gasto.notes && (
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {gasto.notes}
                          </span>
                        )}
                      </>
                    }
                    amount={formatMoney(gasto.amount, currency)}
                    amountTone="negative"
                    badge={
                      <Badge>{gasto.category?.name ?? 'Sin categoría'}</Badge>
                    }
                    actions={acciones(gasto)}
                  />
                ))}
              </MobileList>

              <TableWrapper>
                <Table>
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Descripción</Th>
                      <Th>Categoría</Th>
                      <Th>Pago</Th>
                      <Th align="right">Importe</Th>
                      <Th align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.data.data.map((gasto) => (
                      <Tr key={gasto.id}>
                        <Td className="whitespace-nowrap">{formatDate(gasto.date)}</Td>
                        <Td>
                          <span className="text-slate-700">{gasto.description}</span>
                          {gasto.notes && (
                            <p className="mt-1 text-xs text-slate-500">{gasto.notes}</p>
                          )}
                        </Td>
                        <Td>
                          {gasto.category ? (
                            <Badge>{gasto.category.name}</Badge>
                          ) : (
                            <span className="text-xs text-slate-400">Sin categoría</span>
                          )}
                        </Td>
                        <Td>
                          <Badge
                            tone={gasto.paymentMethod === 'CASH' ? 'warning' : 'info'}
                          >
                            {PAYMENT_METHOD_LABELS[gasto.paymentMethod]}
                          </Badge>
                        </Td>
                        <Td align="right" className="font-medium text-slate-900">
                          {formatMoney(gasto.amount, currency)}
                        </Td>
                        <Td align="right">
                          <div className="flex justify-end gap-1">{acciones(gasto)}</div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrapper>

              <Pagination
                page={gastos.data.meta.page}
                totalPages={gastos.data.meta.totalPages}
                total={gastos.data.meta.total}
                onPageChange={(page) => cambiarFiltros({ page })}
              />
            </>
          )}
        </Card>
      </div>

      <ExpenseFormDialog
        open={formulario.abierto}
        gasto={formulario.gasto}
        onOpenChange={(abierto) =>
          setFormulario((previo) => ({ ...previo, abierto }))
        }
      />

      <CategoriasDialog
        open={categoriasAbiertas}
        onOpenChange={setCategoriasAbiertas}
      />

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
        title="Borrar este gasto"
        message="Dejará de contar en el resumen y en el cuadre de caja. Esta acción no se puede deshacer."
        loading={borrar.isPending}
        onConfirm={async () => {
          if (!aBorrar) return;
          await borrar.mutateAsync(aBorrar.id);
          setABorrar(null);
        }}
      />
    </>
  );
}

function CategoriasDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const categorias = useExpenseCategories();
  const crear = useCreateExpenseCategory();
  const renombrar = useRenameExpenseCategory();
  const borrar = useDeleteExpenseCategory();

  const [nueva, setNueva] = useState('');
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNueva('');
    setEditando(null);
    setError(null);
  }, [open]);

  /** El API es la última palabra: el 409 de "categoría en uso" se enseña tal cual. */
  async function intentar(accion: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await accion();
      return true;
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.detalle : fallback);
      return false;
    }
  }

  async function anadir() {
    if (!nueva.trim()) return;
    const hecho = await intentar(
      () => crear.mutateAsync(nueva.trim()),
      'No se pudo crear la categoría',
    );
    if (hecho) setNueva('');
  }

  async function guardarNombre() {
    const actual = editando;
    if (!actual?.nombre.trim()) return;
    const hecho = await intentar(
      () => renombrar.mutateAsync({ id: actual.id, name: actual.nombre.trim() }),
      'No se pudo renombrar la categoría',
    );
    if (hecho) setEditando(null);
  }

  const ocupado = crear.isPending || renombrar.isPending || borrar.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Categorías de gasto"
      description="Agrupa los gastos para ver en qué se va el dinero."
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            className="min-w-0"
            value={nueva}
            maxLength={60}
            placeholder="Nueva categoría (p. ej. Arriendo)"
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && anadir()}
          />
          <Button
            className="shrink-0"
            onClick={anadir}
            disabled={ocupado || !nueva.trim()}
          >
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {categorias.isLoading ? (
          <Loading rows={3} />
        ) : categorias.isError ? (
          <ErrorMessage
            error={categorias.error}
            onRetry={() => categorias.refetch()}
          />
        ) : !categorias.data?.length ? (
          <EmptyState
            title="Todavía no hay categorías"
            message="Crea la primera arriba y podrás asignarla a cualquier gasto."
          />
        ) : (
          <ul className="space-y-2">
            {categorias.data.map((categoria) => {
              const usos = categoria._count?.expenses ?? 0;
              const enEdicion =
                editando && editando.id === categoria.id ? editando : null;

              return (
                <li
                  key={categoria.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  {enEdicion ? (
                    <>
                      <Input
                        autoFocus
                        className="h-8 min-w-0 flex-1 py-0 text-sm"
                        value={enEdicion.nombre}
                        maxLength={60}
                        aria-label="Nombre de la categoría"
                        onChange={(e) =>
                          setEditando({ id: categoria.id, nombre: e.target.value })
                        }
                        onKeyDown={(e) => e.key === 'Enter' && guardarNombre()}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Guardar nombre"
                        disabled={ocupado}
                        onClick={guardarNombre}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Cancelar cambio de nombre"
                        onClick={() => setEditando(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {categoria.name}
                      </span>
                      <span className="tabular shrink-0 text-xs text-slate-500">
                        {usos} gasto{usos === 1 ? '' : 's'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Renombrar ${categoria.name}`}
                        onClick={() =>
                          setEditando({ id: categoria.id, nombre: categoria.name })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="dangerGhost"
                        size="icon"
                        aria-label={`Borrar ${categoria.name}`}
                        disabled={ocupado}
                        onClick={() =>
                          intentar(
                            () => borrar.mutateAsync(categoria.id),
                            'No se pudo borrar la categoría',
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
