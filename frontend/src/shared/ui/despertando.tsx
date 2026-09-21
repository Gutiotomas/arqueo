import { useEffect, useState } from 'react';

import { Spinner } from './feedback';

/**
 * El servidor de Render se duerme cuando no se usa y tarda cerca de un minuto
 * en despertar. Sin avisar, eso se vive como "la aplicación no funciona".
 *
 * Este hook dice si la espera ya se ha hecho larga, para poder explicarla en
 * vez de dejar un spinner mudo.
 */
export function useEsperaLarga(activo: boolean, umbralMs = 2500): number | null {
  const [segundos, setSegundos] = useState<number | null>(null);

  useEffect(() => {
    if (!activo) {
      setSegundos(null);
      return;
    }

    const inicio = Date.now();
    const intervalo = setInterval(() => {
      const transcurridos = Date.now() - inicio;
      if (transcurridos >= umbralMs) {
        setSegundos(Math.round(transcurridos / 1000));
      }
    }, 500);

    return () => clearInterval(intervalo);
  }, [activo, umbralMs]);

  return segundos;
}

/** Explicación honesta de por qué esto tarda, con el reloj a la vista. */
export function Despertando({
  segundos,
  className,
}: {
  segundos: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-start gap-3 rounded-lg bg-marca-50 px-4 py-3 text-left">
        <Spinner className="mt-0.5 h-5 w-5 shrink-0 text-marca-600" />
        <div className="text-sm">
          <p className="font-medium text-marca-900">Despertando el servidor</p>
          <p className="mt-0.5 text-marca-800">
            La primera entrada del día tarda hasta un minuto porque el servidor
            se apaga cuando nadie lo usa. No cierres esta pantalla.
          </p>
          <p className="mt-1 text-xs text-marca-700">
            Llevas {segundos} segundo{segundos === 1 ? '' : 's'} esperando
          </p>
        </div>
      </div>
    </div>
  );
}

/** La misma explicación, a pantalla completa, mientras se comprueba la sesión. */
export function PantallaDespertando({ segundos }: { segundos: number | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm text-center">
        {segundos === null ? (
          <Spinner className="mx-auto h-8 w-8" />
        ) : (
          <>
            <p className="mb-1 text-xs tracking-[0.25em] text-slate-400">
              PORTAL
            </p>
            <p className="mb-6 text-2xl font-bold text-marca-600">Arqueo</p>
            <Despertando segundos={segundos} />
          </>
        )}
      </div>
    </div>
  );
}
