import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

const sqlite = openDatabaseSync('adn-auditoria.db');
export const db = drizzle(sqlite);

/**
 * Sin pipeline de migraciones de drizzle-kit dentro del runtime de Expo:
 * el esquema es simple y estable, así que se crea con DDL directo al iniciar.
 */
export function inicializarBaseLocal() {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS activos_local (
      id TEXT PRIMARY KEY,
      placa TEXT NOT NULL,
      codigo_qr TEXT NOT NULL,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
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
      estado_servidor TEXT NOT NULL,
      ultimo_auditor_servidor TEXT
    );

    CREATE TABLE IF NOT EXISTS ubicaciones_local (
      id TEXT PRIMARY KEY,
      sede TEXT NOT NULL,
      detalle TEXT
    );

    CREATE TABLE IF NOT EXISTS cola_registros (
      client_id TEXT PRIMARY KEY,
      proyecto_id TEXT NOT NULL,
      activo_id TEXT,
      placa_snapshot TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_activos_local_codigo_qr ON activos_local (codigo_qr);
    CREATE INDEX IF NOT EXISTS idx_cola_registros_synced ON cola_registros (synced);
  `);
}
