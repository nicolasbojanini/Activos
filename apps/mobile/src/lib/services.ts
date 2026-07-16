import type {
  ActivoDetailOutput,
  ActivoListItemOutput,
  ActivoSesionOutput,
  AuthTokensOutput,
  CampoPersonalizadoOutput,
  ConfiguracionCampoOutput,
  MiAsignacionOutput,
  PaginatedOutput,
  ProyectoOutput,
  RegistroAuditoriaInput,
  ResumenProyectoOutput,
  UbicacionOutput,
} from '@adn/shared';
import { apiFetch } from './api';
import { useAuthStore } from './auth-store';

function clienteId(): string {
  const id = useAuthStore.getState().clienteId;
  if (!id) throw new Error('No hay un cliente asignado');
  return id;
}

export function login(email: string, password: string) {
  return apiFetch<AuthTokensOutput>('/auth/login', { method: 'POST', body: { email, password } });
}

/** Global, sin clienteId — es la llamada que lo resuelve para el resto de la sesión. */
export function getMiAsignacion() {
  return apiFetch<MiAsignacionOutput>('/usuarios/me/asignacion');
}

export function getProyecto(proyectoId: string) {
  return apiFetch<ProyectoOutput>(`/clientes/${clienteId()}/proyectos/${proyectoId}`);
}

export function getResumenProyecto(proyectoId: string) {
  return apiFetch<ResumenProyectoOutput>(`/clientes/${clienteId()}/proyectos/${proyectoId}/resumen`);
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
  return apiFetch<PaginatedOutput<ActivoListItemOutput>>(`/clientes/${clienteId()}/activos?${params.toString()}`);
}

export function getActivo(id: string) {
  return apiFetch<ActivoDetailOutput>(`/clientes/${clienteId()}/activos/${id}`);
}

/**
 * Ficha completa de los activos del proyecto en una sola llamada — usado al
 * descargar la sesión offline. Con `actualizadoDesde` (cursor ISO) trae solo
 * el delta desde esa fecha, incluyendo activos borrados (eliminado: true).
 */
export function getSesionActivos(proyectoId: string, actualizadoDesde?: string) {
  const params = new URLSearchParams({ proyectoId });
  if (actualizadoDesde) params.set('actualizadoDesde', actualizadoDesde);
  return apiFetch<ActivoSesionOutput[]>(`/clientes/${clienteId()}/activos/sesion?${params.toString()}`);
}

export function buscarActivoPorCodigo(codigo: string) {
  return apiFetch<ActivoDetailOutput>(`/clientes/${clienteId()}/activos/buscar?codigo=${encodeURIComponent(codigo)}`);
}

export function getUbicaciones() {
  return apiFetch<UbicacionOutput[]>(`/clientes/${clienteId()}/ubicaciones`);
}

export function getConfiguracionCampos() {
  return apiFetch<{ campos: ConfiguracionCampoOutput[]; camposPersonalizados: CampoPersonalizadoOutput[] }>(
    `/clientes/${clienteId()}/configuracion-campos`,
  );
}

interface UploadEntry {
  clientPhotoId: string;
  uploadUrl: string;
  s3Key: string;
}

export function crearRegistro(dto: RegistroAuditoriaInput) {
  return apiFetch<{ registro: { id: string }; uploads: UploadEntry[] }>(`/clientes/${clienteId()}/registros`, {
    method: 'POST',
    body: dto,
  });
}

export function confirmarFotosRegistro(
  registroId: string,
  fotos: { clientPhotoId: string; s3Key: string; ancho: number; alto: number; bytes: number }[],
) {
  return apiFetch(`/clientes/${clienteId()}/registros/${registroId}/fotos/confirmar`, { method: 'POST', body: { fotos } });
}
