import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';
import { UbicacionesService } from './ubicaciones.service';
import {
  buscarUbicacionQuerySchema,
  type BuscarUbicacionQueryDto,
} from './dto/buscar-ubicacion-query.dto';
import {
  crearUbicacionSchema,
  type CrearUbicacionDto,
} from './dto/crear-ubicacion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { TenantPrisma } from '../prisma/decorators/tenant-prisma.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('ubicaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('clientes/:clienteId/ubicaciones')
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Sedes/ubicaciones del cliente' })
  findAll(@TenantPrisma() tenantPrisma: TenantPrismaClient) {
    return this.ubicacionesService.findAll(tenantPrisma);
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Resolver un código QR escaneado a una ubicación' })
  buscar(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Query(new ZodValidationPipe(buscarUbicacionQuerySchema))
    query: BuscarUbicacionQueryDto,
  ) {
    return this.ubicacionesService.buscarPorCodigo(tenantPrisma, query.codigo);
  }

  @Post()
  @ApiOperation({
    summary:
      'Registrar una ubicación nueva con un código ya escaneado en campo',
  })
  crear(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Body(new ZodValidationPipe(crearUbicacionSchema)) dto: CrearUbicacionDto,
  ) {
    return this.ubicacionesService.crear(tenantPrisma, dto);
  }
}
