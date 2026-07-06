import { eq, isNull, and } from 'drizzle-orm';
import type {
  CampoPersonalizadoOutput,
  ConfiguracionCampoOutput,
  EstadoAuditoria,
  ProyectoOutput,
} from '@adn/shared';
import { db } from './client';
import { activosLocal, colaRegistros, metaSesion, ubicacionesLocal } from './schema';
import { getConfiguracionCampos, getSesionActivos, getUbicaciones } from '../lib/services';

const CLAVE_PROYECTO_ACTIVO = 'proyectoActivo';
const CLAVE_CONFIGURACION_CAMPOS = 'configuracionCampos';

export interface ConfiguracionCamposLocal {
  campos: ConfiguracionCampoOutput[];
  camposPersonalizados: CampoPersonalizadoOutput[];
}

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

async function guardarConfiguracionCampos(configuracion: ConfiguracionCamposLocal) {
  await db
    .insert(metaSesion)
    .values({ clave: CLAVE_CONFIGURACION_CAMPOS, valor: JSON.stringify(configuracion) })
    .onConflictDoUpdate({ target: metaSesion.clave, set: { valor: JSON.stringify(configuracion) } });
}

export async function obtenerConfiguracionCampos(): Promise<ConfiguracionCamposLocal | null> {
  const [fila] = await db.select().from(metaSesion).where(eq(metaSesion.clave, CLAVE_CONFIGURACION_CAMPOS));
  return fila ? (JSON.parse(fila.valor) as ConfiguracionCamposLocal) : null;
}

/**
 * Refresca solo la configuración de campos (visible/obligatorio, estándar y
 * personalizados) sin tocar el espejo de activos/ubicaciones. Se llama en
 * cada apertura de la sesión, no solo en la primera descarga completa — si
 * el admin cambia qué campos son obligatorios/visibles a mitad de una
 * auditoría, el auditor lo ve reflejado la próxima vez que abre la app, en
 * vez de tener que borrar los datos y volver a descargar todo.
 */
export async function refrescarConfiguracionCampos() {
  const configuracionCampos = await getConfiguracionCampos();
  await guardarConfiguracionCampos(configuracionCampos);
}

/**
 * Descarga el espejo local (activos + ubicaciones) del proyecto para poder
 * operar en bodega sin señal. Requiere red; se llama al abrir la sesión.
 *
 * Antes hacía un `findAll()` paginado (páginas de 100) y LUEGO un
 * `getActivo()` individual por cada activo devuelto — con un inventario de
 * miles de activos (Decameron: 7.398) eso son miles de requests HTTP en
 * paralelo, que chocan contra el límite global de 100 req/min del backend y
 * dejan la sesión atascada en "Cargando…" para siempre. `getSesionActivos`
 * trae la ficha completa de todo el proyecto en una sola llamada.
 */
export async function descargarSesion(proyecto: ProyectoOutput) {
  const proyectoId = proyecto.id;
  const ubicaciones = await getUbicaciones();
  const configuracionCampos = await getConfiguracionCampos();
  const fichasCompletas = await getSesionActivos(proyectoId);

  // El driver expo-sqlite de drizzle es síncrono: cada `db.insert(...)` fuera
  // de una transacción hace su propio commit/fsync. Con miles de activos,
  // 7.398 inserts sueltos (uno por fila) son minutos de espera aunque la
  // descarga por red ya sea rápida — el cuello de botella pasa a ser
  // SQLite, no la API. Envolver todo en una sola transacción reduce esos
  // miles de fsync a uno solo.
  db.transaction((tx) => {
    tx.delete(activosLocal).run();
    tx.delete(ubicacionesLocal).run();

    for (const u of ubicaciones) {
      tx.insert(ubicacionesLocal).values({ id: u.id, codigo: u.codigo, sede: u.sede, detalle: u.detalle }).run();
    }

    for (const activo of fichasCompletas) {
      tx.insert(activosLocal)
        .values({
          id: activo.id,
          codigoNuevo: activo.codigoNuevo,
          codigoAnterior: activo.codigoAnterior,
          codigoControl: activo.codigoControl,
          nombre: activo.nombre,
          descripcion: activo.descripcion,
          categoria: activo.categoria,
          color: activo.color,
          medidas: activo.medidas,
          capacidad: activo.capacidad,
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
          camposPersonalizadosJson: activo.camposPersonalizados ? JSON.stringify(activo.camposPersonalizados) : null,
          estadoServidor: activo.estado,
          ultimoAuditorServidor: activo.ultimoAuditor,
        })
        .run();
    }
  });

  await guardarProyectoActivo(proyecto);
  await guardarConfiguracionCampos(configuracionCampos);
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
  codigoNuevo: string;
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
        a.codigoNuevo.toLowerCase().includes(filtro) ||
        a.nombre.toLowerCase().includes(filtro) ||
        (a.ubicacionSede ?? '').toLowerCase().includes(filtro),
    )
    .map((a) => {
      const pendiente = pendientePorActivo.get(a.id);
      return {
        id: a.id,
        codigoNuevo: a.codigoNuevo,
        nombre: a.nombre,
        categoria: a.categoria,
        ubicacionSede: a.ubicacionSede,
        estado: (pendiente?.estado ?? a.estadoServidor) as EstadoAuditoria,
        ultimoAuditor: a.ultimoAuditorServidor,
        sinSincronizar: !!pendiente,
      };
    })
    .sort((a, b) => a.codigoNuevo.localeCompare(b.codigoNuevo));
}

export async function obtenerActivoLocal(activoId: string) {
  const [activo] = await db.select().from(activosLocal).where(eq(activosLocal.id, activoId));
  if (!activo) return null;
  const pendiente = await ultimaPendientePorActivo(activoId);
  return { activo, estadoEfectivo: (pendiente?.estado ?? activo.estadoServidor) as EstadoAuditoria };
}

export async function buscarActivoLocalPorCodigo(codigo: string) {
  const [activo] = await db.select().from(activosLocal).where(eq(activosLocal.codigoNuevo, codigo));
  return activo ?? null;
}

export async function listarUbicacionesLocal() {
  return db.select().from(ubicacionesLocal);
}

export async function buscarUbicacionLocalPorCodigo(codigo: string) {
  const [ubicacion] = await db.select().from(ubicacionesLocal).where(eq(ubicacionesLocal.codigo, codigo));
  return ubicacion ?? null;
}

/** Cachea localmente una ubicación creada al vuelo, para que futuras búsquedas offline la encuentren. */
export async function guardarUbicacionLocal(ubicacion: { id: string; codigo: string; sede: string; detalle: string | null }) {
  await db
    .insert(ubicacionesLocal)
    .values(ubicacion)
    .onConflictDoUpdate({ target: ubicacionesLocal.id, set: ubicacion });
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
