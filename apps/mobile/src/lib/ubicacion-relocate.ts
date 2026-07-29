import { CLAVE_UBICACION_BASE, useUbicacionActivaStore } from './ubicacion-activa-store';

// Alias (no interface) a propósito: debe ser estructuralmente asignable al `cambios`
// genérico de RegistroAuditoriaInput (Record<string, {antes, despues}>) sin fricción.
export type CambioUbicacion = Record<string, { antes: unknown; despues: unknown }>;

/** Prefijo de clave para diffs de campos de ubicación adicionales — debe coincidir con registros.service.ts (backend). */
const PREFIJO_CAMPO_UBICACION = 'ubicacionCampo:';

/**
 * Si hay una ubicación activa en la sesión (texto libre, escrito a mano, sin
 * escanear ni validar contra la base) y alguno de sus valores difiere de los
 * que ya tiene el activo, retorna el diff de reubicación a mezclar en
 * `cambios`. La comparación del campo base ("Ubicación") es por texto, no
 * por id: la ubicación activa nunca tiene un id resuelto en el teléfono — el
 * servidor la resuelve (o la crea) al aplicar el registro, con red y base de
 * datos disponibles (ver resolverUbicacionIdPorNombre en la API). Los campos
 * adicionales (Torre, Piso, etc.) se comparan directo contra lo último
 * guardado en el activo (`camposUbicacion`).
 */
export function calcularReubicacionAutomatica(
  activoUbicacionSede: string | null,
  activoCamposUbicacion: Record<string, string> | null = null,
): CambioUbicacion | null {
  const ubicacionActiva = useUbicacionActivaStore.getState().ubicacionActiva;
  if (!ubicacionActiva) return null;

  const cambios: CambioUbicacion = {};

  const activa = (ubicacionActiva[CLAVE_UBICACION_BASE] ?? '').trim();
  const actual = (activoUbicacionSede ?? '').trim();
  if (activa.toLowerCase() !== actual.toLowerCase()) {
    cambios.ubicacionNombre = { antes: activoUbicacionSede, despues: activa };
  }

  const actuales = activoCamposUbicacion ?? {};
  for (const [clave, valor] of Object.entries(ubicacionActiva)) {
    if (clave === CLAVE_UBICACION_BASE) continue;
    const valorActual = (actuales[clave] ?? '').trim();
    const valorNuevo = valor.trim();
    if (valorNuevo !== valorActual) {
      cambios[`${PREFIJO_CAMPO_UBICACION}${clave}`] = {
        antes: valorActual || null,
        despues: valorNuevo || null,
      };
    }
  }

  return Object.keys(cambios).length > 0 ? cambios : null;
}
