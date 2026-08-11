import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { RegistrosService } from './registros.service';
import {
  registroAuditoriaInputSchema,
  type CrearRegistroDto,
} from './dto/crear-registro.dto';
import {
  confirmarFotosSchema,
  type ConfirmarFotosDto,
} from './dto/confirmar-fotos.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import {
  AsignacionProyectoIds,
  TenantPrisma,
} from '../prisma/decorators/tenant-prisma.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('registros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('clientes/:clienteId/registros')
export class RegistrosController {
  constructor(private readonly registrosService: RegistrosService) {}

  @Post()
  @ApiOperation({
    summary:
      'Registrar el resultado de auditar un activo (idempotente por clientId)',
  })
  crear(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registroAuditoriaInputSchema))
    dto: CrearRegistroDto,
    @AsignacionProyectoIds() proyectoIdsPermitidos?: string[],
  ) {
    if (
      proyectoIdsPermitidos &&
      !proyectoIdsPermitidos.includes(dto.proyectoId)
    ) {
      throw new ForbiddenException('No tienes acceso a ese proyecto');
    }
    return this.registrosService.crear(tenantPrisma, user.id, dto);
  }

  @Post(':id/fotos/confirmar')
  @ApiOperation({
    summary:
      'Confirmar que las fotos ya se subieron a S3 y completar sus metadatos',
  })
  confirmarFotos(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(confirmarFotosSchema)) dto: ConfirmarFotosDto,
  ) {
    return this.registrosService.confirmarFotos(tenantPrisma, id, dto);
  }

  /**
   * Fallback offline: importa el .xlsx que exportó la app móvil con su cola
   * pendiente de sincronizar, cuando el dispositivo no tiene señal en
   * absoluto. Restringido a COORDINADOR/ADN_ADMIN — a diferencia de POST
   * normal (que solo audita para el usuario autenticado), acá el archivo
   * trae el auditorId de cada fila, así que es una acción con más alcance.
   */
  @Post('importar-pendientes')
  @UseGuards(RolesGuard)
  @Roles(Rol.COORDINADOR, Rol.ADN_ADMIN)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Importar el .xlsx exportado por la app móvil con la cola offline pendiente',
  })
  importarPendientes(
    @TenantPrisma() tenantPrisma: TenantPrismaClient,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Debes adjuntar el archivo .xlsx exportado desde la app',
      );
    }
    return this.registrosService.importarPendientes(tenantPrisma, file.buffer);
  }
}
