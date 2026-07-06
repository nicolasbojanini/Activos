import { z } from 'zod';

export const crearProyectoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  fechaCorte: z.coerce.date(),
});

export type CrearProyectoInput = z.infer<typeof crearProyectoSchema>;
