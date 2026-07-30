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

  /**
   * Conteo por estado del "último registro por activo", agregado en Postgres.
   *
   * Es el mismo DISTINCT ON de ultimoRegistroPorActivo(), pero devolviendo
   * solo `estado` + `count(*)` en vez de una fila por activo: el resumen
   * únicamente cuenta estados, así que traer id/cambios/nota/auditadoEn de
   * cada registro era transferir y parsear el historial entero para tirarlo.
   * Medido con 100k activos: 744 ms y ~111 MB de heap por proyecto contra
   * 366 ms y memoria constante. El dashboard gerencial lo multiplica por
   * cada proyecto de cada cliente (todos en paralelo), así que ahí la
   * diferencia era de cientos de MB vivos a la vez.
   */
  private async conteoPorEstado(
    tenantPrisma: TenantPrismaClient,
    proyectoId: string,
  ): Promise<Map<EstadoAuditoriaDb, number>> {
    const filas = await tenantPrisma.$queryRaw<
      { estado: EstadoAuditoriaDb; n: number }[]
    >`
      SELECT estado, count(*)::int AS n
      FROM (
        SELECT DISTINCT ON ("activoId") "activoId", estado
        FROM "RegistroAuditoria"
        WHERE "proyectoId" = ${proyectoId} AND "activoId" IS NOT NULL
        ORDER BY "activoId", "auditadoEn" DESC, id DESC
      ) ultimo
      GROUP BY estado
    `;
    return new Map(filas.map((f) => [f.estado, f.n]));
  }

  async resumen(
    tenantPrisma: TenantPrismaClient,
    id: string,
  ): Promise<ResumenProyectoOutput> {
    const proyecto = await this.findOne(tenantPrisma, id);

    // El conteo directo sobre RegistroAuditoria(activoId: null) cubre hallazgos
    // huérfanos de antes de este cambio; los nuevos NO_REGISTRADO ya quedan
    // ligados a un Activo real y se cuentan abajo vía conteoPorEstado.
    const [totalActivos, noRegistradosHuerfanos, porEstado] = await Promise.all(
      [
        tenantPrisma.activo.count({ where: { deletedAt: null } }),
        tenantPrisma.registroAuditoria.count({
          where: {
            proyectoId: proyecto.id,
            activoId: null,
            estado: 'NO_REGISTRADO',
          },
        }),
        this.conteoPorEstado(tenantPrisma, proyecto.id),
      ],
    );

    const auditados = porEstado.get('AUDITADO') ?? 0;
    const diferencias = porEstado.get('DIFERENCIA') ?? 0;
    const faltantes = porEstado.get('FALTANTE') ?? 0;
    const noRegistrados =
      noRegistradosHuerfanos + (porEstado.get('NO_REGISTRADO') ?? 0);

    // Activos con al menos un registro en este proyecto — equivalente al
    // `size` del mapa que se materializaba antes.
    const conActividad = [...porEstado.values()].reduce((a, b) => a + b, 0);

    const pendientes = totalActivos - conActividad;
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
