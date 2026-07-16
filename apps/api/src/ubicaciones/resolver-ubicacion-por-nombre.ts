import { randomBytes } from 'node:crypto';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';

/**
 * Acepta tanto el cliente tenant de nivel superior como un `Prisma.TransactionClient`
 * (mismo delegate `.ubicacion`, estructuralmente compatible) — se usa desde
 * imports.service.ts (fuera de transacción) y desde registros.service.ts
 * (dentro de la transacción de `crear()`).
 */
type ClienteConUbicacion = Pick<TenantPrismaClient, 'ubicacion'>;

async function generarCodigoUbicacionUnico(
  tenantPrisma: ClienteConUbicacion,
): Promise<string> {
  for (let intento = 0; intento < 5; intento++) {
    const candidato = `UBI-${randomBytes(4).toString('hex').toUpperCase()}`;
    const existe = await tenantPrisma.ubicacion.findFirst({
      where: { codigo: candidato },
    });
    if (!existe) return candidato;
  }
  throw new Error('No se pudo generar un código único de ubicación');
}

/**
 * Find-or-create de una Ubicacion por nombre de sede (case-insensitive),
 * generándole un código interno si hay que crearla — usado tanto por la
 * importación de Excel (columna "ubicación" con texto libre) como por el
 * registro de auditoría móvil (ubicación activa escrita a mano, sin
 * escaneo ni validación previa contra la base). Devuelve el id de la
 * Ubicacion, listo para `connect`.
 */
export async function resolverUbicacionIdPorNombre(
  tenantPrisma: ClienteConUbicacion,
  sede: string,
): Promise<string> {
  const nombre = sede.trim();
  const existente = await tenantPrisma.ubicacion.findFirst({
    where: { sede: { equals: nombre, mode: 'insensitive' } },
  });
  if (existente) return existente.id;

  const creada = await tenantPrisma.ubicacion.create({
    data: {
      sede: nombre,
      codigo: await generarCodigoUbicacionUnico(tenantPrisma),
    },
  });
  return creada.id;
}
