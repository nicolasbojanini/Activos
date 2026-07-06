import 'dotenv/config';
import { ControlPrismaService } from '../src/prisma/control-prisma.service';
import { buildTenantUrl, runTenantMigrations } from './db-admin';

async function main() {
  const control = new ControlPrismaService();
  await control.$connect();

  const clientes = await control.cliente.findMany({
    where: { estado: 'ACTIVO' },
  });
  console.log(`Migrando ${clientes.length} base(s) de datos tenant...`);

  for (const cliente of clientes) {
    console.log(`→ ${cliente.nombre} (${cliente.dbName})`);
    runTenantMigrations(buildTenantUrl(cliente));
  }

  await control.$disconnect();
  console.log('Listo.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
