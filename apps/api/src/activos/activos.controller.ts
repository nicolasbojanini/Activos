import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';
import { ActivosService } from './activos.service';
import {
  listActivosQuerySchema,
  type ListActivosQueryDto,
} from './dto/list-activos-query.dto';
import {
  buscarActivoQuerySchema,
  type BuscarActivoQueryDto,
} from './dto/buscar-activo-query.dto';
import {
  sesionActivosQuerySchema,
  type SesionActivosQueryDto,
} from './dto/sesion-activos-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import {
  AsignacionProyectoIds,
  TenantPrisma,
} from '../prisma/decorators/tenant-prisma.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('activos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('clientes/:clienteId/activos')
export class ActivosController {
  constructor(private readonly activosService: ActivosService) {}

  @Get()
  @ApiOperation({ summary: 'Tabla paginada de activos (web) / lista (móvil)' })
  findAll(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Query(new ZodValidationPipe(listActivosQuerySchema))
    query: ListActivosQueryDto,
    @AsignacionProyectoIds() proyectoIdsPermitidos?: string[],
  ) {
    if (
      proyectoIdsPermitidos &&
      !proyectoIdsPermitidos.includes(query.proyectoId)
    ) {
      throw new ForbiddenException('No tienes acceso a ese proyecto');
    }
    return this.activosService.findAll(tenantPrisma, query);
  }

  @Get('buscar')
  @ApiOperation({
    summary:
      'Resolver un código QR escaneado a un activo (404 → flujo NO_REGISTRADO)',
  })
  buscar(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Query(new ZodValidationPipe(buscarActivoQuerySchema))
    query: BuscarActivoQueryDto,
  ) {
    return this.activosService.buscarPorCodigo(tenantPrisma, query.codigo);
  }

  @Get('sesion')
  @ApiOperation({
    summary:
      'Ficha completa de todos los activos del proyecto en una sola llamada (espejo local de la app móvil)',
  })
  sesionCompleta(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Query(new ZodValidationPipe(sesionActivosQuerySchema))
    query: SesionActivosQueryDto,
    @AsignacionProyectoIds() proyectoIdsPermitidos?: string[],
  ) {
    if (
      proyectoIdsPermitidos &&
      !proyectoIdsPermitidos.includes(query.proyectoId)
    ) {
      throw new ForbiddenException('No tienes acceso a ese proyecto');
    }
    return this.activosService.sesionCompleta(tenantPrisma, query.proyectoId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa del activo + último registro' })
  findOne(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Param('id') id: string,
  ) {
    return this.activosService.findOne(tenantPrisma, id);
  }

  @Get(':id/registros')
  @ApiOperation({
    summary: 'Línea de tiempo de registros de auditoría + galería de fotos',
  })
  historial(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Param('id') id: string,
  ) {
    return this.activosService.historial(tenantPrisma, id);
  }
}
