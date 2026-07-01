import { Injectable, NotFoundException } from '@nestjs/common';
import type { ResumenProyectoOutput } from '@adn/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProyectosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizacionId: string) {
    return this.prisma.proyectoAuditoria.findMany({
      where: { organizacionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizacionId: string, id: string) {
    const proyecto = await this.prisma.proyectoAuditoria.findFirst({
      where: { id, organizacionId },
    });
    if (!proyecto) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return proyecto;
  }

  /**
   * Último RegistroAuditoria por activo dentro del proyecto (el más reciente por auditadoEn).
   * Se deduplica en memoria: a la escala de una pyme (cientos de activos) es simple y correcto,
   * evitando depender de la semántica de `distinct` + `orderBy` de Prisma entre proveedores.
   */
  async ultimoRegistroPorActivo(proyectoId: string) {
    const registros = await this.prisma.registroAuditoria.findMany({
      where: { proyectoId, activoId: { not: null } },
      orderBy: { auditadoEn: 'desc' },
      include: { auditor: { select: { nombre: true } } },
    });

    const ultimoPorActivo = new Map<string, (typeof registros)[number]>();
    for (const registro of registros) {
      const activoId = registro.activoId;
      if (activoId && !ultimoPorActivo.has(activoId)) {
        ultimoPorActivo.set(activoId, registro);
      }
    }
    return ultimoPorActivo;
  }

  async resumen(
    organizacionId: string,
    id: string,
  ): Promise<ResumenProyectoOutput> {
    const proyecto = await this.findOne(organizacionId, id);

    const [totalActivos, noRegistrados, ultimoPorActivo] = await Promise.all([
      this.prisma.activo.count({
        where: { organizacionId: proyecto.organizacionId, deletedAt: null },
      }),
      this.prisma.registroAuditoria.count({
        where: {
          proyectoId: proyecto.id,
          activoId: null,
          estado: 'NO_REGISTRADO',
        },
      }),
      this.ultimoRegistroPorActivo(proyecto.id),
    ]);

    let auditados = 0;
    let diferencias = 0;
    let faltantes = 0;
    for (const registro of ultimoPorActivo.values()) {
      if (registro.estado === 'AUDITADO') auditados++;
      else if (registro.estado === 'DIFERENCIA') diferencias++;
      else if (registro.estado === 'FALTANTE') faltantes++;
    }

    const pendientes = totalActivos - ultimoPorActivo.size;
    const pct =
      totalActivos > 0 ? (totalActivos - pendientes) / totalActivos : 0;

    return {
      total: totalActivos,
      pendientes,
      auditados,
      diferencias,
      faltantes,
      noRegistrados,
      pct,
    };
  }
}
