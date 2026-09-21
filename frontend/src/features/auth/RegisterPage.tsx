import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';

import { AuthShell } from './LoginPage';
import { useAuth } from './auth-context';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';

export function RegisterPage() {
  const { user, register } = useAuth();
  const [datos, setDatos] = useState({
    businessName: '',
    name: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (user) return <Navigate to="/" replace />;

  function cambiar(campo: keyof typeof datos) {
    return (evento: React.ChangeEvent<HTMLInputElement>) =>
      setDatos((previo) => ({ ...previo, [campo]: evento.target.value }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await register(datos);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo crear la cuenta',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell
      title="Registra tu negocio"
      subtitle="Una cuenta por negocio. Podrás añadir más usuarios más adelante."
    >
      <form onSubmit={enviar} className="space-y-4">
        <Field label="Nombre del negocio">
          <Input
            required
            value={datos.businessName}
            onChange={cambiar('businessName')}
            placeholder="Tienda La Esquina"
          />
        </Field>

        <Field label="Tu nombre">
          <Input
            required
            autoComplete="name"
            value={datos.name}
            onChange={cambiar('name')}
            placeholder="Nombre y apellido"
          />
        </Field>

        <Field label="Correo">
          <Input
            type="email"
            required
            autoComplete="email"
            value={datos.email}
            onChange={cambiar('email')}
            placeholder="tu@negocio.com"
          />
        </Field>

        <Field
          label="Contraseña"
          hint="Mínimo 8 caracteres"
        >
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={datos.password}
            onChange={cambiar('password')}
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          {enviando ? 'Creando la cuenta...' : 'Crear cuenta'}
        </Button>

        <p className="text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-marca-600 hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
