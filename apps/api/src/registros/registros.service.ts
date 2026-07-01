import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ConfirmarFotosInput, RegistroAuditoriaInput } from '@adn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProyectosService } from '../proyectos/proyectos.service';
import { S3Service } from '../files/s3.service';

export interface UploadEntry {
  clientPhotoId: string;
  uploadUrl: string;
  s3Key: string;
}

@Injectable()
export class RegistrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proyectosService: ProyectosService,
    private readonly s3: S3Service,
  ) {}

  private construirS3Key(registroId: string, clientPhotoId: string): string {
    return `fotos/${registroId}/${clientPhotoId}.jpg`;
  }

  private extraerClientPhotoId(s3Key: string): string {
    return s3Key.split('/').pop()!.replace('.jpg', '');
  }

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
      // Reintento idempotente: regenera URLs de subida solo para las fotos que aún no se confirmaron.
      const fotosPendientes = existente.fotos.filter(
        (foto) => foto.bytes === null,
      );
      const uploads: UploadEntry[] = await Promise.all(
        fotosPendientes.map(async (foto) => ({
          clientPhotoId: this.extraerClientPhotoId(foto.s3Key),
          s3Key: foto.s3Key,
          uploadUrl: await this.s3.generarUrlSubida(foto.s3Key),
        })),
      );
      return { registro: existente, uploads };
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

    const fotosConKey = dto.fotos.map((foto) => ({
      ...foto,
      s3Key: this.construirS3Key(dto.clientId, foto.clientPhotoId),
    }));

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
      });

      if (activo) {
        await this.aplicarCambiosAActivo(tx, activo.id, dto);
      }

      if (fotosConKey.length > 0) {
        await tx.foto.createMany({
          data: fotosConKey.map((foto) => ({
            registroId: creado.id,
            s3Key: foto.s3Key,
            etiqueta: foto.etiqueta,
            orden: foto.orden,
          })),
        });
      }

      return tx.registroAuditoria.findUniqueOrThrow({
        where: { id: creado.id },
        include: { fotos: true },
      });
    });

    const uploads: UploadEntry[] = await Promise.all(
      fotosConKey.map(async (foto) => ({
        clientPhotoId: foto.clientPhotoId,
        s3Key: foto.s3Key,
        uploadUrl: await this.s3.generarUrlSubida(foto.s3Key),
      })),
    );

    return { registro, uploads };
  }

  /** Confirma que las fotos ya se subieron a S3 y completa sus metadatos (ancho/alto/bytes). */
  async confirmarFotos(
    organizacionId: string,
    registroId: string,
    dto: ConfirmarFotosInput,
  ) {
    const registro = await this.prisma.registroAuditoria.findFirst({
      where: { id: registroId, proyecto: { organizacionId } },
    });
    if (!registro) {
      throw new NotFoundException('Registro no encontrado');
    }

    await Promise.all(
      dto.fotos.map((foto) =>
        this.prisma.foto.updateMany({
          where: { registroId, s3Key: foto.s3Key },
          data: { ancho: foto.ancho, alto: foto.alto, bytes: foto.bytes },
        }),
      ),
    );

    return this.prisma.foto.findMany({ where: { registroId } });
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
