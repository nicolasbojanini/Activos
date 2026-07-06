import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CrearUbicacionInput, UbicacionOutput } from '@adn/shared';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';

@Injectable()
export class UbicacionesService {
  async findAll(tenantPrisma: TenantPrismaClient): Promise<UbicacionOutput[]> {
    const ubicaciones = await tenantPrisma.ubicacion.findMany({
      orderBy: { sede: 'asc' },
    });
    return ubicaciones.map((u) => ({
      id: u.id,
      codigo: u.codigo,
      sede: u.sede,
      detalle: u.detalle,
    }));
  }

  async buscarPorCodigo(
    tenantPrisma: TenantPrismaClient,
    codigo: string,
  ): Promise<UbicacionOutput> {
    const ubicacion = await tenantPrisma.ubicacion.findFirst({
      where: { codigo },
    });
    if (!ubicacion) {
      throw new NotFoundException(
        'No se encontró una ubicación con ese código',
      );
    }
    return {
      id: ubicacion.id,
      codigo: ubicacion.codigo,
      sede: ubicacion.sede,
      detalle: ubicacion.detalle,
    };
  }

  /**
   * Alta de una ubicación nueva con un código ya escaneado en campo (sin
   * coincidencia previa) — el auditor aporta el nombre de la sede.
   */
  async crear(
    tenantPrisma: TenantPrismaClient,
    dto: CrearUbicacionInput,
  ): Promise<UbicacionOutput> {
    const existente = await tenantPrisma.ubicacion.findFirst({
      where: { codigo: dto.codigo },
    });
    if (existente) {
      throw new ConflictException('Ya existe una ubicación con ese código');
    }

    const ubicacion = await tenantPrisma.ubicacion.create({
      data: {
        codigo: dto.codigo,
        sede: dto.sede,
        detalle: dto.detalle ?? null,
      },
    });
    return {
      id: ubicacion.id,
      codigo: ubicacion.codigo,
      sede: ubicacion.sede,
      detalle: ubicacion.detalle,
    };
  }
}
