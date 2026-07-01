import { z } from 'zod';
import { EstadoAuditoria, EstadoFisico } from '../enums';

export const fotoInputSchema = z.object({
  clientPhotoId: z.string(),
  etiqueta: z.string().nullable().optional(),
  orden: z.number().int().min(0).max(3),
});

export type FotoInput = z.infer<typeof fotoInputSchema>;

/** Body de POST /registros — idempotente por clientId (uuid del dispositivo). */
export const registroAuditoriaInputSchema = z.object({
  clientId: z.string().uuid(),
  proyectoId: z.string(),
  activoId: z.string().nullable(),
  estado: z.nativeEnum(EstadoAuditoria),
  estadoFisico: z.nativeEnum(EstadoFisico).nullable().optional(),
  cambios: z.record(z.string(), z.object({ antes: z.unknown(), despues: z.unknown() })).nullable().optional(),
  nota: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  auditadoEn: z.coerce.date(),
  fotos: z.array(fotoInputSchema).max(4).default([]),
});

export type RegistroAuditoriaInput = z.infer<typeof registroAuditoriaInputSchema>;

export const confirmarFotosSchema = z.object({
  fotos: z.array(
    z.object({
      clientPhotoId: z.string(),
      s3Key: z.string(),
      ancho: z.number().int().optional(),
      alto: z.number().int().optional(),
      bytes: z.number().int().optional(),
    }),
  ),
});

export type ConfirmarFotosInput = z.infer<typeof confirmarFotosSchema>;
