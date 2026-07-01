import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegistrosService } from './registros.service';
import {
  registroAuditoriaInputSchema,
  type CrearRegistroDto,
} from './dto/crear-registro.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('registros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('registros')
export class RegistrosController {
  constructor(private readonly registrosService: RegistrosService) {}

  @Post()
  @ApiOperation({
    summary:
      'Registrar el resultado de auditar un activo (idempotente por clientId)',
  })
  crear(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registroAuditoriaInputSchema))
    dto: CrearRegistroDto,
  ) {
    return this.registrosService.crear(user.organizacionId, user.id, dto);
  }
}
