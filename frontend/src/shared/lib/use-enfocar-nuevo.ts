import { useEffect, useRef } from 'react';

/**
 * Al añadir una fila a un formulario (otro producto, otra parte), lleva la
 * vista hasta ella y, con ratón, pone el cursor en su primer campo. Si no, la
 * fila nueva aparece abajo, fuera de la pantalla, y hay que ir a buscarla.
 *
 * En pantallas táctiles solo se desplaza: enfocar un desplegable desde código
 * no lo abre en el celular, y el dedo tiene que tocarlo igual.
 *
 * Uso: `const enfocar = useEnfocarNuevo();` → al añadir, `enfocar(key)`; y en
 * la fila, `data-nuevo={key}`.
 */
export function useEnfocarNuevo() {
  const pendiente = useRef<string | null>(null);

  // Sin dependencias a propósito: corre tras cada render y solo actúa si hay
  // una fila recién añadida esperando.
  useEffect(() => {
    const key = pendiente.current;
    if (!key) return;
    pendiente.current = null;

    const fila = document.querySelector<HTMLElement>(`[data-nuevo="${key}"]`);
    if (!fila) return;
    fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (window.matchMedia('(pointer: coarse)').matches) return;
    fila
      .querySelector<HTMLElement>('select, input:not([type="hidden"]), textarea')
      ?.focus({ preventScroll: true });
  });

  return (key: string) => {
    pendiente.current = key;
  };
}
