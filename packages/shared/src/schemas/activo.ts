import { z } from 'zod';
import { CategoriaActivo, EstadoAuditoria, EstadoFisico } from '../enums';

/**
 * `codigoAnterior` es el único campo estructuralmente obligatorio (es el
 * identificador único y estable del activo — `codigoNuevo` se reasigna
 * durante la propia auditoría, así que no puede ser la llave). Todo lo demás
 * es opcional a este nivel — cuáles campos son realmente obligatorios para
 * un cliente dado se valida dinámicamente contra su ConfiguracionCampo
 * (durante la auditoría, no al importar — ver imports.service.ts).
 */
export const activoSchema = z.object({
  id: z.string().optional(),

  codigoAnterior: z.string().min(1, 'El código anterior es obligatorio'),
  codigoNuevo: z.string().nullable().optional(),
  codigoControl: z.string().nullable().optional(),
  nombre: z.string().nullable().optional(),
  descripcion: z.string().nullable().optional(),
  categoria: z.nativeEnum(CategoriaActivo).optional(),

  color: z.string().nullable().optional(),
  medidas: z.string().nullable().optional(),
  capacidad: z.string().nullable().optional(),

  marca: z.string().nullable().optional(),
  modelo: z.string().nullable().optional(),
  serie: z.string().nullable().optional(),

  ubicacionId: z.string().nullable().optional(),
  responsable: z.string().nullable().optional(),
  centroCosto: z.string().nullable().optional(),

  estadoFisico: z.nativeEnum(EstadoFisico).default(EstadoFisico.BUENO),
  fechaAdquisicion: z.coerce.date().nullable().optional(),
  valorLibros: z.coerce.number().nullable().optional(),
  proveedor: z.string().nullable().optional(),
  vidaUtilMeses: z.coerce.number().int().nullable().optional(),

  camposPersonalizados: z.record(z.string(), z.string()).nullable().optional(),
});

export type ActivoInput = z.infer<typeof activoSchema>;

export const activoImportRowSchema = activoSchema.omit({ id: true });

export type ActivoImportRow = z.infer<typeof activoImportRowSchema>;

export const listActivosQuerySchema = z.object({
  proyectoId: z.string(),
  q: z.string().optional(),
  estado: z.nativeEnum(EstadoAuditoria).optional(),
  ubicacion: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListActivosQuery = z.infer<typeof listActivosQuerySchema>;

export const buscarActivoQuerySchema = z.object({
  codigo: z.string().min(1),
});

export type BuscarActivoQuery = z.infer<typeof buscarActivoQuerySchema>;

export const sesionActivosQuerySchema = z.object({
  proyectoId: z.string(),
});

export type SesionActivosQuery = z.infer<typeof sesionActivosQuerySchema>;
