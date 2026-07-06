import { Injectable, NotFoundException } from '@nestjs/common';
import type { CrearProyectoInput, ResumenProyectoOutput } from '@adn/shared';
import type {
  EstadoAuditoria as EstadoAuditoriaDb,
  Prisma,
  PrismaClient as TenantPrismaClient,
} from '../../generated/tenant-client';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { resolverNombresAuditores } from '../common/resolver-nombres-auditores';

/**
 * Solo los campos que de verdad consumen activos.service.ts, reportes.service.ts
 * y resumen() de abajo — no el RegistroAuditoria completo. La query de
 * ultimoRegistroPorActivo() ya no trae proyectoId/lat/lng/clientId/syncedAt/
 * createdAt/estadoFisico por fila: para 100k+ activos, cada columna de menos
 * multiplicada por cientos de miles de filas es la diferencia entre una
 * respuesta instantánea y una lenta.
 */
export interface UltimoRegistroActivo {
  id: string;
  activoId: string;
  estado: EstadoAuditoriaDb;
  cambios: Prisma.JsonValue | null;
  nota: string | null;
  auditadoEn: Date;
  auditorId: string;
  auditorNombre: string;
}

/** Fila cruda de la query DISTINCT ON, antes de resolver el nombre del auditor. */
interface UltimoRegistroRow {
  id: string;
  activoId: string;
  estado: EstadoAuditoriaDb;
  cambios: Prisma.JsonValue | null;
  nota: string | null;
  auditadoEn: Date;
  auditorId: string;
}

@Injectable()
export class ProyectosService {
  constructor(private readonly control: ControlPrismaService) {}

  async findAll(
    tenantPrisma: TenantPrismaClient,
    proyectoIdsPermitidos?: string[],
  ) {
    return tenantPrisma.proyectoAuditoria.findMany({
      where: proyectoIdsPermitidos
        ? { id: { in: proyectoIdsPermitidos } }
        : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantPrisma: TenantPrismaClient, id: string) {
    const proyecto = await tenantPrisma.proyectoAuditoria.findFirst({
      where: { id },
    });
    if (!proyecto) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return proyecto;
  }

  async crear(tenantPrisma: TenantPrismaClient, dto: CrearProyectoInput) {
    return tenantPrisma.proyectoAuditoria.create({
      data: { nombre: dto.nombre, fechaCorte: dto.fechaCorte },
    });
  }

  /**
   * Último RegistroAuditoria por activo dentro del proyecto (el más reciente por auditadoEn).
   * DISTINCT ON acota el resultado a un row por activo directamente en Postgres — antes
   * traíamos TODO el historial de auditoría del proyecto (crece sin límite con cada
   * reauditoría) a memoria y deduplicábamos en JS; con cientos de miles de registros
   * eso significaba transferir y parsear filas enteras (incluido el JSON de `cambios`)
   * muchas veces por cada activo. El índice [proyectoId, activoId, auditadoEn DESC]
   * (migración registro_ultimo_por_activo_index) soporta esta query sin sort completo.
   */
  async ultimoRegistroPorActivo(
    tenantPrisma: TenantPrismaClient,
    proyectoId: string,
  ): Promise<Map<string, UltimoRegistroActivo>> {
    const filas = await tenantPrisma.$queryRaw<UltimoRegistroRow[]>`
      SELECT DISTINCT ON ("activoId")
        id, "activoId", estado, cambios, nota, "auditadoEn", "auditorId"
      FROM "RegistroAuditoria"
      WHERE "proyectoId" = ${proyectoId} AND "activoId" IS NOT NULL
      ORDER BY "activoId", "auditadoEn" DESC, id DESC
    `;

    const nombresPorId = await resolverNombresAuditores(
      this.control,
      filas.map((f) => f.auditorId),
    );

    const ultimoPorActivo = new Map<string, UltimoRegistroActivo>();
    for (const fila of filas) {
      ultimoPorActivo.set(fila.activoId, {
        ...fila,
        auditorNombre: nombresPorId.get(fila.auditorId) ?? '—',
      });
    }
    return ultimoPorActivo;
  }

  async resumen(
    tenantPrisma: TenantPrismaClient,
    id: string,
  ): Promise<ResumenProyectoOutput> {
    const proyecto = await this.findOne(tenantPrisma, id);

    // El conteo directo sobre RegistroAuditoria(activoId: null) cubre hallazgos
    // huérfanos de antes de este cambio; los nuevos NO_REGISTRADO ya quedan
    // ligados a un Activo real y se cuentan abajo vía ultimoPorActivo.
    const [totalActivos, noRegistradosHuerfanos, ultimoPorActivo] =
      await Promise.all([
        tenantPrisma.activo.count({ where: { deletedAt: null } }),
        tenantPrisma.registroAuditoria.count({
          where: {
            proyectoId: proyecto.id,
            activoId: null,
            estado: 'NO_REGISTRADO',
          },
        }),
        this.ultimoRegistroPorActivo(tenantPrisma, proyecto.id),
      ]);

    let auditados = 0;
    let diferencias = 0;
    let faltantes = 0;
    let noRegistrados = noRegistradosHuerfanos;
    for (const registro of ultimoPorActivo.values()) {
      if (registro.estado === 'AUDITADO') auditados++;
      else if (registro.estado === 'DIFERENCIA') diferencias++;
      else if (registro.estado === 'FALTANTE') faltantes++;
      else if (registro.estado === 'NO_REGISTRADO') noRegistrados++;
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
