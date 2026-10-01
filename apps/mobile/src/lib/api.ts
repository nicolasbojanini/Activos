import { useAuthStore } from './auth-store';

/**
 * En un dispositivo físico "localhost" apunta al propio teléfono, no al
 * computador de desarrollo. Configura EXPO_PUBLIC_API_URL con la IP de tu
 * red local (p. ej. http://192.168.1.10:3000/api/v1) para probar en un
 * dispositivo real; el emulador de Android usa 10.0.2.2 por convención.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * Mismo valor que se muestra en pantalla como "v1.NN" (ver VERSION_APP en
 * InicioScreen.tsx). El backend lo guarda en login/refresh (ver
 * AuthService.registrarBuildApp) para que un coordinador pueda ver desde el
 * portal quién sigue en una versión vieja y pedirle que actualice.
 */
const BUILD_APP = process.env.EXPO_PUBLIC_BUILD_NUMBER ?? 'dev';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    return message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setAccessToken, clear } = useAuthStore.getState();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Build': BUILD_APP },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          // Solo un 401 significa "este refresh token ya no sirve" (vencido,
          // mal firmado, o el usuario fue desactivado — ver AuthService.refresh).
          // Cualquier otra respuesta (429 del límite por IP de /auth/refresh,
          // compartido por varios dispositivos en la misma red — ver
          // UserThrottlerGuard —, o un 5xx transitorio del servidor) NO es un
          // rechazo de la sesión: antes se borraba el token con cualquier
          // !res.ok, así que bastaba con que varias PDAs en la misma bodega
          // coincidieran refrescando en la misma ventana de un minuto para que
          // a todas les tocara volver a iniciar sesión sin motivo.
          if (res.status === 401) await clear();
          return null;
        }
        const data = (await res.json()) as { accessToken: string };
        await setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const { body, headers, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Build': BUILD_APP,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, options, false);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
