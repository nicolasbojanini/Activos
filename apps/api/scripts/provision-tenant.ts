import { randomUUID } from 'node:crypto';
import type { PrismaClient as ControlPrismaClient } from '../generated/control-client';
import {
  buildTenantUrl,
  createTenantDatabase,
  runTenantMigrations,
} from './db-admin';

export interface ProvisionTenantInput {
  nombre: string;
  nit?: string | null;
}

/**
 * Da de alta un cliente nuevo: crea la fila `Cliente`, crea su base de datos
 * física, corre las migraciones del schema tenant contra ella, y marca el
 * cliente como ACTIVO. Se ejecuta de forma síncrona dentro del request HTTP
 * que la dispara (POST /clientes, solo ADN_ADMIN) — una base de datos vacía
 * migra en segundos, no hace falta una cola de trabajos para esto.
 *
 * Tipado contra el PrismaClient generado (no contra ControlPrismaService de
 * NestJS) para poder reutilizarse tanto desde el módulo Clientes como desde
 * scripts standalone (seed, migrate-all-tenants) sin necesitar un contexto
 * de Nest.
 */
export async function provisionTenant(
  control: ControlPrismaClient,
  input: ProvisionTenantInput,
): Promise<{ clienteId: string }> {
  const dbName = `adn_tenant_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

  // El schema por defecto asume "localhost:5432" (desarrollo local contra el
  // Postgres de docker-compose). En cualquier entorno donde el Postgres real
  // no viva en localhost (Railway, etc.) hay que decírselo explícitamente —
  // si no, cada cliente nuevo queda con una URL de tenant inalcanzable.
  const cliente = await control.cliente.create({
    data: {
      nombre: input.nombre,
      nit: input.nit ?? null,
      dbName,
      dbHost: process.env.TENANT_DB_HOST ?? 'localhost',
      dbPort: process.env.TENANT_DB_PORT
        ? Number(process.env.TENANT_DB_PORT)
        : 5432,
      estado: 'PROVISIONANDO',
    },
  });

  try {
    await createTenantDatabase(dbName);
    const url = buildTenantUrl(cliente);
    runTenantMigrations(url);
    await control.cliente.update({
      where: { id: cliente.id },
      data: { estado: 'ACTIVO' },
    });
  } catch (err) {
    await control.cliente.update({
      where: { id: cliente.id },
      data: { estado: 'SUSPENDIDO' },
    });
    throw err;
  }

  return { clienteId: cliente.id };
}
