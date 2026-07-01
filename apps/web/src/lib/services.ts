import type {
  AuthTokensOutput,
  ImportCommitInput,
  ImportCommitOutput,
  ImportPreviewOutput,
  PaginatedOutput,
  ActivoListItemOutput,
  ProyectoOutput,
  ResumenProyectoOutput,
  UsuarioOutput,
} from '@adn/shared';
import { apiFetch } from './api';

export function login(email: string, password: string) {
  return apiFetch<AuthTokensOutput>('/auth/login', { method: 'POST', body: { email, password } });
}

export function me() {
  return apiFetch<UsuarioOutput & { organizacion: { id: string; nombre: string } }>('/auth/me');
}

export function getProyectos() {
  return apiFetch<ProyectoOutput[]>('/proyectos');
}

export function getProyecto(id: string) {
  return apiFetch<ProyectoOutput>(`/proyectos/${id}`);
}

export function getResumenProyecto(id: string) {
  return apiFetch<ResumenProyectoOutput>(`/proyectos/${id}/resumen`);
}

export interface ActivosFilters {
  proyectoId: string;
  q?: string;
  estado?: string;
  ubicacion?: string;
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

export function previewImport(file: File) {
  const form = new FormData();
  form.append('archivo', file);
  return apiFetch<ImportPreviewOutput>('/imports/preview', { method: 'POST', body: form, isFormData: true });
}

export function commitImport(dto: ImportCommitInput) {
  return apiFetch<ImportCommitOutput>('/imports/commit', { method: 'POST', body: dto });
}
