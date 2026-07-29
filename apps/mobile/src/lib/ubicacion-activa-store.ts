import { create } from 'zustand';

/** Clave del campo base "Ubicación" dentro del diccionario de valores — las demás claves son ids de CampoUbicacion. */
export const CLAVE_UBICACION_BASE = 'ubicacion';

interface UbicacionActivaState {
  /**
   * Valores de los campos de la ubicación activa (Ubicación + hasta 5 más,
   * ver CampoUbicacion), escritos a mano — nunca escaneados ni validados
   * contra la base. `null` = no se ha escrito ubicación en esta sesión.
   */
  ubicacionActiva: Record<string, string> | null;
  setUbicacionActiva: (valores: Record<string, string>) => void;
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
  setUbicacionActiva: (valores) => set({ ubicacionActiva: valores }),
  clear: () => set({ ubicacionActiva: null }),
}));
