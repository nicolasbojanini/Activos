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
import { reporteQuerySchema, Rol, type ReporteQuery } from '@adn/shared';
import { ReportesService } from './reportes.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.COORDINADOR)
@Controller('proyectos')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get(':id/reporte')
  @ApiOperation({ summary: 'Descargar reporte del proyecto (xlsx/pdf/csv)' })
  async reporte(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(reporteQuerySchema)) query: ReporteQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.reportesService.generar(
        user.organizacionId,
        id,
        query.formato,
      );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}
