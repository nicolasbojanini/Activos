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
  codigo: string;
  sede: string;
  detalle: string | null;
}

export interface ActivoListItemOutput {
  id: string;
  codigoAnterior: string;
  codigoNuevo: string | null;
  nombre: string;
  categoria: CategoriaActivo;
  ubicacion: UbicacionOutput | null;
  estado: EstadoAuditoria;
  ultimoAuditor: string | null;
}

export interface ActivoDetailOutput extends ActivoListItemOutput {
  codigoControl: string | null;
  descripcion: string | null;
  color: string | null;
  medidas: string | null;
  capacidad: string | null;
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
  camposPersonalizados: Record<string, string> | null;
  /** Valores de los CampoUbicacion del cliente, como {[id]: valor} — ver campoUbicacionSchema. */
  camposUbicacion: Record<string, string> | null;
}

/**
 * Fila del endpoint de sesión (espejo local móvil). `actualizadoEn` es el
 * cursor del sync incremental; `eliminado` solo llega en true cuando se pidió
 * un delta (?actualizadoDesde=...) y el activo fue borrado desde entonces —
 * la descarga completa nunca incluye borrados.
 */
export interface ActivoSesionOutput extends ActivoDetailOutput {
  actualizadoEn: string;
  eliminado: boolean;
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

/**
 * Rendimiento de un auditor en un proyecto: registros procesados dividido
 * entre días con al menos un registro (no días de calendario desde que se
 * asignó) — así no se penaliza a un auditor por días en los que no auditó.
 * `promedioPorDia` es 0 (no null) cuando `diasActivos` es 0.
 */
export interface AuditorRendimientoOutput {
  auditorId: string;
  auditorNombre: string;
  registros: number;
  diasActivos: number;
  promedioPorDia: number;
}

/** Fila del dashboard gerencial: un proyecto en curso (cerrado: false) de un cliente. */
export interface ProyectoGerencialOutput {
  clienteId: string;
  clienteNombre: string;
  proyectoId: string;
  proyectoNombre: string;
  fechaCorte: string;
  resumen: ResumenProyectoOutput;
  auditoresAsignados: number;
  auditores: AuditorRendimientoOutput[];
  /**
   * Rendimiento del equipo completo tratado como un solo auditor: total de
   * registros de todos los auditores asignados ÷ días distintos en que
   * CUALQUIERA de ellos trabajó (no la suma de sus días activos — un día en
   * que coincidieron dos auditores cuenta una sola vez). Es un promedio
   * ponderado, no el promedio de los `promedioPorDia` individuales.
   */
  promedioEquipoPorDia: number;
}
