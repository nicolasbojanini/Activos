import type {
  ActivoDetailOutput,
  ActivoListItemOutput,
  AuthTokensOutput,
  PaginatedOutput,
  ProyectoOutput,
  RegistroAuditoriaInput,
  ResumenProyectoOutput,
} from '@adn/shared';
import { apiFetch } from './api';

export function login(email: string, password: string) {
  return apiFetch<AuthTokensOutput>('/auth/login', { method: 'POST', body: { email, password } });
}

export function getProyectos() {
  return apiFetch<ProyectoOutput[]>('/proyectos');
}

export function getResumenProyecto(proyectoId: string) {
  return apiFetch<ResumenProyectoOutput>(`/proyectos/${proyectoId}/resumen`);
}

export interface ActivosFilters {
  proyectoId: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function getActivos(filters: ActivosFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return apiFetch<PaginatedOutput<ActivoListItemOutput>>(`/activos?${params.toString()}`);
}

export function getActivo(id: string) {
  return apiFetch<ActivoDetailOutput>(`/activos/${id}`);
}

export function buscarActivoPorQR(codigoQR: string) {
  return apiFetch<ActivoDetailOutput>(`/activos/buscar?codigoQR=${encodeURIComponent(codigoQR)}`);
}

interface UploadEntry {
  clientPhotoId: string;
  uploadUrl: string;
  s3Key: string;
}

export function crearRegistro(dto: RegistroAuditoriaInput) {
  return apiFetch<{ registro: { id: string }; uploads: UploadEntry[] }>('/registros', {
    method: 'POST',
    body: dto,
  });
}

export function confirmarFotosRegistro(
  registroId: string,
  fotos: { clientPhotoId: string; s3Key: string; ancho: number; alto: number; bytes: number }[],
) {
  return apiFetch(`/registros/${registroId}/fotos/confirmar`, { method: 'POST', body: { fotos } });
}
