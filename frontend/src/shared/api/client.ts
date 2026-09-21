/**
 * Cliente HTTP del API.
 *
 * En desarrollo, Vite hace de proxy de /api al backend; en produccion se usa
 * VITE_API_URL (la URL del servicio en Render).
 */

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const PREFIJO = '/api/v1';

const CLAVE_TOKEN = 'arqueo.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // Navegacion privada o almacenamiento bloqueado: la sesion durara lo que
    // dure la pestana, que es mejor que romper la aplicacion.
  }
}

const CLAVE_CADUCADA = 'arqueo.sesion-caducada';

/** La sesión se cerró sola: el login lo dirá al aparecer. */
export function marcarSesionCaducada(): void {
  try {
    sessionStorage.setItem(CLAVE_CADUCADA, '1');
  } catch {
    // Almacenamiento bloqueado: se pierde el aviso, no la funcionalidad.
  }
}

/** Lee el aviso y lo consume, para que no salga dos veces. */
export function consumirSesionCaducada(): boolean {
  try {
    const caducada = sessionStorage.getItem(CLAVE_CADUCADA) === '1';
    sessionStorage.removeItem(CLAVE_CADUCADA);
    return caducada;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors?: string[];

  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }

  /** Mensaje listo para enseñar en pantalla. */
  get detalle(): string {
    return this.errors?.length ? this.errors.join('. ') : this.message;
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

function construirUrl(path: string, params?: Params): string {
  const url = `${BASE}${PREFIJO}${path}`;
  if (!params) return url;

  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      query.append(clave, String(valor));
    }
  }
  const cadena = query.toString();
  return cadena ? `${url}?${cadena}` : url;
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; params?: Params } = {},
): Promise<T> {
  const token = getToken();

  const respuesta = await fetch(construirUrl(path, options.params), {
    method,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (respuesta.status === 401) {
    // El token caduco o no vale: fuera y a la pantalla de entrada, dejando
    // dicho por que, para que el login lo explique en vez de aparecer sin mas.
    setToken(null);
    marcarSesionCaducada();
    if (!location.pathname.startsWith('/login')) {
      location.href = '/login';
    }
    throw new ApiError(401, 'Tu sesión ha caducado. Vuelve a entrar.');
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new ApiError(
      respuesta.status,
      cuerpo?.message ?? 'No se pudo completar la operación',
      cuerpo?.errors,
    );
  }

  if (respuesta.status === 204) return undefined as T;
  return respuesta.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * Descarga un fichero del API. Un <a href> normal no puede mandar la cabecera
 * con el token, asi que se baja como blob y se dispara la descarga a mano.
 */
export async function downloadFile(
  path: string,
  params?: Params,
  nombrePorDefecto = 'arqueo',
): Promise<void> {
  const token = getToken();
  const respuesta = await fetch(construirUrl(path, params), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new ApiError(
      respuesta.status,
      cuerpo?.message ?? 'No se pudo generar el fichero',
    );
  }

  // El nombre lo decide el servidor en Content-Disposition.
  const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
  const coincidencia = disposicion.match(/filename="?([^"]+)"?/);
  const nombre = coincidencia?.[1] ?? nombrePorDefecto;

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
