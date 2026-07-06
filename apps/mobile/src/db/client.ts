import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

// v2: el nombre del archivo cambió al renombrar placa/codigoQR -> codigoNuevo (M11).
// Sin pipeline de migraciones, un dispositivo con la base vieja (columnas placa/codigo_qr)
// rompía el CREATE INDEX sobre la columna nueva -- bumpear el nombre fuerza un archivo
// limpio en vez de intentar alterar el esquema existente.
const sqlite = openDatabaseSync('adn-auditoria-v2.db');
export const db = drizzle(sqlite);

/**
 * Sin pipeline de migraciones de drizzle-kit dentro del runtime de Expo:
 * el esquema es simple y estable, así que se crea con DDL directo al iniciar.
 */
export function inicializarBaseLocal() {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS activos_local (
      id TEXT PRIMARY KEY,
      codigo_nuevo TEXT,
      codigo_anterior TEXT NOT NULL,
      codigo_control TEXT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      categoria TEXT NOT NULL,
      color TEXT,
      medidas TEXT,
      capacidad TEXT,
      marca TEXT,
      modelo TEXT,
      serie TEXT,
      ubicacion_id TEXT,
      ubicacion_sede TEXT,
      responsable TEXT,
      centro_costo TEXT,
      estado_fisico TEXT NOT NULL,
      fecha_adquisicion TEXT,
      valor_libros TEXT,
      proveedor TEXT,
      vida_util_meses INTEGER,
      campos_personalizados_json TEXT,
      estado_servidor TEXT NOT NULL,
      ultimo_auditor_servidor TEXT
    );

    CREATE TABLE IF NOT EXISTS ubicaciones_local (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL,
      sede TEXT NOT NULL,
      detalle TEXT
    );

    CREATE TABLE IF NOT EXISTS cola_registros (
      client_id TEXT PRIMARY KEY,
      proyecto_id TEXT NOT NULL,
      activo_id TEXT,
      codigo_anterior_snapshot TEXT,
      nombre_snapshot TEXT,
      estado TEXT NOT NULL,
      estado_fisico TEXT,
      cambios_json TEXT,
      nota TEXT,
      lat INTEGER,
      lng INTEGER,
      auditado_en TEXT NOT NULL,
      fotos_json TEXT NOT NULL DEFAULT '[]',
      synced INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta_sesion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activos_local_codigo_nuevo ON activos_local (codigo_nuevo);
    CREATE INDEX IF NOT EXISTS idx_activos_local_codigo_anterior ON activos_local (codigo_anterior);
    CREATE INDEX IF NOT EXISTS idx_cola_registros_synced ON cola_registros (synced);
  `);

  // Dispositivos con la base v2 ya instalada no tienen estas columnas nuevas
  // (CREATE TABLE IF NOT EXISTS no las agrega sobre una tabla existente). Se
  // agregan con ALTER TABLE en vez de volver a bumpear el nombre del archivo,
  // porque eso borraría cola_registros y con ella cualquier auditoría
  // capturada offline que el dispositivo todavía no haya sincronizado.
  //
  // codigo_nuevo sigue siendo NOT NULL en esas instalaciones viejas (SQLite no
  // permite quitar un NOT NULL con ALTER TABLE) — como este espejo se
  // descarga entero de nuevo en cada sesión, el insert en sync.ts nunca le
  // manda null a esa columna, así que la restricción vieja queda inofensiva.
  for (const columna of [
    'codigo_anterior TEXT',
    'codigo_control TEXT',
    'descripcion TEXT',
    'color TEXT',
    'medidas TEXT',
    'capacidad TEXT',
    'campos_personalizados_json TEXT',
  ]) {
    try {
      sqlite.execSync(`ALTER TABLE activos_local ADD COLUMN ${columna};`);
    } catch {
      // La columna ya existe (instalación nueva que la creó en el CREATE TABLE de arriba).
    }
  }

  try {
    sqlite.execSync(`ALTER TABLE cola_registros ADD COLUMN codigo_anterior_snapshot TEXT;`);
  } catch {
    // La columna ya existe (instalación nueva que la creó en el CREATE TABLE de arriba).
  }
}
