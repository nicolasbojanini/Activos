import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type {
  ActualizarUsuarioInput,
  AsignarProyectoInput,
  CrearUsuarioInput,
} from '@adn/shared';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { TenantClientRegistryService } from '../prisma/tenant-client-registry.service';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly control: ControlPrismaService,
    private readonly tenants: TenantClientRegistryService,
  ) {}

  findAll() {
    return this.control.usuario.findMany({
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        createdAt: true,
      },
    });
  }

  async crear(dto: CrearUsuarioInput) {
    const existente = await this.control.usuario.findUnique({
      where: { email: dto.email },
    });
    if (existente) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const passwordHash = await argon2.hash(dto.password);
    const usuario = await this.control.usuario.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        rol: dto.rol,
        passwordHash,
      },
    });

    return this.toUsuarioOutput(usuario);
  }

  async actualizar(id: string, dto: ActualizarUsuarioInput) {
    const data: { activo?: boolean; passwordHash?: string } = {};
    if (dto.activo !== undefined) data.activo = dto.activo;
    if (dto.password) data.passwordHash = await argon2.hash(dto.password);

    const usuario = await this.control.usuario.update({
      where: { id },
      data,
    });
    return this.toUsuarioOutput(usuario);
  }

  private toUsuarioOutput(usuario: {
    id: string;
    nombre: string;
    email: string;
    rol: string;
    activo: boolean;
    createdAt: Date;
  }) {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo,
      createdAt: usuario.createdAt,
    };
  }

  async listarAsignaciones(usuarioId: string) {
    return this.control.asignacionProyecto.findMany({
      where: { usuarioId },
      include: { cliente: { select: { id: true, nombre: true } } },
    });
  }

  /** Un usuario tiene a lo sumo una asignación activa a la vez (ver asignarProyecto). */
  async miAsignacion(usuarioId: string) {
    return this.control.asignacionProyecto.findFirst({
      where: { usuarioId },
      include: { cliente: { select: { id: true, nombre: true } } },
    });
  }

  /**
   * Un auditor solo tiene UN proyecto activo a la vez en todo el sistema:
   * asignarlo a un proyecto nuevo reemplaza automáticamente cualquier
   * asignación anterior (sin importar el cliente). Valida además que el
   * proyectoId realmente exista en la base de datos tenant del cliente —
   * como no hay FK real entre bases de datos distintas, esta es la única
   * forma de evitar asignaciones a proyectos inexistentes por error de tipeo.
   */
  async asignarProyecto(dto: AsignarProyectoInput) {
    const usuario = await this.control.usuario.findUnique({
      where: { id: dto.usuarioId },
    });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const tenantPrisma = await this.tenants.getClient(dto.clienteId);
    const proyecto = await tenantPrisma.proyectoAuditoria.findUnique({
      where: { id: dto.proyectoId },
    });
    if (!proyecto) {
      throw new BadRequestException(
        'El proyecto no existe en la base de datos de ese cliente',
      );
    }

    const [, asignacion] = await this.control.$transaction([
      this.control.asignacionProyecto.deleteMany({
        where: { usuarioId: dto.usuarioId },
      }),
      this.control.asignacionProyecto.create({ data: dto }),
    ]);

    return asignacion;
  }

  async quitarAsignacion(asignacionId: string) {
    await this.control.asignacionProyecto.delete({
      where: { id: asignacionId },
    });
  }
}
