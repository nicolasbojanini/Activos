import { create } from 'zustand';
import type { UsuarioOutput } from '@adn/shared';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  usuario: UsuarioOutput | null;
  setSession: (session: { accessToken: string; refreshToken: string; usuario: UsuarioOutput }) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'adn.auth';

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, usuario: null };
    return JSON.parse(raw) as Pick<AuthState, 'accessToken' | 'refreshToken' | 'usuario'>;
  } catch {
    return { accessToken: null, refreshToken: null, usuario: null };
  }
}

function persist(state: Pick<AuthState, 'accessToken' | 'refreshToken' | 'usuario'>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitialState(),
  setSession: ({ accessToken, refreshToken, usuario }) => {
    persist({ accessToken, refreshToken, usuario });
    set({ accessToken, refreshToken, usuario });
  },
  setAccessToken: (accessToken) => {
    set((state) => {
      persist({ accessToken, refreshToken: state.refreshToken, usuario: state.usuario });
      return { accessToken };
    });
  },
  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ accessToken: null, refreshToken: null, usuario: null });
  },
}));
