import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ActivoDetailOutput,
  ActivoListItemOutput,
  ActivoSesionOutput,
  ListActivosQuery,
  PaginatedOutput,
  RegistroHistorialOutput,
} from '@adn/shared';
import { Prisma } from '../../generated/tenant-client';
import type {
  Activo,
  CategoriaActivo as CategoriaActivoDb,
  EstadoAuditoria as EstadoAuditoriaDb,
  PrismaClient as TenantPrismaClient,
  Ubicacion,
} from '../../generated/tenant-client';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { resolverNombresAuditores } from '../common/resolver-nombres-auditores';
import { ProyectosService } from '../proyectos/proyectos.service';
import { S3Service } from '../files/s3.service';

interface ActivoListRow {
  id: string;
  codigoAnterior: string;
  codigoNuevo: string | null;
  nombre: string;
  categoria: CategoriaActivoDb;
  ubicacionId: string | null;
  ubicacionCodigo: string | null;
  ubicacionSede: string | null;
  ubicacionDetalle: string | null;
  estado: EstadoAuditoriaDb;
  auditorId: string | null;
}

interface ActivoSesionRow {
  id: string;
  updatedAt: Date;
  deletedAt: Date | null;
  codigoAnterior: string;
  codigoNuevo: string | null;
  codigoControl: string | null;
  nombre: string;
  descripcion: string | null;
  categoria: CategoriaActivoDb;
  color: string | null;
  medidas: string | null;
  capacidad: string | null;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  responsable: string | null;
  centroCosto: string | null;
  estadoFisico: Activo['estadoFisico'];
  fechaAdquisicion: Date | null;
  valorLibros: Prisma.Decimal | null;
  proveedor: string | null;
  vidaUtilMeses: number | null;
  camposPersonalizados: Prisma.JsonValue | null;
  ubicacionId: string | null;
  ubicacionCodigo: string | null;
  ubicacionSede: string | null;
  ubicacionDetalle: string | null;
  estado: EstadoAuditoriaDb;
  auditorId: string | null;
}

@Injectable()
export class ActivosService {
  constructor(
    private readonly control: ControlPrismaService,
    private readonly proyectosService: ProyectosService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Filtra/pagina directamente en SQL contra el "último registro por activo"
   * (mismo CTE DISTINCT ON que ultimoRegistroPorActivo). Antes armaba un
   * `WHERE id IN (...)` con TODOS los activos del proyecto que matchean el
   * estado — a 100k activos eso revienta el límite de Postgres de 32,767
   * parámetros por consulta preparada (probado en vivo: filtrar por un
   * estado con ~100k coincidencias tira `too many bind variables`). Acá el
   * filtro de estado vive en el JOIN, nunca como lista de IDs en memoria.
   */
  async findAll(
    tenantPrisma: TenantPrismaClient,
    query: ListActivosQuery,
  ): Promise<PaginatedOutput<ActivoListItemOutput>> {
    const proyecto = await this.proyectosService.findOne(
      tenantPrisma,
      query.proyectoId,
    );

    const condiciones: Prisma.Sql[] = [Prisma.sql`a."deletedAt" IS NULL`];
    if (query.q) {
      const contiene = `%${query.q}%`;
      condiciones.push(
        Prisma.sql`(a."codigoAnterior" ILIKE ${contiene} OR a."codigoNuevo" ILIKE ${contiene} OR a.nombre ILIKE ${contiene})`,
      );
    }
    if (query.ubicacion) {
      condiciones.push(Prisma.sql`a."ubicacionId" = ${query.ubicacion}`);
    }
    if (query.estado === 'PENDIENTE') {
      condiciones.push(Prisma.sql`ultimo."activoId" IS NULL`);
    } else if (query.estado) {
      condiciones.push(
        Prisma.sql`ultimo.estado = ${query.estado}::"EstadoAuditoria"`,
      );
    }
    const whereSql = Prisma.join(condiciones, ' AND ');

    const ultimoCte = Prisma.sql`
      WITH ultimo AS (
        SELECT DISTINCT ON ("activoId") "activoId", estado, "auditorId"
        FROM "RegistroAuditoria"
        WHERE "proyectoId" = ${proyecto.id} AND "activoId" IS NOT NULL
        ORDER BY "activoId", "auditadoEn" DESC, id DESC
      )
    `;

    // Conteo aparte (no count(*) OVER()) para que el total siga siendo correcto
    // incluso si `page` pide una página fuera de rango y la query de datos
    // devuelve cero filas — un window function solo viaja pegado a filas reales.
    const [totalRows, filas] = await Promise.all([
      tenantPrisma.$queryRaw<{ total: number }[]>`
        ${ultimoCte}
        SELECT count(*)::int AS total
        FROM "Activo" a
        LEFT JOIN ultimo ON ultimo."activoId" = a.id
        WHERE ${whereSql}
      `,
      tenantPrisma.$queryRaw<ActivoListRow[]>`
        ${ultimoCte}
        SELECT
          a.id, a."codigoAnterior", a."codigoNuevo", a.nombre, a.categoria,
          u.id AS "ubicacionId", u.codigo AS "ubicacionCodigo",
          u.sede AS "ubicacionSede", u.detalle AS "ubicacionDetalle",
          COALESCE(ultimo.estado, 'PENDIENTE') AS estado,
          ultimo."auditorId" AS "auditorId"
        FROM "Activo" a
        LEFT JOIN "Ubicacion" u ON u.id = a."ubicacionId"
        LEFT JOIN ultimo ON ultimo."activoId" = a.id
        WHERE ${whereSql}
        ORDER BY a."codigoAnterior" ASC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
      `,
    ]);
    const total = totalRows[0]?.total ?? 0;

    const nombresPorId = await resolverNombresAuditores(
      this.control,
      filas.flatMap((f) => (f.auditorId ? [f.auditorId] : [])),
    );

    const data: ActivoListItemOutput[] = filas.map((f) => ({
      id: f.id,
      codigoAnterior: f.codigoAnterior,
      codigoNuevo: f.codigoNuevo,
      nombre: f.nombre,
      categoria: f.categoria,
      ubicacion: f.ubicacionId
        ? {
            id: f.ubicacionId,
            codigo: f.ubicacionCodigo!,
            sede: f.ubicacionSede!,
            detalle: f.ubicacionDetalle,
          }
        : null,
      estado: f.estado,
      ultimoAuditor: f.auditorId
        ? (nombresPorId.get(f.auditorId) ?? '—')
        : null,
    }));

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Ficha completa de TODOS los activos de un proyecto, en una sola consulta —
   * es lo que descarga el espejo local de la app móvil al iniciar sesión de
   * auditoría. Reemplaza al patrón anterior de `findAll()` paginado (varias
   * páginas de 100) + un `findOne()` por cada activo devuelto: con un
   * inventario de miles de activos eso son miles de requests HTTP, que
   * chocan contra el límite global de 100 requests/minuto (ThrottlerModule)
   * y dejan la sesión atascada en "Cargando…" indefinidamente.
   *
   * Con `actualizadoDesde` (cursor ISO) responde solo el DELTA: activos con
   * updatedAt >= cursor, incluyendo los borrados (eliminado: true) para que
   * el espejo local pueda retirarlos. Se usa >= a propósito: el móvil guarda
   * como cursor el mayor updatedAt recibido, y re-traer la fila de frontera
   * es inofensivo (el upsert local es idempotente) mientras que > podría
   * saltarse un cambio ocurrido en el mismo milisegundo.
   */
  async sesionCompleta(
    tenantPrisma: TenantPrismaClient,
    proyectoId: string,
    actualizadoDesde?: string,
  ): Promise<ActivoSesionOutput[]> {
    const proyecto = await this.proyectosService.findOne(
      tenantPrisma,
      proyectoId,
    );

    const condicion = actualizadoDesde
      ? Prisma.sql`a."updatedAt" >= ${new Date(actualizadoDesde)}`
      : Prisma.sql`a."deletedAt" IS NULL`;

    const filas = await tenantPrisma.$queryRaw<ActivoSesionRow[]>`
      WITH ultimo AS (
        SELECT DISTINCT ON ("activoId") "activoId", estado, "auditorId"
        FROM "RegistroAuditoria"
        WHERE "proyectoId" = ${proyecto.id} AND "activoId" IS NOT NULL
        ORDER BY "activoId", "auditadoEn" DESC, id DESC
      )
      SELECT
        a.id, a."updatedAt", a."deletedAt",
        a."codigoNuevo", a."codigoAnterior", a."codigoControl", a.nombre,
        a.descripcion, a.categoria, a.color, a.medidas, a.capacidad, a.marca,
        a.modelo, a.serie, a.responsable, a."centroCosto", a."estadoFisico",
        a."fechaAdquisicion", a."valorLibros", a.proveedor, a."vidaUtilMeses",
        a."camposPersonalizados",
        u.id AS "ubicacionId", u.codigo AS "ubicacionCodigo",
        u.sede AS "ubicacionSede", u.detalle AS "ubicacionDetalle",
        COALESCE(ultimo.estado, 'PENDIENTE') AS estado,
        ultimo."auditorId" AS "auditorId"
      FROM "Activo" a
      LEFT JOIN "Ubicacion" u ON u.id = a."ubicacionId"
      LEFT JOIN ultimo ON ultimo."activoId" = a.id
      WHERE ${condicion}
      ORDER BY a."codigoAnterior" ASC
    `;

    const nombresPorId = await resolverNombresAuditores(
      this.control,
      filas.flatMap((f) => (f.auditorId ? [f.auditorId] : [])),
    );

    return filas.map((f) => ({
      id: f.id,
      actualizadoEn: new Date(f.updatedAt).toISOString(),
      eliminado: f.deletedAt != null,
      codigoNuevo: f.codigoNuevo,
      codigoAnterior: f.codigoAnterior,
      codigoControl: f.codigoControl,
      nombre: f.nombre,
      descripcion: f.descripcion,
      categoria: f.categoria,
      color: f.color,
      medidas: f.medidas,
      capacidad: f.capacidad,
      marca: f.marca,
      modelo: f.modelo,
      serie: f.serie,
      ubicacion: f.ubicacionId
        ? {
            id: f.ubicacionId,
            codigo: f.ubicacionCodigo!,
            sede: f.ubicacionSede!,
            detalle: f.ubicacionDetalle,
          }
        : null,
      responsable: f.responsable,
      centroCosto: f.centroCosto,
      estadoFisico: f.estadoFisico,
      fechaAdquisicion: f.fechaAdquisicion
        ? new Date(f.fechaAdquisicion).toISOString()
        : null,
      valorLibros: f.valorLibros != null ? f.valorLibros.toString() : null,
      proveedor: f.proveedor,
      vidaUtilMeses: f.vidaUtilMeses,
      camposPersonalizados:
        (f.camposPersonalizados as Record<string, string> | null) ?? null,
      estado: f.estado,
      ultimoAuditor: f.auditorId
        ? (nombresPorId.get(f.auditorId) ?? '—')
        : null,
    }));
  }

  async findOne(
    tenantPrisma: TenantPrismaClient,
    id: string,
  ): Promise<ActivoDetailOutput> {
    const activo = await tenantPrisma.activo.findFirst({
      where: { id, deletedAt: null },
      include: { ubicacion: true },
    });
    if (!activo) {
      throw new NotFoundException('Activo no encontrado');
    }
    return this.toDetailOutput(tenantPrisma, activo);
  }

  async buscarPorCodigo(
    tenantPrisma: TenantPrismaClient,
    codigo: string,
  ): Promise<ActivoDetailOutput> {
    // El auditor puede escanear el código que tenga físicamente puesto el
    // activo hoy — el anterior (si nunca se reemplazó la placa) o el nuevo
    // (si ya se la cambiaron pero es la misma llave de identidad).
    const activo = await tenantPrisma.activo.findFirst({
      where: {
        OR: [{ codigoAnterior: codigo }, { codigoNuevo: codigo }],
        deletedAt: null,
      },
      include: { ubicacion: true },
    });
    if (!activo) {
      throw new NotFoundException('No se encontró un activo con ese código');
    }
    return this.toDetailOutput(tenantPrisma, activo);
  }

  private async toDetailOutput(
    tenantPrisma: TenantPrismaClient,
    activo: Activo & { ubicacion: Ubicacion | null },
  ): Promise<ActivoDetailOutput> {
    const ultimoRegistro = await tenantPrisma.registroAuditoria.findFirst({
      where: { activoId: activo.id },
      orderBy: { auditadoEn: 'desc' },
    });
    const nombresPorId = await resolverNombresAuditores(
      this.control,
      ultimoRegistro ? [ultimoRegistro.auditorId] : [],
    );

    return {
      id: activo.id,
      codigoNuevo: activo.codigoNuevo,
      codigoAnterior: activo.codigoAnterior,
      codigoControl: activo.codigoControl,
      nombre: activo.nombre,
      descripcion: activo.descripcion,
      categoria: activo.categoria,
      color: activo.color,
      medidas: activo.medidas,
      capacidad: activo.capacidad,
      marca: activo.marca,
      modelo: activo.modelo,
      serie: activo.serie,
      ubicacion: activo.ubicacion
        ? {
            id: activo.ubicacion.id,
            codigo: activo.ubicacion.codigo,
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
      camposPersonalizados:
        (activo.camposPersonalizados as Record<string, string> | null) ?? null,
      estado: ultimoRegistro?.estado ?? 'PENDIENTE',
      ultimoAuditor: ultimoRegistro
        ? (nombresPorId.get(ultimoRegistro.auditorId) ?? '—')
        : null,
    };
  }

  /** Línea de tiempo de auditoría del activo (quién/cuándo/qué cambió) + galería de fotos. */
  async historial(
    tenantPrisma: TenantPrismaClient,
    activoId: string,
  ): Promise<RegistroHistorialOutput[]> {
    const activo = await tenantPrisma.activo.findFirst({
      where: { id: activoId },
    });
    if (!activo) {
      throw new NotFoundException('Activo no encontrado');
    }

    const registros = await tenantPrisma.registroAuditoria.findMany({
      where: { activoId },
      orderBy: { auditadoEn: 'desc' },
      include: {
        fotos: { orderBy: { orden: 'asc' } },
      },
    });
    const nombresPorId = await resolverNombresAuditores(
      this.control,
      registros.map((r) => r.auditorId),
    );

    return Promise.all(
      registros.map(async (registro) => ({
        id: registro.id,
        estado: registro.estado,
        estadoFisico: registro.estadoFisico,
        cambios: registro.cambios as RegistroHistorialOutput['cambios'],
        nota: registro.nota,
        auditadoEn: registro.auditadoEn.toISOString(),
        auditor: nombresPorId.get(registro.auditorId) ?? '—',
        fotos: await Promise.all(
          registro.fotos.map(async (foto) => ({
            id: foto.id,
            url: await this.s3.urlDescarga(foto.s3Key),
            etiqueta: foto.etiqueta,
            orden: foto.orden,
          })),
        ),
      })),
    );
  }
}
