import { useQuery } from '@tanstack/react-query';
import { obtenerConfiguracionCampos } from '../db/sync';

/** Lee la configuración de campos del espejo local (descargada al iniciar sesión). */
export function useConfiguracionCampos() {
  const { data, ...rest } = useQuery({
    queryKey: ['configuracion-campos-local'],
    queryFn: obtenerConfiguracionCampos,
  });
  return {
    campos: data?.campos ?? [],
    camposPersonalizados: data?.camposPersonalizados ?? [],
    ...rest,
  };
}
