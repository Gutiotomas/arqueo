import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * El botón de añadir otra fila, debajo de la última: así queda siempre a
 * mano después de rellenar un producto, sin subir a buscarlo.
 */
export function AddRowButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-marca-300 bg-white px-3 py-2.5 text-sm font-medium text-marca-700 transition-colors hover:bg-marca-50"
    >
      <Plus className="h-4 w-4" />
      {children}
    </button>
  );
}
