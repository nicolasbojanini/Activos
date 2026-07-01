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
  organizacionId: z.string(),
});

export type UsuarioOutput = z.infer<typeof usuarioSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  usuario: usuarioSchema,
});

export type AuthTokensOutput = z.infer<typeof authTokensSchema>;
