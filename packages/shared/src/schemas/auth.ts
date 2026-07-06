import { z } from 'zod';
import { Rol } from '../enums';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const usuarioSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  email: z.string().email(),
  rol: z.nativeEnum(Rol),
  activo: z.boolean(),
});

export type UsuarioOutput = z.infer<typeof usuarioSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  usuario: usuarioSchema,
});

export type AuthTokensOutput = z.infer<typeof authTokensSchema>;

/** Solo COORDINADOR/ADN_ADMIN pueden crear usuarios; ADN_ADMIN no se crea desde acá. */
export const crearUsuarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  email: z.string().email(),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  rol: z.enum([Rol.COORDINADOR, Rol.AUDITOR]),
});

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

export const actualizarUsuarioSchema = z.object({
  activo: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;

export const asignarProyectoSchema = z.object({
  usuarioId: z.string(),
  clienteId: z.string(),
  proyectoId: z.string(),
});

export type AsignarProyectoInput = z.infer<typeof asignarProyectoSchema>;

export const crearClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  nit: z.string().nullable().optional(),
});

export type CrearClienteInput = z.infer<typeof crearClienteSchema>;

export const clienteSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  nit: z.string().nullable(),
  estado: z.enum(['PROVISIONANDO', 'ACTIVO', 'SUSPENDIDO']),
  createdAt: z.string(),
});

export type ClienteOutput = z.infer<typeof clienteSchema>;

/** Solo ACTIVO/SUSPENDIDO son transiciones manuales — PROVISIONANDO lo maneja el sistema. */
export const actualizarClienteSchema = z.object({
  estado: z.enum(['ACTIVO', 'SUSPENDIDO']),
});

export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;

export const asignacionProyectoSchema = z.object({
  id: z.string(),
  usuarioId: z.string(),
  clienteId: z.string(),
  proyectoId: z.string(),
});

export type AsignacionProyectoOutput = z.infer<typeof asignacionProyectoSchema>;

export const miAsignacionSchema = asignacionProyectoSchema
  .extend({ cliente: z.object({ id: z.string(), nombre: z.string() }) })
  .nullable();

export type MiAsignacionOutput = z.infer<typeof miAsignacionSchema>;

export const configuracionCampoSchema = z.object({
  campo: z.string(),
  etiqueta: z.string(),
  tipo: z.enum(['text', 'number', 'date', 'select']),
  visible: z.boolean(),
  requerido: z.boolean(),
  orden: z.number(),
});

export type ConfiguracionCampoOutput = z.infer<typeof configuracionCampoSchema>;

export const actualizarConfiguracionCamposSchema = z.object({
  campos: z.array(
    z.object({
      campo: z.string(),
      visible: z.boolean(),
      requerido: z.boolean(),
    }),
  ),
});

export type ActualizarConfiguracionCamposInput = z.infer<
  typeof actualizarConfiguracionCamposSchema
>;

export const campoPersonalizadoSchema = z.object({
  id: z.string(),
  etiqueta: z.string(),
  visible: z.boolean(),
  requerido: z.boolean(),
  orden: z.number(),
});

export type CampoPersonalizadoOutput = z.infer<typeof campoPersonalizadoSchema>;

export const crearCampoPersonalizadoSchema = z.object({
  etiqueta: z.string().min(1, 'La etiqueta es obligatoria'),
  requerido: z.boolean().default(false),
});

export type CrearCampoPersonalizadoInput = z.infer<
  typeof crearCampoPersonalizadoSchema
>;

export const actualizarCampoPersonalizadoSchema = z.object({
  visible: z.boolean().optional(),
  requerido: z.boolean().optional(),
});

export type ActualizarCampoPersonalizadoInput = z.infer<
  typeof actualizarCampoPersonalizadoSchema
>;
