import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RegistroAuditoriaInput } from '@adn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProyectosService } from '../proyectos/proyectos.service';

@Injectable()
export class RegistrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proyectosService: ProyectosService,
  ) {}

  /**
   * Idempotente por clientId: un reintento de sincronización con el mismo
   * clientId nunca duplica el registro.
   */
  async crear(
    organizacionId: string,
    auditorId: string,
    dto: RegistroAuditoriaInput,
  ) {
    const existente = await this.prisma.registroAuditoria.findUnique({
      where: { clientId: dto.clientId },
      include: { fotos: true },
    });
    if (existente) {
      return { registro: existente, uploads: [] as never[] };
    }

    const proyecto = await this.proyectosService.findOne(
      organizacionId,
      dto.proyectoId,
    );

    if (!dto.activoId && dto.estado !== 'NO_REGISTRADO') {
      throw new BadRequestException(
        'activoId es obligatorio salvo para el estado NO_REGISTRADO',
      );
    }

    const activo = dto.activoId
      ? await this.prisma.activo.findFirst({
          where: { id: dto.activoId, organizacionId, deletedAt: null },
        })
      : null;
    if (dto.activoId && !activo) {
      throw new NotFoundException('Activo no encontrado');
    }

    const registro = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.registroAuditoria.create({
        data: {
          proyectoId: proyecto.id,
          activoId: dto.activoId,
          auditorId,
          estado: dto.estado,
          estadoFisico: dto.estadoFisico ?? null,
          cambios: dto.cambios
            ? (dto.cambios as Prisma.InputJsonValue)
            : undefined,
          nota: dto.nota,
          lat: dto.lat,
          lng: dto.lng,
          auditadoEn: dto.auditadoEn,
          clientId: dto.clientId,
        },
        include: { fotos: true },
      });

      if (activo) {
        await this.aplicarCambiosAActivo(tx, activo.id, dto);
      }

      return creado;
    });

    return { registro, uploads: [] as never[] };
  }

  /**
   * "Last-write-wins" a nivel de campo sobre el Activo: la ficha siempre
   * refleja el último valor conocido, mientras que el RegistroAuditoria
   * preserva la historia completa e inmutable de cada captura.
   */
  private async aplicarCambiosAActivo(
    tx: Prisma.TransactionClient,
    activoId: string,
    dto: RegistroAuditoriaInput,
  ) {
    const data: Prisma.ActivoUpdateInput = {};

    if (dto.estadoFisico) {
      data.estadoFisico = dto.estadoFisico;
    }

    if (dto.cambios) {
      for (const [campo, diff] of Object.entries(dto.cambios)) {
        const despues = (diff as { despues?: unknown }).despues;
        if (campo === 'ubicacionId') {
          data.ubicacion = despues
            ? { connect: { id: despues as string } }
            : { disconnect: true };
        } else if (campo === 'responsable' || campo === 'centroCosto') {
          data[campo] = (despues as string) ?? null;
        }
      }
    }

    if (Object.keys(data).length > 0) {
      await tx.activo.update({ where: { id: activoId }, data });
    }
  }
}
