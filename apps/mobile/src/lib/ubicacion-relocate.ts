import { useUbicacionActivaStore } from './ubicacion-activa-store';

// Alias (no interface) a propósito: debe ser estructuralmente asignable al `cambios`
// genérico de RegistroAuditoriaInput (Record<string, {antes, despues}>) sin fricción.
export type CambioUbicacion = Record<string, { antes: unknown; despues: unknown }>;

/**
 * Si hay una ubicación activa en la sesión (texto libre, escrito a mano, sin
 * escanear ni validar contra la base) y difiere del nombre de sede actual
 * del activo, retorna el diff de reubicación a mezclar en `cambios`. La
 * comparación es por texto, no por id: la ubicación activa nunca tiene un id
 * resuelto en el teléfono — el servidor la resuelve (o la crea) al aplicar
 * el registro, con red y base de datos disponibles (ver
 * resolverUbicacionIdPorNombre en la API).
 */
export function calcularReubicacionAutomatica(
  activoUbicacionSede: string | null,
): CambioUbicacion | null {
  const ubicacionActiva = useUbicacionActivaStore.getState().ubicacionActiva;
  if (!ubicacionActiva) return null;

  const activa = ubicacionActiva.sede.trim();
  const actual = (activoUbicacionSede ?? '').trim();
  if (activa.toLowerCase() === actual.toLowerCase()) return null;

  return { ubicacionNombre: { antes: activoUbicacionSede, despues: activa } };
}
