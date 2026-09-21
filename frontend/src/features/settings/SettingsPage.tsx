import { KeyRound, Store, User } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import {
  useBusiness,
  useChangePassword,
  useUpdateBusiness,
} from './api';
import { PageHeader } from '@/app/AppLayout';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { ErrorMessage, Loading } from '@/shared/ui/feedback';
import { Field, Input, Select } from '@/shared/ui/field';

interface Opcion {
  valor: string;
  label: string;
}

const MONEDAS: Opcion[] = [
  { valor: 'COP', label: 'COP · Peso colombiano' },
  { valor: 'USD', label: 'USD · Dólar estadounidense' },
  { valor: 'EUR', label: 'EUR · Euro' },
  { valor: 'MXN', label: 'MXN · Peso mexicano' },
  { valor: 'ARS', label: 'ARS · Peso argentino' },
  { valor: 'CLP', label: 'CLP · Peso chileno' },
  { valor: 'PEN', label: 'PEN · Sol peruano' },
];

const ZONAS: Opcion[] = [
  { valor: 'America/Bogota', label: 'Bogotá (Colombia)' },
  { valor: 'America/Mexico_City', label: 'Ciudad de México (México)' },
  { valor: 'America/Lima', label: 'Lima (Perú)' },
  { valor: 'America/Santiago', label: 'Santiago (Chile)' },
  { valor: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (Argentina)' },
  { valor: 'America/Caracas', label: 'Caracas (Venezuela)' },
  { valor: 'Europe/Madrid', label: 'Madrid (España)' },
];

/** Nunca se pierde lo que ya estaba guardado aunque no salga en la lista. */
function conValorActual(opciones: Opcion[], actual: string): Opcion[] {
  if (!actual || opciones.some((opcion) => opcion.valor === actual)) return opciones;
  return [...opciones, { valor: actual, label: actual }];
}

export function SettingsPage() {
  const { user, refrescarUsuario } = useAuth();
  const negocio = useBusiness();

  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Los datos de tu negocio y de tu cuenta"
      />

      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Store className="h-5 w-5 text-marca-600" />
                Datos del negocio
              </span>
            }
            description="Se usan en los informes y al mostrar los importes"
          />
          {negocio.isLoading ? (
            <Loading rows={3} />
          ) : negocio.isError ? (
            <ErrorMessage error={negocio.error} onRetry={() => negocio.refetch()} />
          ) : (
            <FormularioNegocio
              nombreInicial={negocio.data?.name ?? ''}
              monedaInicial={negocio.data?.currency ?? 'COP'}
              zonaInicial={negocio.data?.timezone ?? 'America/Bogota'}
              onGuardado={refrescarUsuario}
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <User className="h-5 w-5 text-marca-600" />
                Tu cuenta
              </span>
            }
            description="Con quién entras a Arqueo"
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input value={user?.name ?? ''} readOnly disabled />
              </Field>
              <Field label="Correo">
                <Input value={user?.email ?? ''} readOnly disabled />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              Para cambiar tu nombre o tu correo, escríbenos: así evitamos que
              alguien se quede fuera de su propio negocio.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-marca-600" />
                Cambiar la contraseña
              </span>
            }
            description="Mínimo 8 caracteres"
          />
          <FormularioContrasena />
        </Card>
      </div>
    </>
  );
}

function FormularioNegocio({
  nombreInicial,
  monedaInicial,
  zonaInicial,
  onGuardado,
}: {
  nombreInicial: string;
  monedaInicial: string;
  zonaInicial: string;
  onGuardado: () => Promise<void>;
}) {
  const actualizar = useUpdateBusiness();

  const [nombre, setNombre] = useState(nombreInicial);
  const [moneda, setMoneda] = useState(monedaInicial);
  const [zona, setZona] = useState(zonaInicial);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Si el API devuelve datos nuevos (o se recargan), el formulario los recoge.
  useEffect(() => {
    setNombre(nombreInicial);
    setMoneda(monedaInicial);
    setZona(zonaInicial);
  }, [nombreInicial, monedaInicial, zonaInicial]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setGuardado(false);

    if (!nombre.trim()) {
      setError('El negocio necesita un nombre');
      return;
    }

    try {
      await actualizar.mutateAsync({
        name: nombre.trim(),
        currency: moneda,
        timezone: zona,
      });
      // La moneda viaja dentro del usuario: sin refrescar, los importes de
      // toda la aplicacion seguirian con la anterior.
      await onGuardado();
      setGuardado(true);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError
          ? fallo.detalle
          : 'No se pudieron guardar los datos del negocio',
      );
    }
  }

  return (
    <form onSubmit={enviar}>
      <CardBody className="space-y-4">
        <Field label="Nombre del negocio">
          <Input
            value={nombre}
            maxLength={120}
            onChange={(e) => {
              setNombre(e.target.value);
              setGuardado(false);
            }}
            placeholder="Tienda La Esquina"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Moneda" hint="Con la que se muestran todos los importes">
            <Select
              value={moneda}
              onChange={(e) => {
                setMoneda(e.target.value);
                setGuardado(false);
              }}
            >
              {conValorActual(MONEDAS, moneda).map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Zona horaria" hint="Marca a qué día pertenece cada venta">
            <Select
              value={zona}
              onChange={(e) => {
                setZona(e.target.value);
                setGuardado(false);
              }}
            >
              {conValorActual(ZONAS, zona).map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {guardado && !error && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Datos del negocio guardados.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={actualizar.isPending}>
            {actualizar.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </CardBody>
    </form>
  );
}

function FormularioContrasena() {
  const cambiar = useChangePassword();

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const cortaDemasiado = nueva.length > 0 && nueva.length < 8;
  const noCoinciden = repetida.length > 0 && nueva !== repetida;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setGuardado(false);

    if (nueva.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres');
      return;
    }
    if (nueva !== repetida) {
      setError('Las dos contraseñas nuevas no coinciden');
      return;
    }

    try {
      await cambiar.mutateAsync({ currentPassword: actual, newPassword: nueva });
      setActual('');
      setNueva('');
      setRepetida('');
      setGuardado(true);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError
          ? fallo.detalle
          : 'No se pudo cambiar la contraseña',
      );
    }
  }

  return (
    <form onSubmit={enviar}>
      <CardBody className="space-y-4">
        <Field label="Contraseña actual">
          <Input
            type="password"
            autoComplete="current-password"
            value={actual}
            onChange={(e) => {
              setActual(e.target.value);
              setGuardado(false);
            }}
            placeholder="********"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Contraseña nueva"
            error={cortaDemasiado ? 'Al menos 8 caracteres' : undefined}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={nueva}
              aria-invalid={cortaDemasiado}
              onChange={(e) => {
                setNueva(e.target.value);
                setGuardado(false);
              }}
              placeholder="********"
            />
          </Field>

          <Field
            label="Repite la contraseña nueva"
            error={noCoinciden ? 'No coincide con la anterior' : undefined}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={repetida}
              aria-invalid={noCoinciden}
              onChange={(e) => {
                setRepetida(e.target.value);
                setGuardado(false);
              }}
              placeholder="********"
            />
          </Field>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {guardado && !error && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Contraseña actualizada. Úsala la próxima vez que entres.
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              cambiar.isPending ||
              !actual ||
              nueva.length < 8 ||
              nueva !== repetida
            }
          >
            {cambiar.isPending ? 'Cambiando...' : 'Cambiar contraseña'}
          </Button>
        </div>
      </CardBody>
    </form>
  );
}
