import { useQuery } from '@tanstack/react-query';
import { getProyectos } from './services';

/** MVP: una sola auditoría activa por organización (ver M2/M3 del roadmap). */
export function useProyectoActual() {
  const { data: proyectos, ...rest } = useQuery({ queryKey: ['proyectos'], queryFn: getProyectos });
  return { proyecto: proyectos?.[0], ...rest };
}
