import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * Crea una base de datos Postgres nueva para un tenant, vía una conexión de
 * mantenimiento (POSTGRES_ADMIN_URL, normalmente apunta a la base `postgres`
 * por defecto). Postgres no permite parametrizar el nombre en CREATE DATABASE
 * ni ejecutarlo dentro de una transacción — por eso `dbName` DEBE venir
 * siempre generado por nuestro propio código (nunca texto libre de un
 * usuario) antes de interpolarlo en el SQL.
 */
export async function createTenantDatabase(dbName: string): Promise<void> {
  const client = new Client({
    connectionString: process.env.POSTGRES_ADMIN_URL,
  });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
}

/**
 * Borra permanentemente la base de datos física de un tenant. Irreversible.
 * `WITH (FORCE)` (Postgres 13+) corta cualquier conexión activa a esa base
 * antes de borrarla — sin esto, DROP DATABASE falla si el
 * TenantClientRegistryService (u otra sesión) sigue conectado.
 */
export async function dropTenantDatabase(dbName: string): Promise<void> {
  const client = new Client({
    connectionString: process.env.POSTGRES_ADMIN_URL,
  });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

/** Corre `prisma migrate deploy` del schema tenant contra una base de datos específica. */
export function runTenantMigrations(databaseUrl: string): void {
  execFileSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema', 'prisma/tenant/schema.prisma'],
    {
      cwd: `${__dirname}/..`,
      env: { ...process.env, TENANT_DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    },
  );
}

export function buildTenantUrl(cliente: {
  dbHost: string;
  dbPort: number;
  dbName: string;
}): string {
  const user = process.env.TENANT_DB_USER;
  const password = process.env.TENANT_DB_PASSWORD;
  return `postgresql://${user}:${password}@${cliente.dbHost}:${cliente.dbPort}/${cliente.dbName}?schema=public`;
}
