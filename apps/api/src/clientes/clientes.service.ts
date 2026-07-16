import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActualizarClienteInput, CrearClienteInput } from '@adn/shared';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { TenantClientRegistryService } from '../prisma/tenant-client-registry.service';
import { provisionTenant } from '../../scripts/provision-tenant';
import { dropTenantDatabase } from '../../scripts/db-admin';

@Injectable()
export class ClientesService {
  constructor(
    private readonly control: ControlPrismaService,
    private readonly tenants: TenantClientRegistryService,
  ) {}

  findAll() {
    return this.control.cliente.findMany({ orderBy: { nombre: 'asc' } });
  }

  async crear(dto: CrearClienteInput) {
    const { clienteId } = await provisionTenant(this.control, dto);
    return this.control.cliente.findUniqueOrThrow({ where: { id: clienteId } });
  }

  /**
   * ACTIVO → SUSPENDIDO bloquea el acceso de inmediato (no requiere cambio en
   * ningún otro lado: TenantClientRegistryService ya rechaza tenants que no
   * estén ACTIVO) pero conserva la base de datos física como respaldo — el
   * primer paso del flujo de baja de un cliente. SUSPENDIDO → ACTIVO reabre
   * el acceso, por si se suspendió por error.
   */
  async actualizarEstado(clienteId: string, dto: ActualizarClienteInput) {
    const cliente = await this.control.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    if (cliente.estado === 'PROVISIONANDO') {
      throw new BadRequestException(
        'El cliente todavía se está aprovisionando',
      );
    }

    const actualizado = await this.control.cliente.update({
      where: { id: clienteId },
      data: { estado: dto.estado },
    });

    // Saca la conexión cacheada para que el cambio de estado surta efecto de inmediato.
    await this.tenants.evict(clienteId);

    return actualizado;
  }

  /**
   * Elimina PERMANENTEMENTE la base de datos física de un cliente. Irreversible.
   * Solo permitido si el cliente ya está SUSPENDIDO (paso previo obligatorio),
   * como red de seguridad para no borrar por error un cliente en uso.
   */
  async eliminar(clienteId: string): Promise<void> {
    const cliente = await this.control.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    if (cliente.estado !== 'SUSPENDIDO') {
      throw new BadRequestException(
        'Solo se puede eliminar un cliente que ya esté suspendido — suspéndelo primero',
      );
    }

    await this.tenants.evict(clienteId);
    await dropTenantDatabase(cliente.dbName);

    await this.control.$transaction([
      this.control.asignacionProyecto.deleteMany({ where: { clienteId } }),
      // Sin esto, Postgres rechaza el delete de Cliente por la FK obligatoria
      // (RESTRICT) apenas el cliente tiene alguna configuración de campos
      // guardada — que hoy es casi siempre, ya que "Guardar configuración"
      // crea filas incluso para dejar un campo en su valor por defecto.
      this.control.configuracionCampo.deleteMany({ where: { clienteId } }),
      this.control.campoPersonalizado.deleteMany({ where: { clienteId } }),
      this.control.cliente.delete({ where: { id: clienteId } }),
    ]);
  }
}
