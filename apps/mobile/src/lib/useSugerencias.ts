import { useQuery } from '@tanstack/react-query';
import { obtenerSugerenciasCampo, obtenerSugerenciasCampoPersonalizado } from '../db/sync';
import { useConfiguracionCampos } from './useConfiguracionCampos';

/** Prefijo de clave para campos personalizados — debe coincidir con el resto de pantallas/backend. */
const PREFIJO_CAMPO_PERSONALIZADO = 'personalizado:';

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
    queryKey: ['sugerencias-campos', camposConSugerencias, personalizadosConSugerencias],
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
