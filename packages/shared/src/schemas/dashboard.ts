import { z } from 'zod';

/** El histograma horario es de UN día a la vez — YYYY-MM-DD, hora de Bogotá (ver DashboardService). */
export const actividadHorariaQuerySchema = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD'),
});

export type ActividadHorariaQuery = z.infer<typeof actividadHorariaQuerySchema>;
