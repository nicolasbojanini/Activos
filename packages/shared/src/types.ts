import { CategoriaActivo, EstadoAuditoria, EstadoFisico } from './enums';

export interface ProyectoOutput {
  id: string;
  nombre: string;
  fechaCorte: string;
  cerrado: boolean;
}

export interface ResumenProyectoOutput {
  total: number;
  pendientes: number;
  auditados: number;
  diferencias: number;
  faltantes: number;
  noRegistrados: number;
  pct: number;
}

export interface UbicacionOutput {
  id: string;
  sede: string;
  detalle: string | null;
}

export interface ActivoListItemOutput {
  id: string;
  placa: string;
  nombre: string;
  categoria: CategoriaActivo;
  ubicacion: UbicacionOutput | null;
  estado: EstadoAuditoria;
  ultimoAuditor: string | null;
}

export interface ActivoDetailOutput extends ActivoListItemOutput {
  codigoQR: string;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  responsable: string | null;
  centroCosto: string | null;
  estadoFisico: EstadoFisico;
  fechaAdquisicion: string | null;
  valorLibros: string | null;
  proveedor: string | null;
  vidaUtilMeses: number | null;
}

export interface PaginatedOutput<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FotoOutput {
  id: string;
  url: string;
  etiqueta: string | null;
  orden: number;
}

export interface RegistroHistorialOutput {
  id: string;
  estado: EstadoAuditoria;
  estadoFisico: EstadoFisico | null;
  cambios: Record<string, { antes: unknown; despues: unknown }> | null;
  nota: string | null;
  auditadoEn: string;
  auditor: string;
  fotos: FotoOutput[];
}
