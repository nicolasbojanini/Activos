import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { UsuarioOutput } from '@adn/shared';

const KEY_ACCESS = 'adn.accessToken';
const KEY_REFRESH = 'adn.refreshToken';
const KEY_USUARIO = 'adn.usuario';

interface AuthState {
  hydrated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  usuario: UsuarioOutput | null;
  hydrate: () => Promise<void>;
  setSession: (session: { accessToken: string; refreshToken: string; usuario: UsuarioOutput }) => Promise<void>;
  setAccessToken: (accessToken: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  hydrated: false,
  accessToken: null,
  refreshToken: null,
  usuario: null,

  hydrate: async () => {
    const [accessToken, refreshToken, usuarioRaw] = await Promise.all([
      SecureStore.getItemAsync(KEY_ACCESS),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_USUARIO),
    ]);
    set({
      accessToken,
      refreshToken,
      usuario: usuarioRaw ? (JSON.parse(usuarioRaw) as UsuarioOutput) : null,
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

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_ACCESS),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_USUARIO),
    ]);
    set({ accessToken: null, refreshToken: null, usuario: null });
  },
}));
