import { create } from 'zustand';

interface UbicacionActivaState {
  /** Nombre de sede escrito a mano por el auditor — nunca escaneado ni validado contra la base. */
  ubicacionActiva: { sede: string } | null;
  setUbicacionActiva: (sede: string) => void;
  clear: () => void;
}

/**
 * En memoria, sin persistir: es "en qué sitio físico está el auditor ahora",
 * no una preferencia de largo plazo. Persistirlo arriesgaría reubicar activos
 * por error contra una ubicación vieja si la app se reabre días después sin
 * volver a escribirla.
 */
export const useUbicacionActivaStore = create<UbicacionActivaState>((set) => ({
  ubicacionActiva: null,
  setUbicacionActiva: (sede) => set({ ubicacionActiva: { sede: sede.trim() } }),
  clear: () => set({ ubicacionActiva: null }),
}));
