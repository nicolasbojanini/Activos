import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Rol } from '@adn/shared';
import { DashboardService } from './dashboard.service';
import {
  actividadHorariaQuerySchema,
  type ActividadHorariaQueryDto,
} from './dto/actividad-horaria-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADN_ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('proyectos')
  @ApiOperation({
    summary:
      'Resumen gerencial de todos los proyectos en curso de todos los clientes: avance, auditores asignados y su rendimiento promedio por día',
  })
  proyectos() {
    return this.dashboardService.obtenerResumenGerencial();
  }

  @Get('proyectos/:clienteId/:proyectoId/actividad-diaria')
  @ApiOperation({
    summary:
      'Histograma diario del proyecto: registros de todo el equipo por día (hora de Bogotá), con los días sin actividad incluidos en 0',
  })
  actividadDiaria(
    @Param('clienteId') clienteId: string,
    @Param('proyectoId') proyectoId: string,
  ) {
    return this.dashboardService.obtenerActividadDiaria(clienteId, proyectoId);
  }

  @Get('proyectos/:clienteId/:proyectoId/actividad-horaria')
  @ApiOperation({
    summary:
      'Histograma horario (24 franjas de 1 hora, hora de Bogotá) de un día específico del proyecto',
  })
  actividadHoraria(
    @Param('clienteId') clienteId: string,
    @Param('proyectoId') proyectoId: string,
    @Query(new ZodValidationPipe(actividadHorariaQuerySchema))
    query: ActividadHorariaQueryDto,
  ) {
    return this.dashboardService.obtenerActividadHoraria(
      clienteId,
      proyectoId,
      query.dia,
    );
  }
}
