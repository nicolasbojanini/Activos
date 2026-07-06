import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
}
