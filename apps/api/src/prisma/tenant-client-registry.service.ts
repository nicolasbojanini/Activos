import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';
import { ControlPrismaService } from './control-prisma.service';

/**
 * Cachea un PrismaClient por cliente (tenant) en memoria — sin desalojo por
 * ahora. A esta escala (decenas de clientes, no miles) es suficiente; si el
 * número de clientes crece lo bastante como para acercarse al límite de
 * conexiones de Postgres, este es el lugar para agregar un límite LRU con
 * `$disconnect()` para los menos usados.
 */
@Injectable()
export class TenantClientRegistryService implements OnModuleDestroy {
  private readonly clients = new Map<string, TenantPrismaClient>();

  constructor(
    private readonly control: ControlPrismaService,
    private readonly config: ConfigService,
  ) {}

  async getClient(clienteId: string): Promise<TenantPrismaClient> {
    const cached = this.clients.get(clienteId);
    if (cached) return cached;

    const cliente = await this.control.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente || cliente.estado !== 'ACTIVO') {
      throw new InternalServerErrorException('Cliente no disponible');
    }

    const url = this.buildConnectionUrl(cliente);
    const client = new TenantPrismaClient({ datasourceUrl: url });
    await client.$connect();
    this.clients.set(clienteId, client);
    return client;
  }

  /**
   * Saca (y desconecta) el cliente cacheado de un tenant — necesario al
   * suspender/eliminar un Cliente, porque el cache solo revalida `estado`
   * en un cache miss. Sin esto, un tenant recién suspendido seguiría siendo
   * accesible mientras su conexión siga cacheada en memoria.
   */
  async evict(clienteId: string): Promise<void> {
    const client = this.clients.get(clienteId);
    if (!client) return;
    this.clients.delete(clienteId);
    await client.$disconnect();
  }

  private buildConnectionUrl(cliente: {
    dbHost: string;
    dbPort: number;
    dbName: string;
  }): string {
    const user = this.config.getOrThrow<string>('TENANT_DB_USER');
    const password = this.config.getOrThrow<string>('TENANT_DB_PASSWORD');
    return `postgresql://${user}:${password}@${cliente.dbHost}:${cliente.dbPort}/${cliente.dbName}?schema=public&connect_timeout=5`;
  }

  async onModuleDestroy() {
    await Promise.all(
      [...this.clients.values()].map((client) => client.$disconnect()),
    );
  }
}
