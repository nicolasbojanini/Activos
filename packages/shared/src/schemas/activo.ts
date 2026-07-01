import { z } from 'zod';
import { CategoriaActivo, EstadoAuditoria, EstadoFisico } from '../enums';

/** Los 13+ campos mínimos de ficha (ver 02-MODELO-DE-DATOS.md). */
export const activoSchema = z.object({
  id: z.string().optional(),
  organizacionId: z.string(),

  placa: z.string().min(1, 'La placa es obligatoria'),
  codigoQR: z.string().min(1, 'El código QR es obligatorio'),
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  categoria: z.nativeEnum(CategoriaActivo),

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
});

export type ActivoInput = z.infer<typeof activoSchema>;

export const activoImportRowSchema = activoSchema.omit({
  id: true,
  organizacionId: true,
  codigoQR: true,
}).extend({
  codigoQR: z.string().nullable().optional(),
});

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
