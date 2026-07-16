import { eq, and, or, asc, inArray, sql } from 'drizzle-orm';
import type {
  ActivoSesionOutput,
  CampoPersonalizadoOutput,
  ConfiguracionCampoOutput,
  EstadoAuditoria,
  ProyectoOutput,
  UbicacionOutput,
} from '@adn/shared';
import { db } from './client';
import { activosLocal, colaRegistros, metaSesion, ubicacionesLocal } from './schema';
import { getConfiguracionCampos, getSesionActivos, getUbicaciones } from '../lib/services';

const CLAVE_PROYECTO_ACTIVO = 'proyectoActivo';
const CLAVE_CONFIGURACION_CAMPOS = 'configuracionCampos';
const CLAVE_CURSOR_ACTIVOS = 'cursorActivos';

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
/** Mapea la ficha que devuelve la API al esquema de la tabla local. */
function aFilaLocal(activo: ActivoSesionOutput) {
  return {
    id: activo.id,
    // '' en vez de null: en instalaciones viejas la columna codigo_nuevo
    // todavía tiene NOT NULL (SQLite no permite quitarlo con ALTER
    // TABLE) — nunca insertar null acá evita romper ese constraint.
    codigoNuevo: activo.codigoNuevo ?? '',
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
  };
}

/** Mayor updatedAt recibido — es el cursor del próximo delta. null si no llegaron filas. */
function mayorCursor(fichas: ActivoSesionOutput[]): string | null {
  let mayor: string | null = null;
  for (const f of fichas) {
    if (!mayor || f.actualizadoEn > mayor) mayor = f.actualizadoEn;
  }
  return mayor;
}

async function guardarCursorActivos(cursor: string) {
  await db
    .insert(metaSesion)
    .values({ clave: CLAVE_CURSOR_ACTIVOS, valor: cursor })
    .onConflictDoUpdate({ target: metaSesion.clave, set: { valor: cursor } });
}

async function obtenerCursorActivos(): Promise<string | null> {
  const [fila] = await db.select().from(metaSesion).where(eq(metaSesion.clave, CLAVE_CURSOR_ACTIVOS));
  return fila?.valor ?? null;
}

function refrescarUbicacionesLocal(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], ubicaciones: UbicacionOutput[]) {
  tx.delete(ubicacionesLocal).run();
  if (ubicaciones.length > 0) {
    tx.insert(ubicacionesLocal)
      .values(ubicaciones.map((u) => ({ id: u.id, codigo: u.codigo, sede: u.sede, detalle: u.detalle })))
      .run();
  }
}

export async function descargarSesion(proyecto: ProyectoOutput) {
  const proyectoId = proyecto.id;
  // Las tres descargas no dependen entre sí — en paralelo, el tiempo total es
  // el de la más lenta (la sesión de activos) en vez de la suma de las tres.
  const [ubicaciones, configuracionCampos, fichasCompletas] = await Promise.all([
    getUbicaciones(),
    getConfiguracionCampos(),
    getSesionActivos(proyectoId),
  ]);

  const filas = fichasCompletas.map(aFilaLocal);

  // El driver expo-sqlite de drizzle es síncrono: la transacción única evita
  // un fsync por fila, y el insert multi-fila evita preparar miles de
  // statements (uno por activo). Lotes de 500: 500 filas × ~25 columnas =
  // 12.500 parámetros, holgado frente al límite de 32.766 de SQLite.
  const LOTE = 500;
  db.transaction((tx) => {
    tx.delete(activosLocal).run();
    refrescarUbicacionesLocal(tx, ubicaciones);

    for (let i = 0; i < filas.length; i += LOTE) {
      tx.insert(activosLocal).values(filas.slice(i, i + LOTE)).run();
    }
  });

  await guardarProyectoActivo(proyecto);
  await guardarConfiguracionCampos(configuracionCampos);
  const cursor = mayorCursor(fichasCompletas);
  if (cursor) await guardarCursorActivos(cursor);
}

/**
 * Sync incremental del espejo local: pide solo los activos que cambiaron en
 * el servidor desde el último cursor (ediciones desde la web, re-imports del
 * Excel, capturas de OTROS auditores) y los upserta/borra localmente, sin
 * re-descargar el inventario completo. Si no hay cursor (instalación que
 * descargó la sesión antes de que existiera esta función), hace una descarga
 * completa una vez para plantarlo.
 */
export async function actualizarSesionDelta(proyecto: ProyectoOutput) {
  const cursor = await obtenerCursorActivos();
  if (!cursor) {
    await descargarSesion(proyecto);
    return;
  }

  const [ubicaciones, fichas] = await Promise.all([
    getUbicaciones(),
    getSesionActivos(proyecto.id, cursor),
  ]);

  db.transaction((tx) => {
    // Las ubicaciones no tienen cursor propio: son pocas, refrescarlas
    // enteras en cada apertura cuesta casi nada.
    refrescarUbicacionesLocal(tx, ubicaciones);

    for (const ficha of fichas) {
      if (ficha.eliminado) {
        tx.delete(activosLocal).where(eq(activosLocal.id, ficha.id)).run();
        continue;
      }
      const fila = aFilaLocal(ficha);
      tx.insert(activosLocal)
        .values(fila)
        .onConflictDoUpdate({ target: activosLocal.id, set: fila })
        .run();
    }
  });

  const nuevoCursor = mayorCursor(fichas);
  if (nuevoCursor && nuevoCursor > cursor) await guardarCursorActivos(nuevoCursor);
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
  codigoAnterior: string;
  nombre: string;
  categoria: string;
  ubicacionSede: string | null;
  estado: EstadoAuditoria;
  ultimoAuditor: string | null;
  sinSincronizar: boolean;
}

/**
 * La pantalla solo puede mostrar unas decenas de filas: traer más de este
 * tope no aporta nada y materializar el inventario completo (miles de filas)
 * como objetos JS en cada búsqueda era una de las causas de los ANR.
 */
const LIMITE_LISTA = 200;

export async function listarActivosLocal(q?: string): Promise<ActivoLocalConEstado[]> {
  const filtro = q?.trim().toLowerCase();
  // % y _ son comodines de LIKE: se escapan para que buscar "100%" no
  // se comporte como "empieza por 100".
  const patron = filtro ? `%${filtro.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;

  const activos = await db
    .select()
    .from(activosLocal)
    .where(
      patron
        ? or(
            sql`lower(${activosLocal.codigoAnterior}) LIKE ${patron} ESCAPE '\\'`,
            sql`lower(coalesce(${activosLocal.codigoNuevo}, '')) LIKE ${patron} ESCAPE '\\'`,
            sql`lower(${activosLocal.nombre}) LIKE ${patron} ESCAPE '\\'`,
            sql`lower(coalesce(${activosLocal.ubicacionSede}, '')) LIKE ${patron} ESCAPE '\\'`,
          )
        : undefined,
    )
    .orderBy(asc(activosLocal.codigoAnterior))
    .limit(LIMITE_LISTA);

  // La cola de pendientes es pequeña (lo capturado sin sincronizar) —
  // cargarla completa sigue siendo barato.
  const pendientes = await db.select().from(colaRegistros).where(eq(colaRegistros.synced, 0));
  const pendientePorActivo = new Map<string, (typeof pendientes)[number]>();
  for (const p of pendientes) {
    if (!p.activoId) continue;
    const actual = pendientePorActivo.get(p.activoId);
    if (!actual || p.createdAt > actual.createdAt) pendientePorActivo.set(p.activoId, p);
  }

  return activos.map((a) => {
    const pendiente = pendientePorActivo.get(a.id);
    return {
      id: a.id,
      codigoAnterior: a.codigoAnterior,
      nombre: a.nombre,
      categoria: a.categoria,
      ubicacionSede: a.ubicacionSede,
      estado: (pendiente?.estado ?? a.estadoServidor) as EstadoAuditoria,
      ultimoAuditor: a.ultimoAuditorServidor,
      sinSincronizar: !!pendiente,
    };
  });
}

export async function obtenerActivoLocal(activoId: string) {
  const [activo] = await db.select().from(activosLocal).where(eq(activosLocal.id, activoId));
  if (!activo) return null;
  const pendiente = await ultimaPendientePorActivo(activoId);
  return { activo, estadoEfectivo: (pendiente?.estado ?? activo.estadoServidor) as EstadoAuditoria };
}

/** El código físico pegado en el activo puede ser el anterior o el nuevo — busca por cualquiera de los dos. */
export async function buscarActivoLocalPorCodigo(codigo: string) {
  const [activo] = await db
    .select()
    .from(activosLocal)
    .where(or(eq(activosLocal.codigoAnterior, codigo), eq(activosLocal.codigoNuevo, codigo)));
  return activo ?? null;
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
  // Conteo base por estado del servidor con GROUP BY (una pasada en el motor
  // de SQLite) — antes esto cargaba y ORDENABA el inventario completo en JS
  // solo para contar, en cada invalidación (o sea, en cada guardado).
  const conteos = await db
    .select({ estado: activosLocal.estadoServidor, n: sql<number>`count(*)` })
    .from(activosLocal)
    .groupBy(activosLocal.estadoServidor);

  const porEstado = new Map<string, number>();
  for (const c of conteos) porEstado.set(c.estado, c.n);

  // Corrección por mutaciones locales sin sincronizar: para esos activos el
  // estado efectivo es el de la cola (la última por activo), no el del
  // servidor. Son pocas filas, ajustarlas una a una es barato.
  const pendientesCola = await db.select().from(colaRegistros).where(eq(colaRegistros.synced, 0));

  const ultimaPorActivo = new Map<string, (typeof pendientesCola)[number]>();
  let noRegistrados = 0;
  for (const p of pendientesCola) {
    if (!p.activoId) {
      if (p.estado === 'NO_REGISTRADO') noRegistrados++;
      continue;
    }
    const actual = ultimaPorActivo.get(p.activoId);
    if (!actual || p.createdAt > actual.createdAt) ultimaPorActivo.set(p.activoId, p);
  }

  if (ultimaPorActivo.size > 0) {
    const filas = await db
      .select({ id: activosLocal.id, estadoServidor: activosLocal.estadoServidor })
      .from(activosLocal)
      .where(inArray(activosLocal.id, [...ultimaPorActivo.keys()]));
    for (const fila of filas) {
      const efectivo = ultimaPorActivo.get(fila.id)!.estado;
      if (efectivo !== fila.estadoServidor) {
        porEstado.set(fila.estadoServidor, (porEstado.get(fila.estadoServidor) ?? 1) - 1);
        porEstado.set(efectivo, (porEstado.get(efectivo) ?? 0) + 1);
      }
    }
  }

  const total = [...porEstado.values()].reduce((a, b) => a + b, 0);
  const pendientes = porEstado.get('PENDIENTE') ?? 0;

  return {
    total,
    pendientes,
    auditados: porEstado.get('AUDITADO') ?? 0,
    diferencias: porEstado.get('DIFERENCIA') ?? 0,
    faltantes: porEstado.get('FALTANTE') ?? 0,
    noRegistrados,
    pct: total > 0 ? (total - pendientes) / total : 0,
  };
}

export async function contarPendientesSync(): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)` })
    .from(colaRegistros)
    .where(eq(colaRegistros.synced, 0));
  return fila?.n ?? 0;
}
