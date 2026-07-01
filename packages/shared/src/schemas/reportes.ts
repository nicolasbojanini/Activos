import { z } from 'zod';

export const reporteFormato = ['xlsx', 'pdf', 'csv'] as const;

export const reporteQuerySchema = z.object({
  formato: z.enum(reporteFormato).default('xlsx'),
});

export type ReporteQuery = z.infer<typeof reporteQuerySchema>;
export type ReporteFormato = (typeof reporteFormato)[number];
