import { create } from 'zustand';

interface UbicacionActiva {
  id: string;
  codigo: string;
  sede: string;
  detalle: string | null;
}

interface UbicacionActivaState {
  ubicacionActiva: UbicacionActiva | null;
  setUbicacionActiva: (ubicacion: UbicacionActiva) => void;
  clear: () => void;
}

/**
 * En memoria, sin persistir: es "en qué sitio físico está el auditor ahora",
 * no una preferencia de largo plazo. Persistirlo arriesgaría reubicar activos
 * por error contra una ubicación vieja si la app se reabre días después sin
 * volver a escanear nada.
 */
export const useUbicacionActivaStore = create<UbicacionActivaState>((set) => ({
  ubicacionActiva: null,
  setUbicacionActiva: (ubicacion) => set({ ubicacionActiva: ubicacion }),
  clear: () => set({ ubicacionActiva: null }),
}));
