import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { UsuarioOutput } from '@adn/shared';
import { useUbicacionActivaStore } from './ubicacion-activa-store';

const KEY_ACCESS = 'adn.accessToken';
const KEY_REFRESH = 'adn.refreshToken';
const KEY_USUARIO = 'adn.usuario';
const KEY_CLIENTE_ID = 'adn.clienteId';
const KEY_PROYECTO_ID = 'adn.proyectoId';
const KEY_CLIENTE_NOMBRE = 'adn.clienteNombre';

interface AuthState {
  hydrated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  usuario: UsuarioOutput | null;
  clienteId: string | null;
  proyectoId: string | null;
  clienteNombre: string | null;
  hydrate: () => Promise<void>;
  setSession: (session: { accessToken: string; refreshToken: string; usuario: UsuarioOutput }) => Promise<void>;
  setAccessToken: (accessToken: string) => Promise<void>;
  /** Resuelve la asignación actual del usuario (a lo sumo un proyecto a la vez) y la guarda. */
  resolverAsignacionActual: () => Promise<void>;
  clear: () => Promise<void>;
}

async function guardarAsignacion(asignacion: { clienteId: string; proyectoId: string; cliente: { nombre: string } } | null) {
  if (asignacion) {
    await Promise.all([
      SecureStore.setItemAsync(KEY_CLIENTE_ID, asignacion.clienteId),
      SecureStore.setItemAsync(KEY_PROYECTO_ID, asignacion.proyectoId),
      SecureStore.setItemAsync(KEY_CLIENTE_NOMBRE, asignacion.cliente.nombre),
    ]);
  } else {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_CLIENTE_ID),
      SecureStore.deleteItemAsync(KEY_PROYECTO_ID),
      SecureStore.deleteItemAsync(KEY_CLIENTE_NOMBRE),
    ]);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  accessToken: null,
  refreshToken: null,
  usuario: null,
  clienteId: null,
  proyectoId: null,
  clienteNombre: null,

  hydrate: async () => {
    const [accessToken, refreshToken, usuarioRaw, clienteId, proyectoId, clienteNombre] = await Promise.all([
      SecureStore.getItemAsync(KEY_ACCESS),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_USUARIO),
      SecureStore.getItemAsync(KEY_CLIENTE_ID),
      SecureStore.getItemAsync(KEY_PROYECTO_ID),
      SecureStore.getItemAsync(KEY_CLIENTE_NOMBRE),
    ]);
    set({
      accessToken,
      refreshToken,
      usuario: usuarioRaw ? (JSON.parse(usuarioRaw) as UsuarioOutput) : null,
      clienteId,
      proyectoId,
      clienteNombre,
      hydrated: true,
    });
  },

  setSession: async ({ accessToken, refreshToken, usuario }) => {
    await Promise.all([
      SecureStore.setItemAsync(KEY_ACCESS, accessToken),
      SecureStore.setItemAsync(KEY_REFRESH, refreshToken),
      SecureStore.setItemAsync(KEY_USUARIO, JSON.stringify(usuario)),
    ]);
    set({ accessToken, refreshToken, usuario });
  },

  setAccessToken: async (accessToken) => {
    await SecureStore.setItemAsync(KEY_ACCESS, accessToken);
    set({ accessToken });
  },

  resolverAsignacionActual: async () => {
    // Import dinámico para no crear una dependencia circular estática con services.ts
    // (services.ts a su vez lee clienteId de este store para armar sus rutas).
    const { getMiAsignacion } = await import('./services');
    const asignacion = await getMiAsignacion();
    await guardarAsignacion(asignacion);
    set({
      clienteId: asignacion?.clienteId ?? null,
      proyectoId: asignacion?.proyectoId ?? null,
      clienteNombre: asignacion?.cliente.nombre ?? null,
    });
  },

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_ACCESS),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_USUARIO),
      guardarAsignacion(null),
    ]);
    set({ accessToken: null, refreshToken: null, usuario: null, clienteId: null, proyectoId: null, clienteNombre: null });
    useUbicacionActivaStore.getState().clear();
  },
}));
