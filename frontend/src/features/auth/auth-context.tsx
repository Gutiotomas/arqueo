import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { api, getToken, setToken } from '@/shared/api/client';
import type { Session, User } from '@/shared/api/types';

interface AuthContextValue {
  user: User | null;
  cargando: boolean;
  currency: string;
  login: (email: string, password: string) => Promise<void>;
  register: (datos: RegisterPayload) => Promise<void>;
  logout: () => void;
  refrescarUsuario: () => Promise<void>;
}

export interface RegisterPayload {
  businessName: string;
  name: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const consultas = useQueryClient();

  /**
   * Al cambiar de sesión se tira todo lo consultado. Si no, quien entra
   * después en el mismo navegador ve, hasta que se refresca, los datos del
   * negocio anterior.
   */
  const abrirSesion = useCallback(
    (sesion: Session | null) => {
      consultas.clear();
      setToken(sesion?.accessToken ?? null);
      setUser(sesion?.user ?? null);
    },
    [consultas],
  );

  // Al arrancar, si hay token guardado se comprueba contra el API.
  useEffect(() => {
    if (!getToken()) {
      setCargando(false);
      return;
    }

    api
      .get<User>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setCargando(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      abrirSesion(await api.post<Session>('/auth/login', { email, password }));
    },
    [abrirSesion],
  );

  const register = useCallback(
    async (datos: RegisterPayload) => {
      abrirSesion(await api.post<Session>('/auth/register', datos));
    },
    [abrirSesion],
  );

  const logout = useCallback(() => abrirSesion(null), [abrirSesion]);

  const refrescarUsuario = useCallback(async () => {
    setUser(await api.get<User>('/auth/me'));
  }, []);

  const valor = useMemo<AuthContextValue>(
    () => ({
      user,
      cargando,
      currency: user?.business.currency ?? 'COP',
      login,
      register,
      logout,
      refrescarUsuario,
    }),
    [user, cargando, login, register, logout, refrescarUsuario],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return contexto;
}

/** Atajo para formatear importes con la moneda del negocio. */
export function useCurrency(): string {
  return useAuth().currency;
}
