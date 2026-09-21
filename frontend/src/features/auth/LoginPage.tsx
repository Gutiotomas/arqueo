import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';

import { useAuth } from './auth-context';
import { ApiError, consumirSesionCaducada } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Despertando, useEsperaLarga } from '@/shared/ui/despertando';
import { Field, Input } from '@/shared/ui/field';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Si entrar tarda, es que el servidor estaba dormido: mejor decirlo.
  const espera = useEsperaLarga(enviando);
  const [caducada] = useState(consumirSesionCaducada);

  if (user) return <Navigate to="/" replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password);
    } catch (fallo) {
      setError(
        fallo instanceof ApiError ? fallo.detalle : 'No se pudo iniciar sesión',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell
      title="Entrar en Arqueo"
      subtitle="Lleva las ventas, los gastos y el inventario de tu negocio"
    >
      <form onSubmit={enviar} className="space-y-4">
        {caducada && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Tu sesión se cerró por seguridad. Vuelve a entrar.
          </p>
        )}

        <Field label="Correo">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@negocio.com"
          />
        </Field>

        <Field label="Contraseña">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </Button>

        {espera !== null && <Despertando segundos={espera} />}

        <p className="text-center text-sm text-slate-600">
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="font-medium text-marca-600 hover:underline">
            Registra tu negocio
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-[11px] tracking-[0.25em] text-slate-500">PORTAL</p>
          <p className="text-3xl font-bold text-marca-300">Arqueo</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
