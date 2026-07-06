import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaClient as TenantPrismaClient } from '../../../generated/tenant-client';

export const TenantPrisma = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantPrismaClient => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { tenantPrisma: TenantPrismaClient }>();
    return request.tenantPrisma;
  },
);

/** Proyectos permitidos para el AUDITOR de esta request (undefined para COORDINADOR/ADN_ADMIN: sin restricción). */
export const AsignacionProyectoIds = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string[] | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { asignacionProyectoIds?: string[] }>();
    return request.asignacionProyectoIds;
  },
);
