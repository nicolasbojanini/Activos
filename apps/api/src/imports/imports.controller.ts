import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Rol } from '@adn/shared';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client';
import { ImportsService } from './imports.service';
import {
  importCommitSchema,
  type ImportCommitDto,
} from './dto/import-commit.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { TenantPrisma } from '../prisma/decorators/tenant-prisma.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Rol.COORDINADOR, Rol.ADN_ADMIN)
@Controller('clientes/:clienteId/imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Previsualizar un archivo .xlsx/.csv: columnas, muestra y mapeo sugerido',
  })
  preview(
    @Param('clienteId') clienteId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('hoja') hoja?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo .xlsx o .csv');
    }
    return this.importsService.preview(file, clienteId, hoja);
  }

  @Post('commit')
  @ApiOperation({
    summary:
      'Confirmar la importación: valida, upsert por código nuevo y registra el lote',
  })
  commit(
    @Param('clienteId') clienteId: string,
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(importCommitSchema)) dto: ImportCommitDto,
  ) {
    return this.importsService.commit(
      tenantPrisma,
      clienteId,
      user.id,
      dto.archivoNombre,
      dto,
    );
  }
}
