import { useQuery, type QueryClient } from '@tanstack/react-query';
import { obtenerSugerenciasCampo, obtenerSugerenciasCampoPersonalizado } from '../db/sync';
import { useConfiguracionCampos } from './useConfiguracionCampos';

/** Prefijo de clave para campos personalizados — debe coincidir con el resto de pantallas/backend. */
const PREFIJO_CAMPO_PERSONALIZADO = 'personalizado:';

/** Tope de sugerencias por campo — mismo criterio que LIMITE_SUGERENCIAS en sync.ts. */
const TOPE_SUGERENCIAS = 50;

/**
 * Prefijo de la queryKey. Invalidar con esto (no con la key completa) alcanza
 * para cualquier combinación de campos activados.
 */
export const CLAVE_SUGERENCIAS = 'sugerencias-campos';

/**
 * Un solo mapa {clave: valores[]} con las sugerencias de todos los campos que
 * el coordinador activó (estándar y personalizados), calculado contra el
 * espejo local del proyecto — nunca contra la red, así funciona offline
 * igual que el resto de la app. Las claves usan el mismo esquema que
 * `valoresExtra` en las pantallas (campo tal cual, o `personalizado:<id>`),
 * para poder indexarlo directo en el render sin llamar hooks dentro de un
 * `.map()`.
 */
export function useSugerencias(): Record<string, string[]> {
  const { campos, camposPersonalizados } = useConfiguracionCampos();
  const camposConSugerencias = campos.filter((c) => c.sugerencias).map((c) => c.campo);
  const personalizadosConSugerencias = camposPersonalizados.filter((cp) => cp.sugerencias).map((cp) => cp.id);

  const { data } = useQuery({
    // Si el coordinador activa/desactiva un campo, la key cambia y React
    // Query lo trata como una consulta nueva en vez de servir un caché que
    // no tendría ese campo calculado.
    queryKey: [CLAVE_SUGERENCIAS, camposConSugerencias, personalizadosConSugerencias],
    // Cada campo activado cuesta un recorrido completo del espejo (GROUP BY
    // sobre una columna sin índice): con 7 campos y 100k activos son ~370 ms
    // en un equipo de escritorio, bastante más en los teléfonos de campo. Y
    // esta pantalla se abre UNA VEZ POR ACTIVO, así que recalcular por cada
    // apertura era exactamente el "lento por cada activo" que hay que evitar.
    // El espejo solo cambia al sincronizar o al guardar una captura, así que
    // el resultado vive hasta que alguien invalide CLAVE_SUGERENCIAS (ver
    // invalidarLocal en InicioScreen y el guardado de cada pantalla).
    staleTime: Infinity,
    queryFn: async () => {
      const mapa: Record<string, string[]> = {};
      await Promise.all([
        ...camposConSugerencias.map(async (campo) => {
          mapa[campo] = await obtenerSugerenciasCampo(campo);
        }),
        ...personalizadosConSugerencias.map(async (id) => {
          mapa[`${PREFIJO_CAMPO_PERSONALIZADO}${id}`] = await obtenerSugerenciasCampoPersonalizado(id);
        }),
      ]);
      return mapa;
    },
    enabled: camposConSugerencias.length > 0 || personalizadosConSugerencias.length > 0,
  });

  return data ?? {};
}

/**
 * Suma al caché de sugerencias los valores que el auditor acaba de escribir, sin
 * tocar la base.
 *
 * Antes esto se resolvía invalidando CLAVE_SUGERENCIAS al guardar cada activo,
 * y ahí estaba el problema de fondo: la próxima pantalla que pidiera
 * sugerencias reejecutaba un escaneo del espejo COMPLETO por cada campo
 * activado (5 en Decameron, uno de ellos parseando un JSON por fila sobre 9k+
 * activos). Con el driver sincrónico de drizzle eso bloqueaba el hilo de JS
 * varios segundos UNA VEZ POR ACTIVO, hasta que Android mostraba "la app no
 * responde" y el auditor cerraba perdiendo el formulario (incidente Decameron,
 * agosto 2026).
 *
 * El resultado visible es el mismo —lo que el auditor escribió aparece como
 * sugerencia en el activo siguiente— pero cuesta cero consultas. El recálculo
 * real desde la base queda para cuando el espejo cambia de verdad: descarga o
 * delta de sesión (ver invalidarLocal en InicioScreen).
 */
export function registrarValoresUsados(queryClient: QueryClient, valores: Record<string, string>) {
  const usados = Object.entries(valores).filter(([, valor]) => valor && valor.trim());
  if (usados.length === 0) return;

  queryClient.setQueriesData<Record<string, string[]>>({ queryKey: [CLAVE_SUGERENCIAS] }, (previo) => {
    if (!previo) return previo;
    let cambio = false;
    const siguiente = { ...previo };
    for (const [clave, valor] of usados) {
      const actuales = siguiente[clave];
      if (!actuales) continue; // ese campo no tiene sugerencias activadas
      const limpio = valor.trim();
      if (actuales.some((v) => v.toLowerCase() === limpio.toLowerCase())) continue;
      siguiente[clave] = [limpio, ...actuales].slice(0, TOPE_SUGERENCIAS);
      cambio = true;
    }
    return cambio ? siguiente : previo;
  });
}
