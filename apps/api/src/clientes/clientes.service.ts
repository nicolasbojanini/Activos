import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ActualizarClienteInput, CrearClienteInput } from '@adn/shared';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { TenantClientRegistryService } from '../prisma/tenant-client-registry.service';
import { S3Service } from '../files/s3.service';
import { provisionTenant } from '../../scripts/provision-tenant';
import { dropTenantDatabase } from '../../scripts/db-admin';

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);

  constructor(
    private readonly control: ControlPrismaService,
    private readonly tenants: TenantClientRegistryService,
    private readonly s3: S3Service,
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
   * Borra de MinIO todas las fotos de un cliente. Las claves
   * (`fotos/{clientId}/{clientPhotoId}.jpg`) no llevan ningún prefijo del
   * cliente, así que la única forma de saber cuáles son suyas es la tabla Foto
   * de su base — por eso esto tiene que correr ANTES de dropear esa base. Cada
   * foto declarada por un registro tiene su fila Foto (con `s3Key`) desde que
   * el registro se crea, esté o no confirmada la subida, así que la lista cubre
   * también las subidas a medias.
   *
   * Lee de a 1.000 filas con cursor para no cargar un cliente grande entero en
   * memoria; borrar una clave inexistente no es error, así que un reintento
   * tras una falla a medias es seguro.
   */
  private async eliminarFotosDeCliente(cliente: {
    id: string;
    dbHost: string;
    dbPort: number;
    dbName: string;
  }): Promise<number> {
    return this.tenants.conClienteDeMantenimiento(cliente, async (tenant) => {
      let total = 0;
      let cursor: string | undefined;
      for (;;) {
        const fotos = await tenant.foto.findMany({
          select: { id: true, s3Key: true },
          orderBy: { id: 'asc' },
          take: 1000,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (fotos.length === 0) break;
        await this.s3.eliminarObjetos(fotos.map((foto) => foto.s3Key));
        total += fotos.length;
        cursor = fotos[fotos.length - 1].id;
      }
      return total;
    });
  }

  /**
   * Elimina PERMANENTEMENTE un cliente: sus fotos en MinIO y su base de datos
   * física. Irreversible. Solo permitido si el cliente ya está SUSPENDIDO (paso
   * previo obligatorio), como red de seguridad para no borrar por error un
   * cliente en uso.
   *
   * Orden deliberado: primero las fotos, después la base. La base es el único
   * índice de qué objetos de MinIO son de este cliente; si se dropeara primero y
   * el borrado de fotos fallara, esas fotos quedarían huérfanas para siempre
   * (así se llenó el volumen de MinIO antes de este cambio). Si algo falla acá,
   * se aborta SIN tocar la base y se puede reintentar.
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

    try {
      const fotos = await this.eliminarFotosDeCliente(cliente);
      this.logger.log(
        `Cliente ${cliente.nombre} (${clienteId}): ${fotos} fotos borradas de MinIO`,
      );
    } catch (err) {
      this.logger.error(
        `No se pudieron borrar las fotos del cliente ${clienteId} en MinIO; se aborta sin borrar su base de datos: ${String(err)}`,
      );
      throw new InternalServerErrorException(
        'No se pudieron borrar las fotos del cliente en el almacenamiento. No se borró nada más — intenta de nuevo.',
      );
    }

    await dropTenantDatabase(cliente.dbName);

    await this.control.$transaction([
      this.control.asignacionProyecto.deleteMany({ where: { clienteId } }),
      // Sin esto, Postgres rechaza el delete de Cliente por la FK obligatoria
      // (RESTRICT) apenas el cliente tiene alguna configuración de campos
      // guardada — que hoy es casi siempre, ya que "Guardar configuración"
      // crea filas incluso para dejar un campo en su valor por defecto.
      this.control.configuracionCampo.deleteMany({ where: { clienteId } }),
      this.control.campoPersonalizado.deleteMany({ where: { clienteId } }),
      // Misma FK obligatoria que las dos anteriores — toda tabla nueva con
      // clienteId hacia Cliente tiene que sumarse acá o vuelve a romper el
      // borrado (pasó una vez con configuracionCampo/campoPersonalizado, y
      // de nuevo acá al agregar campoUbicacion sin acordarse de este método).
      this.control.campoUbicacion.deleteMany({ where: { clienteId } }),
      this.control.cliente.delete({ where: { id: clienteId } }),
    ]);
  }
}
