import { useUbicacionActivaStore } from './ubicacion-activa-store';

// Alias (no interface) a propósito: debe ser estructuralmente asignable al `cambios`
// genérico de RegistroAuditoriaInput (Record<string, {antes, despues}>) sin fricción.
export type CambioUbicacion = Record<string, { antes: unknown; despues: unknown }>;

/**
 * Si hay una ubicación activa en la sesión de escaneo y difiere de la
 * ubicación actual del activo, retorna el diff de reubicación a mezclar en
 * `cambios`. Si no hay ubicación activa, o ya coincide, retorna null (sin
 * reubicación implícita).
 */
export function calcularReubicacionAutomatica(
  activoUbicacionId: string | null,
): CambioUbicacion | null {
  const ubicacionActiva = useUbicacionActivaStore.getState().ubicacionActiva;
  if (!ubicacionActiva || ubicacionActiva.id === activoUbicacionId) return null;
  return { ubicacionId: { antes: activoUbicacionId, despues: ubicacionActiva.id } };
}
