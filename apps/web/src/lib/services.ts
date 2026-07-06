import type {
  ActivoDetailOutput,
  ActualizarCampoPersonalizadoInput,
  ActualizarClienteInput,
  ActualizarConfiguracionCamposInput,
  AsignacionProyectoOutput,
  AsignarProyectoInput,
  AuthTokensOutput,
  CampoPersonalizadoOutput,
  ClienteOutput,
  ConfiguracionCampoOutput,
  CrearCampoPersonalizadoInput,
  CrearClienteInput,
  CrearProyectoInput,
  CrearUsuarioInput,
  ImportCommitInput,
  ImportCommitOutput,
  ImportPreviewOutput,
  PaginatedOutput,
  ActivoListItemOutput,
  ProyectoOutput,
  RegistroHistorialOutput,
  ResumenProyectoOutput,
  UsuarioOutput,
} from '@adn/shared';
import { apiFetch } from './api';
import { useClienteStore } from './cliente-store';

function clienteId(): string {
  const id = useClienteStore.getState().clienteId;
  if (!id) throw new Error('No hay un cliente seleccionado');
  return id;
}

export function login(email: string, password: string) {
  return apiFetch<AuthTokensOutput>('/auth/login', { method: 'POST', body: { email, password } });
}

export function me() {
  return apiFetch<UsuarioOutput>('/auth/me');
}

export function getClientes() {
  return apiFetch<ClienteOutput[]>('/clientes');
}

export function crearCliente(dto: CrearClienteInput) {
  return apiFetch<ClienteOutput>('/clientes', { method: 'POST', body: dto });
}

export function actualizarEstadoCliente(clienteId: string, dto: ActualizarClienteInput) {
  return apiFetch<ClienteOutput>(`/clientes/${clienteId}`, { method: 'PATCH', body: dto });
}

export function eliminarCliente(clienteId: string) {
  return apiFetch<void>(`/clientes/${clienteId}`, { method: 'DELETE' });
}

export function getConfiguracionCampos(idCliente: string) {
  return apiFetch<{ campos: ConfiguracionCampoOutput[]; camposPersonalizados: CampoPersonalizadoOutput[] }>(
    `/clientes/${idCliente}/configuracion-campos`,
  );
}

export function actualizarConfiguracionCampos(idCliente: string, dto: ActualizarConfiguracionCamposInput) {
  return apiFetch<ConfiguracionCampoOutput[]>(`/clientes/${idCliente}/configuracion-campos`, {
    method: 'PUT',
    body: dto,
  });
}

export function crearCampoPersonalizado(idCliente: string, dto: CrearCampoPersonalizadoInput) {
  return apiFetch<CampoPersonalizadoOutput>(`/clientes/${idCliente}/campos-personalizados`, {
    method: 'POST',
    body: dto,
  });
}

export function eliminarCampoPersonalizado(idCliente: string, campoId: string) {
  return apiFetch<void>(`/clientes/${idCliente}/campos-personalizados/${campoId}`, { method: 'DELETE' });
}

export function actualizarCampoPersonalizado(
  idCliente: string,
  campoId: string,
  dto: ActualizarCampoPersonalizadoInput,
) {
  return apiFetch<CampoPersonalizadoOutput>(`/clientes/${idCliente}/campos-personalizados/${campoId}`, {
    method: 'PATCH',
    body: dto,
  });
}

export function getUsuarios() {
  return apiFetch<UsuarioOutput[]>('/usuarios');
}

export function crearUsuario(dto: CrearUsuarioInput) {
  return apiFetch<UsuarioOutput>('/usuarios', { method: 'POST', body: dto });
}

export function actualizarUsuario(id: string, dto: { activo?: boolean; password?: string }) {
  return apiFetch<UsuarioOutput>(`/usuarios/${id}`, { method: 'PATCH', body: dto });
}

export function getAsignaciones(usuarioId: string) {
  return apiFetch<(AsignacionProyectoOutput & { cliente: { id: string; nombre: string } })[]>(
    `/usuarios/${usuarioId}/asignaciones`,
  );
}

export function asignarProyecto(dto: AsignarProyectoInput) {
  return apiFetch<AsignacionProyectoOutput>('/usuarios/asignaciones', { method: 'POST', body: dto });
}

export function quitarAsignacion(asignacionId: string) {
  return apiFetch<void>(`/usuarios/asignaciones/${asignacionId}`, { method: 'DELETE' });
}

export function getProyectos() {
  return apiFetch<ProyectoOutput[]>(`/clientes/${clienteId()}/proyectos`);
}

/** Para selectores de asignación, donde se necesita listar proyectos de un cliente que no es necesariamente el activo. */
export function getProyectosDeCliente(idCliente: string) {
  return apiFetch<ProyectoOutput[]>(`/clientes/${idCliente}/proyectos`);
}

export function getProyecto(id: string) {
  return apiFetch<ProyectoOutput>(`/clientes/${clienteId()}/proyectos/${id}`);
}

export function getResumenProyecto(id: string) {
  return apiFetch<ResumenProyectoOutput>(`/clientes/${clienteId()}/proyectos/${id}/resumen`);
}

export function crearProyecto(dto: CrearProyectoInput) {
  return apiFetch<ProyectoOutput>(`/clientes/${clienteId()}/proyectos`, { method: 'POST', body: dto });
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
  return apiFetch<PaginatedOutput<ActivoListItemOutput>>(`/clientes/${clienteId()}/activos?${params.toString()}`);
}

export function getActivo(id: string) {
  return apiFetch<ActivoDetailOutput>(`/clientes/${clienteId()}/activos/${id}`);
}

export function getHistorialActivo(id: string) {
  return apiFetch<RegistroHistorialOutput[]>(`/clientes/${clienteId()}/activos/${id}/registros`);
}

export function previewImport(file: File, hoja?: string) {
  const form = new FormData();
  form.append('archivo', file);
  if (hoja) form.append('hoja', hoja);
  return apiFetch<ImportPreviewOutput>(`/clientes/${clienteId()}/imports/preview`, {
    method: 'POST',
    body: form,
    isFormData: true,
  });
}

export function commitImport(dto: ImportCommitInput) {
  return apiFetch<ImportCommitOutput>(`/clientes/${clienteId()}/imports/commit`, { method: 'POST', body: dto });
}

export function reporteDescargaUrl(proyectoId: string, formato: string) {
  return `/clientes/${clienteId()}/proyectos/${proyectoId}/reporte?formato=${formato}`;
}

export function fotosZipDescargaUrl(proyectoId: string) {
  return `/clientes/${clienteId()}/proyectos/${proyectoId}/fotos.zip`;
}
