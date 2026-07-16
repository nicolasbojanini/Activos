import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  fotosZipQuerySchema,
  reporteQuerySchema,
  Rol,
  type FotosZipQuery,
  type ReporteQuery,
} from '@adn/shared';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';
import { ReportesService } from './reportes.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { TenantPrisma } from '../prisma/decorators/tenant-prisma.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Rol.COORDINADOR, Rol.ADN_ADMIN)
@Controller('clientes/:clienteId/proyectos')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get(':proyectoId/reporte')
  @ApiOperation({ summary: 'Descargar reporte del proyecto (xlsx/pdf/csv)' })
  async reporte(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Param('clienteId') clienteId: string,
    @Param('proyectoId') proyectoId: string,
    @Query(new ZodValidationPipe(reporteQuerySchema)) query: ReporteQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.reportesService.generar(
        tenantPrisma,
        clienteId,
        proyectoId,
        query.formato,
      );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get(':proyectoId/fotos.zip')
  @ApiOperation({
    summary:
      'Descargar en un .zip las fotos confirmadas del proyecto (nombre: placa-consecutivo.jpg). ' +
      'Con desde/hasta filtra por fecha de captura (auditadoEn), para descargas graduales.',
  })
  async fotosZip(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Param('proyectoId') proyectoId: string,
    @Query(new ZodValidationPipe(fotosZipQuerySchema)) query: FotosZipQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { archive, filename } = await this.reportesService.generarZipFotos(
      tenantPrisma,
      proyectoId,
      query,
    );
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(archive);
  }
}
