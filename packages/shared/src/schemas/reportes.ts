import { z } from 'zod';

export const reporteFormato = ['xlsx', 'pdf', 'csv'] as const;

export const reporteQuerySchema = z.object({
  formato: z.enum(reporteFormato).default('xlsx'),
});

export type ReporteQuery = z.infer<typeof reporteQuerySchema>;
export type ReporteFormato = (typeof reporteFormato)[number];

/**
 * Filtro opcional por fecha de captura (auditadoEn) para el .zip de fotos —
 * permite descargas graduales de un proyecto grande (ej. "solo lo capturado
 * esta semana") en vez de todo de una vez. Sin filtro, se mantiene el
 * comportamiento actual (última auditoría de cada activo).
 */
export const fotosZipQuerySchema = z.object({
  desde: z.string().datetime({ offset: true }).optional(),
  hasta: z.string().datetime({ offset: true }).optional(),
});

export type FotosZipQuery = z.infer<typeof fotosZipQuerySchema>;
