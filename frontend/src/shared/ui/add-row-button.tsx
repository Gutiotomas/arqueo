import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * El botón de añadir otra fila, debajo de la última: así queda siempre a
 * mano después de rellenar un producto, sin subir a buscarlo.
 *
 * Con `secundario`, la misma forma pero más discreta (gris): para acciones
 * que no son la principal del bloque, como repartir un pago en dos formas.
 */
export function AddRowButton({
  onClick,
  children,
  icon,
  secundario = false,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  secundario?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        secundario
          ? 'flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-marca-300 hover:bg-marca-50 hover:text-marca-700'
          : 'flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-marca-300 bg-white px-3 py-2.5 text-sm font-medium text-marca-700 transition-colors hover:bg-marca-50'
      }
    >
      {icon ?? <Plus className="h-4 w-4" />}
      {children}
    </button>
  );
}
