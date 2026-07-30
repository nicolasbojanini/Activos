import { Injectable } from '@nestjs/common';
import type {
  AuditorRendimientoOutput,
  ProyectoGerencialOutput,
} from '@adn/shared';
import { Prisma } from '../../generated/tenant-client';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { TenantClientRegistryService } from '../prisma/tenant-client-registry.service';
import { ProyectosService } from '../proyectos/proyectos.service';

/** Fila cruda de la query de rendimiento — un total y días activos por auditor. */
interface RendimientoRow {
  auditorId: string;
  total: bigint;
  diasActivos: bigint;
}

/** Misma forma que RendimientoRow pero sin agrupar por auditor (el equipo completo como si fuera uno). */
interface RendimientoTotalRow {
  total: bigint;
  diasActivos: bigint;
}

function calcularPromedio(total: number, diasActivos: number): number {
  // Redondeado a 1 decimal — "3.7 registros/día" es más legible que "3.666666...".
  return diasActivos > 0 ? Math.round((total / diasActivos) * 10) / 10 : 0;
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
        const [resumen, asignaciones] = await Promise.all([
          this.proyectosService.resumen(tenantPrisma, proyecto.id),
          this.control.asignacionProyecto.findMany({
            where: { clienteId: cliente.id, proyectoId: proyecto.id },
            include: {
              usuario: { select: { id: true, nombre: true, rol: true } },
            },
          }),
        ]);

        const auditorIds = asignaciones
          .filter((a) => a.usuario.rol === 'AUDITOR')
          .map((a) => a.usuario.id);

        // Ambas queries se acotan a los auditores ASIGNADOS ACTUALMENTE (no
        // a todo el historial de RegistroAuditoria del proyecto) — así el
        // total del equipo siempre cuadra con la suma de las filas
        // individuales que se ven en la tabla expandida.
        const [rendimientoCrudo, rendimientoEquipo] =
          auditorIds.length > 0
            ? await Promise.all([
                tenantPrisma.$queryRaw<RendimientoRow[]>`
                  SELECT "auditorId",
                         COUNT(*) as total,
                         COUNT(DISTINCT (("auditadoEn" - INTERVAL '5 hours')::date)) as "diasActivos"
                  FROM "RegistroAuditoria"
                  WHERE "proyectoId" = ${proyecto.id} AND "auditorId" IN (${Prisma.join(auditorIds)})
                  GROUP BY "auditorId"
                `,
                // Mismo cálculo pero SIN agrupar por auditor: un día en que
                // dos auditores del equipo trabajaron cuenta como un solo
                // día activo, no dos — es lo que pide un promedio ponderado
                // "como si todos los auditores fueran uno solo", en vez de
                // sumar los días activos de cada uno (que sí duplicaría los
                // días en que coincidieron).
                tenantPrisma.$queryRaw<RendimientoTotalRow[]>`
                  SELECT COUNT(*) as total,
                         COUNT(DISTINCT (("auditadoEn" - INTERVAL '5 hours')::date)) as "diasActivos"
                  FROM "RegistroAuditoria"
                  WHERE "proyectoId" = ${proyecto.id} AND "auditorId" IN (${Prisma.join(auditorIds)})
                `,
              ])
            : [[], [{ total: 0n, diasActivos: 0n }]];

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
              promedioPorDia: calcularPromedio(registros, diasActivos),
            };
          });

        const equipo = rendimientoEquipo[0];
        const promedioEquipoPorDia = calcularPromedio(
          equipo ? Number(equipo.total) : 0,
          equipo ? Number(equipo.diasActivos) : 0,
        );

        return {
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          proyectoId: proyecto.id,
          proyectoNombre: proyecto.nombre,
          fechaCorte: proyecto.fechaCorte.toISOString(),
          resumen,
          auditoresAsignados: auditores.length,
          auditores,
          promedioEquipoPorDia,
        };
      }),
    );
  }
}
