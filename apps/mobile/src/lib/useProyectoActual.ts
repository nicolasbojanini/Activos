import { useQuery } from '@tanstack/react-query';
import { obtenerProyectoActivo } from '../db/sync';

/** Lee el proyecto activo del espejo local (ya resuelto por el bootstrap de InicioScreen). */
export function useProyectoActual() {
  const { data: proyecto, ...rest } = useQuery({ queryKey: ['proyecto-local'], queryFn: obtenerProyectoActivo });
  return { proyecto: proyecto ?? undefined, ...rest };
}
