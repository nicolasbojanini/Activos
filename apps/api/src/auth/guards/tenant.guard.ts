import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { Rol } from '@adn/shared';
import { ControlPrismaService } from '../../prisma/control-prisma.service';
import { TenantClientRegistryService } from '../../prisma/tenant-client-registry.service';
import type { AuthenticatedUser } from '../types/authenticated-user';

type TenantRequest = Request & {
  user: AuthenticatedUser;
  tenantPrisma: unknown;
  asignacionProyectoIds?: string[];
};

/**
 * Valida que el usuario autenticado tiene acceso al :clienteId de la ruta (y,
 * si la ruta trae :proyectoId, a ese proyecto específico), y deja el
 * PrismaClient del tenant correspondiente en `request.tenantPrisma`.
 *
 * ADN_ADMIN/COORDINADOR: siempre permitido. AUDITOR: requiere una fila en
 * AsignacionProyecto para ese usuarioId+clienteId (y proyectoId si aplica).
 * En rutas de solo-listado (sin :proyectoId) deja además
 * `request.asignacionProyectoIds` con los proyectos permitidos, para que el
 * servicio filtre el contenido de la lista — el guard solo abre/cierra la
 * puerta, no puede filtrar el contenido de una lista.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly control: ControlPrismaService,
    private readonly registry: TenantClientRegistryService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const { user, params } = request;
    const clienteId = params.clienteId as string | undefined;
    if (!clienteId) {
      throw new ForbiddenException('clienteId requerido');
    }

    if (user.rol === Rol.COORDINADOR || user.rol === Rol.ADN_ADMIN) {
      request.tenantPrisma = await this.registry.getClient(clienteId);
      return true;
    }

    const proyectoId = params.proyectoId as string | undefined;
    const asignaciones = await this.control.asignacionProyecto.findMany({
      where: {
        usuarioId: user.id,
        clienteId,
        ...(proyectoId ? { proyectoId } : {}),
      },
      select: { proyectoId: true },
    });

    if (asignaciones.length === 0) {
      throw new ForbiddenException('No tienes acceso a este cliente/proyecto');
    }

    request.asignacionProyectoIds = asignaciones.map((a) => a.proyectoId);
    request.tenantPrisma = await this.registry.getClient(clienteId);
    return true;
  }
}
