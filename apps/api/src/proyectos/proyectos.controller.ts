import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Rol } from '@adn/shared';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';
import { ProyectosService } from './proyectos.service';
import {
  crearProyectoSchema,
  type CrearProyectoDto,
} from './dto/crear-proyecto.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import {
  AsignacionProyectoIds,
  TenantPrisma,
} from '../prisma/decorators/tenant-prisma.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('proyectos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Controller('clientes/:clienteId/proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista de proyectos del cliente (filtrada por asignación si es AUDITOR)',
  })
  findAll(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @AsignacionProyectoIds() proyectoIdsPermitidos?: string[],
  ) {
    return this.proyectosService.findAll(tenantPrisma, proyectoIdsPermitidos);
  }

  @Get(':proyectoId')
  @ApiOperation({ summary: 'Detalle de un proyecto' })
  findOne(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Param('proyectoId') proyectoId: string,
  ) {
    return this.proyectosService.findOne(tenantPrisma, proyectoId);
  }

  @Get(':proyectoId/resumen')
  @ApiOperation({ summary: 'KPIs de avance del proyecto' })
  resumen(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Param('proyectoId') proyectoId: string,
  ) {
    return this.proyectosService.resumen(tenantPrisma, proyectoId);
  }

  @Post()
  @Roles(Rol.ADN_ADMIN, Rol.COORDINADOR)
  @ApiOperation({
    summary: 'Crear un proyecto de auditoría nuevo para este cliente',
  })
  crear(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Body(new ZodValidationPipe(crearProyectoSchema)) dto: CrearProyectoDto,
  ) {
    return this.proyectosService.crear(tenantPrisma, dto);
  }
}
