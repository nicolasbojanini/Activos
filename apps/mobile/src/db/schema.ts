import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Espejo local de solo lectura de los activos del proyecto (descargado al iniciar sesión). */
export const activosLocal = sqliteTable('activos_local', {
  id: text('id').primaryKey(),
  codigoNuevo: text('codigo_nuevo').notNull(),
  codigoAnterior: text('codigo_anterior'),
  codigoControl: text('codigo_control'),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  categoria: text('categoria').notNull(),
  color: text('color'),
  medidas: text('medidas'),
  capacidad: text('capacidad'),
  marca: text('marca'),
  modelo: text('modelo'),
  serie: text('serie'),
  ubicacionId: text('ubicacion_id'),
  ubicacionSede: text('ubicacion_sede'),
  responsable: text('responsable'),
  centroCosto: text('centro_costo'),
  estadoFisico: text('estado_fisico').notNull(),
  fechaAdquisicion: text('fecha_adquisicion'),
  valorLibros: text('valor_libros'),
  proveedor: text('proveedor'),
  vidaUtilMeses: integer('vida_util_meses'),
  /** JSON de {[campoPersonalizadoId]: valor}, espejo de Activo.camposPersonalizados. */
  camposPersonalizadosJson: text('campos_personalizados_json'),
  estadoServidor: text('estado_servidor').notNull(),
  ultimoAuditorServidor: text('ultimo_auditor_servidor'),
});

/** Espejo local de sedes/ubicaciones de la organización. */
export const ubicacionesLocal = sqliteTable('ubicaciones_local', {
  id: text('id').primaryKey(),
  codigo: text('codigo').notNull(),
  sede: text('sede').notNull(),
  detalle: text('detalle'),
});

/**
 * Cola de mutaciones pendientes: cada acción del auditor (confirmar, actualizar,
 * diferencia, faltante, no registrado) se guarda aquí primero. `synced = 0`
 * mientras no se haya confirmado contra el servidor; el clientId hace la
 * sincronización idempotente y segura de reintentar.
 */
export const colaRegistros = sqliteTable('cola_registros', {
  clientId: text('client_id').primaryKey(),
  proyectoId: text('proyecto_id').notNull(),
  activoId: text('activo_id'),
  codigoNuevoSnapshot: text('codigo_nuevo_snapshot'),
  nombreSnapshot: text('nombre_snapshot'),
  estado: text('estado').notNull(),
  estadoFisico: text('estado_fisico'),
  cambiosJson: text('cambios_json'),
  nota: text('nota'),
  lat: integer('lat'),
  lng: integer('lng'),
  auditadoEn: text('auditado_en').notNull(),
  fotosJson: text('fotos_json').notNull().default('[]'),
  synced: integer('synced').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

/** Pares clave/valor para estado de la sesión offline (última sincronización, proyecto activo, etc). */
export const metaSesion = sqliteTable('meta_sesion', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});
