import { eq, isNull, and } from 'drizzle-orm';
import type { ActivoListItemOutput, EstadoAuditoria, PaginatedOutput, ProyectoOutput } from '@adn/shared';
import { db } from './client';
import { activosLocal, colaRegistros, metaSesion, ubicacionesLocal } from './schema';
import { getActivos } from '../lib/services';
import { apiFetch } from '../lib/api';

interface UbicacionRemota {
  id: string;
  sede: string;
  detalle: string | null;
}

const CLAVE_PROYECTO_ACTIVO = 'proyectoActivo';

export async function guardarProyectoActivo(proyecto: ProyectoOutput) {
  await db
    .insert(metaSesion)
    .values({ clave: CLAVE_PROYECTO_ACTIVO, valor: JSON.stringify(proyecto) })
    .onConflictDoUpdate({ target: metaSesion.clave, set: { valor: JSON.stringify(proyecto) } });
}

export async function obtenerProyectoActivo(): Promise<ProyectoOutput | null> {
  const [fila] = await db.select().from(metaSesion).where(eq(metaSesion.clave, CLAVE_PROYECTO_ACTIVO));
  return fila ? (JSON.parse(fila.valor) as ProyectoOutput) : null;
}

/**
 * Descarga el espejo local (activos + ubicaciones) del proyecto para poder
 * operar en bodega sin señal. Requiere red; se llama al abrir la sesión.
 */
export async function descargarSesion(proyecto: ProyectoOutput) {
  const proyectoId = proyecto.id;
  const ubicaciones = await apiFetch<UbicacionRemota[]>('/ubicaciones');

  const primeraPagina = await getActivos({ proyectoId, page: 1, pageSize: 100 });
  const todasLasPaginas: PaginatedOutput<ActivoListItemOutput>['data'] = [...primeraPagina.data];
  const totalPaginas = Math.max(1, Math.ceil(primeraPagina.total / 100));
  for (let page = 2; page <= totalPaginas; page++) {
    const siguiente = await getActivos({ proyectoId, page, pageSize: 100 });
    todasLasPaginas.push(...siguiente.data);
  }

  // Necesitamos la ficha completa (13 campos), no solo el resumen de la lista.
  const { getActivo } = await import('../lib/services');
  const fichasCompletas = await Promise.all(todasLasPaginas.map((a) => getActivo(a.id)));

  await db.delete(activosLocal);
  await db.delete(ubicacionesLocal);

  for (const u of ubicaciones) {
    await db.insert(ubicacionesLocal).values({ id: u.id, sede: u.sede, detalle: u.detalle });
  }

  for (const activo of fichasCompletas) {
    await db.insert(activosLocal).values({
      id: activo.id,
      placa: activo.placa,
      codigoQR: activo.codigoQR,
      nombre: activo.nombre,
      categoria: activo.categoria,
      marca: activo.marca,
      modelo: activo.modelo,
      serie: activo.serie,
      ubicacionId: activo.ubicacion?.id ?? null,
      ubicacionSede: activo.ubicacion?.sede ?? null,
      responsable: activo.responsable,
      centroCosto: activo.centroCosto,
      estadoFisico: activo.estadoFisico,
      fechaAdquisicion: activo.fechaAdquisicion,
      valorLibros: activo.valorLibros,
      proveedor: activo.proveedor,
      vidaUtilMeses: activo.vidaUtilMeses,
      estadoServidor: activo.estado,
      ultimoAuditorServidor: activo.ultimoAuditor,
    });
  }

  await guardarProyectoActivo(proyecto);
}

export async function haySesionDescargada(): Promise<boolean> {
  const filas = await db.select().from(activosLocal).limit(1);
  return filas.length > 0;
}

/** Última mutación pendiente (no sincronizada) para un activo, si existe. */
async function ultimaPendientePorActivo(activoId: string) {
  const filas = await db
    .select()
    .from(colaRegistros)
    .where(and(eq(colaRegistros.activoId, activoId), eq(colaRegistros.synced, 0)));
  if (filas.length === 0) return null;
  return filas.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export interface ActivoLocalConEstado {
  id: string;
  placa: string;
  nombre: string;
  categoria: string;
  ubicacionSede: string | null;
  estado: EstadoAuditoria;
  ultimoAuditor: string | null;
  sinSincronizar: boolean;
}

export async function listarActivosLocal(q?: string): Promise<ActivoLocalConEstado[]> {
  const activos = await db.select().from(activosLocal);
  const pendientes = await db.select().from(colaRegistros).where(eq(colaRegistros.synced, 0));

  const pendientePorActivo = new Map<string, (typeof pendientes)[number]>();
  for (const p of pendientes) {
    if (!p.activoId) continue;
    const actual = pendientePorActivo.get(p.activoId);
    if (!actual || p.createdAt > actual.createdAt) pendientePorActivo.set(p.activoId, p);
  }

  const filtro = q?.trim().toLowerCase();
  return activos
    .filter(
      (a) =>
        !filtro ||
        a.placa.toLowerCase().includes(filtro) ||
        a.nombre.toLowerCase().includes(filtro) ||
        (a.ubicacionSede ?? '').toLowerCase().includes(filtro),
    )
    .map((a) => {
      const pendiente = pendientePorActivo.get(a.id);
      return {
        id: a.id,
        placa: a.placa,
        nombre: a.nombre,
        categoria: a.categoria,
        ubicacionSede: a.ubicacionSede,
        estado: (pendiente?.estado ?? a.estadoServidor) as EstadoAuditoria,
        ultimoAuditor: a.ultimoAuditorServidor,
        sinSincronizar: !!pendiente,
      };
    })
    .sort((a, b) => a.placa.localeCompare(b.placa));
}

export async function obtenerActivoLocal(activoId: string) {
  const [activo] = await db.select().from(activosLocal).where(eq(activosLocal.id, activoId));
  if (!activo) return null;
  const pendiente = await ultimaPendientePorActivo(activoId);
  return { activo, estadoEfectivo: (pendiente?.estado ?? activo.estadoServidor) as EstadoAuditoria };
}

export async function buscarActivoLocalPorQR(codigoQR: string) {
  const [activo] = await db.select().from(activosLocal).where(eq(activosLocal.codigoQR, codigoQR));
  return activo ?? null;
}

export async function listarUbicacionesLocal() {
  return db.select().from(ubicacionesLocal);
}

export interface ResumenLocal {
  total: number;
  pendientes: number;
  auditados: number;
  diferencias: number;
  faltantes: number;
  noRegistrados: number;
  pct: number;
}

export async function calcularResumenLocal(): Promise<ResumenLocal> {
  const lista = await listarActivosLocal();
  const noRegistrados = await db
    .select()
    .from(colaRegistros)
    .where(and(isNull(colaRegistros.activoId), eq(colaRegistros.estado, 'NO_REGISTRADO')));

  const total = lista.length;
  const pendientes = lista.filter((a) => a.estado === 'PENDIENTE').length;
  const auditados = lista.filter((a) => a.estado === 'AUDITADO').length;
  const diferencias = lista.filter((a) => a.estado === 'DIFERENCIA').length;
  const faltantes = lista.filter((a) => a.estado === 'FALTANTE').length;
  const pct = total > 0 ? (total - pendientes) / total : 0;

  return { total, pendientes, auditados, diferencias, faltantes, noRegistrados: noRegistrados.length, pct };
}

export async function contarPendientesSync(): Promise<number> {
  const filas = await db.select().from(colaRegistros).where(eq(colaRegistros.synced, 0));
  return filas.length;
}
