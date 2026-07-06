import { z } from 'zod';

export const buscarUbicacionQuerySchema = z.object({
  codigo: z.string().min(1),
});

export type BuscarUbicacionQuery = z.infer<typeof buscarUbicacionQuerySchema>;

/**
 * Alta de una ubicación con un código YA conocido (escaneado en campo, sin
 * coincidencia). A diferencia del alta implícita por importación, acá el
 * código no se autogenera — ya viene del QR físico — y el auditor aporta el
 * nombre de la sede.
 */
export const crearUbicacionSchema = z.object({
  codigo: z.string().min(1),
  sede: z.string().min(1, 'La sede es obligatoria'),
  detalle: z.string().nullable().optional(),
});

export type CrearUbicacionInput = z.infer<typeof crearUbicacionSchema>;
