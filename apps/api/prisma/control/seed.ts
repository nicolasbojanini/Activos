import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient as ControlPrismaClient } from '../../generated/control-client';
import { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';
import { provisionTenant } from '../../scripts/provision-tenant';
import { buildTenantUrl } from '../../scripts/db-admin';
import { seedTenant } from '../tenant/seed';

const control = new ControlPrismaClient();

/**
 * Sin SEED_DEMO_DATA=true (el caso de producción), solo crea el primer
 * ADN_ADMIN — con ADMIN_EMAIL/ADMIN_PASSWORD si vienen del entorno, para no
 * dejar la contraseña de demo (`adn12345`) activa en una base de datos real.
 * Con SEED_DEMO_DATA=true (uso local) además crea coordinador/auditor de
 * prueba y un cliente "Comercial Andina S.A.S." con datos de ejemplo, igual
 * que antes.
 */
async function main() {
  const conDatosDemo = process.env.SEED_DEMO_DATA === 'true';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@adn.demo';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'adn12345';
  const passwordHash = await argon2.hash(adminPassword);

  const admin = await control.usuario.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      nombre: process.env.ADMIN_NOMBRE ?? 'Admin ADN',
      email: adminEmail,
      passwordHash,
      rol: 'ADN_ADMIN',
    },
  });

  if (!conDatosDemo) {
    console.log('Seed completo (solo admin, sin datos de demo):', {
      admin: admin.email,
    });
    return;
  }

  const passwordHashDemo = await argon2.hash('adn12345');
  const coordinador = await control.usuario.upsert({
    where: { email: 'coordinador@adn.demo' },
    update: {},
    create: {
      nombre: 'Camila Restrepo',
      email: 'coordinador@adn.demo',
      passwordHash: passwordHashDemo,
      rol: 'COORDINADOR',
    },
  });

  const auditor = await control.usuario.upsert({
    where: { email: 'auditor@adn.demo' },
    update: {},
    create: {
      nombre: 'Julián Restrepo',
      email: 'auditor@adn.demo',
      passwordHash: passwordHashDemo,
      rol: 'AUDITOR',
    },
  });

  let cliente = await control.cliente.findUnique({
    where: { nit: '900123456-1' },
  });

  let proyectoId: string;

  if (!cliente) {
    const { clienteId } = await provisionTenant(control, {
      nombre: 'Comercial Andina S.A.S.',
      nit: '900123456-1',
    });
    cliente = await control.cliente.findUniqueOrThrow({
      where: { id: clienteId },
    });

    const tenantPrisma = new TenantPrismaClient({
      datasourceUrl: buildTenantUrl(cliente),
    });
    const resultado = await seedTenant(tenantPrisma);
    proyectoId = resultado.proyectoId;
    await tenantPrisma.$disconnect();
  } else {
    const tenantPrisma = new TenantPrismaClient({
      datasourceUrl: buildTenantUrl(cliente),
    });
    const proyecto = await tenantPrisma.proyectoAuditoria.findFirstOrThrow();
    proyectoId = proyecto.id;
    await tenantPrisma.$disconnect();
  }

  await control.asignacionProyecto.upsert({
    where: {
      usuarioId_clienteId_proyectoId: {
        usuarioId: auditor.id,
        clienteId: cliente.id,
        proyectoId,
      },
    },
    create: { usuarioId: auditor.id, clienteId: cliente.id, proyectoId },
    update: {},
  });

  console.log('Seed completo:', {
    usuarios: [admin.email, coordinador.email, auditor.email],
    cliente: cliente.nombre,
    proyectoId,
  });
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void control.$disconnect();
  });
