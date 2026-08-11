import { Alert } from 'react-native';
import { create } from 'zustand';

/** Todo lo que exigirUbicacionActiva necesita del objeto navigation — evita pelear con los genéricos específicos de cada pantalla de NativeStackScreenProps. */
interface NavegacionConReplace {
  replace: (screen: 'Ubicacion') => void;
}

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

/**
 * Guardia reutilizable: cualquier acción que pueda grabar una auditoría
 * (escanear, buscar y crear, actualizar, confirmar/faltante desde el
 * detalle) debe pasar por acá antes de proceder. Antes esta validación solo
 * vivía en la pantalla de escanear con cámara — se podía crear o actualizar
 * un activo sin ubicación activa entrando por el buscador de Inicio o por
 * los botones directos del Detalle. Devuelve `true` si ya hay ubicación
 * activa (puede proceder); si no, muestra el mismo aviso que ya conocían los
 * auditores y los manda a escribirla, y devuelve `false`.
 */
export function exigirUbicacionActiva(navigation: NavegacionConReplace): boolean {
  if (useUbicacionActivaStore.getState().ubicacionActiva) return true;

  Alert.alert(
    'Escribe primero la ubicación',
    'Antes de auditar un activo, escribe en qué ubicación te encuentras.',
    [{ text: 'Entendido', onPress: () => navigation.replace('Ubicacion') }],
  );
  return false;
}
