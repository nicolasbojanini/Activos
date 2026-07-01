import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ActivoDetailOutput,
  ActivoListItemOutput,
  ListActivosQuery,
  PaginatedOutput,
} from '@adn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProyectosService } from '../proyectos/proyectos.service';

@Injectable()
export class ActivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proyectosService: ProyectosService,
  ) {}

  async findAll(
    organizacionId: string,
    query: ListActivosQuery,
  ): Promise<PaginatedOutput<ActivoListItemOutput>> {
    const proyecto = await this.proyectosService.findOne(
      organizacionId,
      query.proyectoId,
    );
    const ultimoPorActivo = await this.proyectosService.ultimoRegistroPorActivo(
      proyecto.id,
    );

    const where: Prisma.ActivoWhereInput = {
      organizacionId,
      deletedAt: null,
    };

    if (query.q) {
      where.OR = [
        { placa: { contains: query.q, mode: 'insensitive' } },
        { nombre: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.ubicacion) {
      where.ubicacionId = query.ubicacion;
    }

    if (query.estado) {
      if (query.estado === 'PENDIENTE') {
        where.id = { notIn: [...ultimoPorActivo.keys()] };
      } else if (query.estado !== 'NO_REGISTRADO') {
        where.id = {
          in: [...ultimoPorActivo.entries()]
            .filter(([, r]) => r.estado === query.estado)
            .map(([id]) => id),
        };
      }
    }

    const [total, activos] = await Promise.all([
      this.prisma.activo.count({ where }),
      this.prisma.activo.findMany({
        where,
        include: { ubicacion: true },
        orderBy: { placa: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const data: ActivoListItemOutput[] = activos.map((activo) => {
      const registro = ultimoPorActivo.get(activo.id);
      return {
        id: activo.id,
        placa: activo.placa,
        nombre: activo.nombre,
        categoria: activo.categoria,
        ubicacion: activo.ubicacion
          ? {
              id: activo.ubicacion.id,
              sede: activo.ubicacion.sede,
              detalle: activo.ubicacion.detalle,
            }
          : null,
        estado: registro?.estado ?? 'PENDIENTE',
        ultimoAuditor: registro?.auditor.nombre ?? null,
      };
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(
    organizacionId: string,
    id: string,
  ): Promise<ActivoDetailOutput> {
    const activo = await this.prisma.activo.findFirst({
      where: { id, organizacionId, deletedAt: null },
      include: { ubicacion: true },
    });
    if (!activo) {
      throw new NotFoundException('Activo no encontrado');
    }
    return this.toDetailOutput(activo);
  }

  async buscarPorCodigoQR(
    organizacionId: string,
    codigoQR: string,
  ): Promise<ActivoDetailOutput> {
    const activo = await this.prisma.activo.findFirst({
      where: { organizacionId, codigoQR, deletedAt: null },
      include: { ubicacion: true },
    });
    if (!activo) {
      throw new NotFoundException('No se encontró un activo con ese código QR');
    }
    return this.toDetailOutput(activo);
  }

  private async toDetailOutput(
    activo: Prisma.ActivoGetPayload<{ include: { ubicacion: true } }>,
  ): Promise<ActivoDetailOutput> {
    const ultimoRegistro = await this.prisma.registroAuditoria.findFirst({
      where: { activoId: activo.id },
      orderBy: { auditadoEn: 'desc' },
      include: { auditor: { select: { nombre: true } } },
    });

    return {
      id: activo.id,
      placa: activo.placa,
      codigoQR: activo.codigoQR,
      nombre: activo.nombre,
      categoria: activo.categoria,
      marca: activo.marca,
      modelo: activo.modelo,
      serie: activo.serie,
      ubicacion: activo.ubicacion
        ? {
            id: activo.ubicacion.id,
            sede: activo.ubicacion.sede,
            detalle: activo.ubicacion.detalle,
          }
        : null,
      responsable: activo.responsable,
      centroCosto: activo.centroCosto,
      estadoFisico: activo.estadoFisico,
      fechaAdquisicion: activo.fechaAdquisicion?.toISOString() ?? null,
      valorLibros: activo.valorLibros?.toString() ?? null,
      proveedor: activo.proveedor,
      vidaUtilMeses: activo.vidaUtilMeses,
      estado: ultimoRegistro?.estado ?? 'PENDIENTE',
      ultimoAuditor: ultimoRegistro?.auditor.nombre ?? null,
    };
  }
}
