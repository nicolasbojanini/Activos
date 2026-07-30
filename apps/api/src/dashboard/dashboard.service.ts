import { Injectable } from '@nestjs/common';
import type {
  AuditorRendimientoOutput,
  ProyectoGerencialOutput,
} from '@adn/shared';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { TenantClientRegistryService } from '../prisma/tenant-client-registry.service';
import { ProyectosService } from '../proyectos/proyectos.service';

/** Fila cruda de la query de rendimiento — un total y días activos por auditor. */
interface RendimientoRow {
  auditorId: string;
  total: bigint;
  diasActivos: bigint;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly control: ControlPrismaService,
    private readonly tenants: TenantClientRegistryService,
    private readonly proyectosService: ProyectosService,
  ) {}

  /**
   * Resumen gerencial: todos los proyectos EN CURSO (cerrado: false) de
   * TODOS los clientes activos, con su avance, cuántos auditores tienen
   * asignados y el rendimiento de cada uno. A diferencia del resto de la
   * web (que opera sobre un solo cliente a la vez, vía :clienteId en la
   * URL), este endpoint recorre todas las bases de datos tenant — es la
   * única pantalla pensada para ver "todo a la vez".
   */
  async obtenerResumenGerencial(): Promise<ProyectoGerencialOutput[]> {
    const clientes = await this.control.cliente.findMany({
      where: { estado: 'ACTIVO' },
    });

    const porCliente = await Promise.all(
      clientes.map((cliente) => this.proyectosDelCliente(cliente)),
    );

    return porCliente.flat();
  }

  private async proyectosDelCliente(cliente: {
    id: string;
    nombre: string;
  }): Promise<ProyectoGerencialOutput[]> {
    const tenantPrisma = await this.tenants.getClient(cliente.id);
    const proyectos = await tenantPrisma.proyectoAuditoria.findMany({
      where: { cerrado: false },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      proyectos.map(async (proyecto) => {
        const [resumen, asignaciones, rendimientoCrudo] = await Promise.all([
          this.proyectosService.resumen(tenantPrisma, proyecto.id),
          this.control.asignacionProyecto.findMany({
            where: { clienteId: cliente.id, proyectoId: proyecto.id },
            include: {
              usuario: { select: { id: true, nombre: true, rol: true } },
            },
          }),
          tenantPrisma.$queryRaw<RendimientoRow[]>`
            SELECT "auditorId",
                   COUNT(*) as total,
                   COUNT(DISTINCT (("auditadoEn" - INTERVAL '5 hours')::date)) as "diasActivos"
            FROM "RegistroAuditoria"
            WHERE "proyectoId" = ${proyecto.id}
            GROUP BY "auditorId"
          `,
        ]);

        const rendimientoPorAuditor = new Map(
          rendimientoCrudo.map((r) => [r.auditorId, r]),
        );

        const auditores: AuditorRendimientoOutput[] = asignaciones
          .filter((a) => a.usuario.rol === 'AUDITOR')
          .map((a) => {
            const fila = rendimientoPorAuditor.get(a.usuario.id);
            const registros = fila ? Number(fila.total) : 0;
            const diasActivos = fila ? Number(fila.diasActivos) : 0;
            return {
              auditorId: a.usuario.id,
              auditorNombre: a.usuario.nombre,
              registros,
              diasActivos,
              // Redondeado a 1 decimal — "3.7 registros/día" es más legible que "3.666666...".
              promedioPorDia:
                diasActivos > 0
                  ? Math.round((registros / diasActivos) * 10) / 10
                  : 0,
            };
          });

        return {
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          proyectoId: proyecto.id,
          proyectoNombre: proyecto.nombre,
          fechaCorte: proyecto.fechaCorte.toISOString(),
          resumen,
          auditoresAsignados: auditores.length,
          auditores,
        };
      }),
    );
  }
}
