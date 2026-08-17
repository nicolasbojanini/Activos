import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Espejo local de solo lectura de los activos del proyecto (descargado al iniciar sesión). */
export const activosLocal = sqliteTable('activos_local', {
  id: text('id').primaryKey(),
  codigoNuevo: text('codigo_nuevo'),
  codigoAnterior: text('codigo_anterior').notNull(),
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
  /** JSON de {[campoUbicacionId]: valor}, espejo de Activo.camposUbicacion. */
  camposUbicacionJson: text('campos_ubicacion_json'),
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
  codigoAnteriorSnapshot: text('codigo_anterior_snapshot'),
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
  // El registro (estado/campos/nota) y las fotos se confirman en pasos
  // separados: el primero es liviano y casi siempre pasa aunque la señal sea
  // débil, las fotos son pesadas y fallan mucho más seguido con la misma
  // señal. `registroSincronizado` marca el primer paso — así "pendientes"
  // puede contar solo lo que de verdad no llegó al servidor, sin mezclar
  // registros que ya están guardados pero cuyas fotos todavía se están
  // subiendo (ver contarPendientesSync/contarFotosPendientes).
  registroSincronizado: integer('registro_sincronizado').notNull().default(0),
  synced: integer('synced').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

/**
 * Borrador de una auditoría a medio llenar (ActualizarScreen), para que
 * perder el proceso no signifique perder el trabajo del auditor.
 *
 * Existe porque `launchCameraAsync` abre la cámara nativa como otra actividad
 * de Android y deja a esta app en segundo plano: en un teléfono de gama baja,
 * el Low Memory Killer la mata para darle memoria a la cámara. Eso NO es un
 * crash de JS — no hay excepción que capturar ni forma de evitarlo desde acá —
 * así que la única defensa real es que lo ya escrito sobreviva fuera de la
 * memoria del proceso (incidente Decameron, agosto 2026: auditores perdiendo
 * el formulario entero al tomar fotos, varias versiones seguidas).
 *
 * Las fotos no se copian acá: sus JPEG ya viven en disco (carpetaFotos, por
 * clientPhotoId) y sobreviven solos, así que basta con guardar su metadata.
 */
export const borradores = sqliteTable('borradores', {
  /**
   * Clave del borrador. Para una auditoría normal es el activoId; para un alta
   * (NoRegistradoScreen), que todavía no tiene activo, es `nuevo:<código
   * escaneado>` — ver claveBorradorNuevo en borrador-auditoria.ts. La columna
   * conserva el nombre original para no migrar la tabla en los equipos que ya
   * la tienen creada.
   */
  activoId: text('activo_id').primaryKey(),
  datosJson: text('datos_json').notNull(),
  actualizadoEn: text('actualizado_en').notNull(),
});

/** Pares clave/valor para estado de la sesión offline (última sincronización, proyecto activo, etc). */
export const metaSesion = sqliteTable('meta_sesion', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});
