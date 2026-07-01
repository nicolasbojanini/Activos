import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivosService } from './activos.service';
import {
  listActivosQuerySchema,
  type ListActivosQueryDto,
} from './dto/list-activos-query.dto';
import {
  buscarActivoQuerySchema,
  type BuscarActivoQueryDto,
} from './dto/buscar-activo-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('activos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('activos')
export class ActivosController {
  constructor(private readonly activosService: ActivosService) {}

  @Get()
  @ApiOperation({ summary: 'Tabla paginada de activos (web) / lista (móvil)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listActivosQuerySchema))
    query: ListActivosQueryDto,
  ) {
    return this.activosService.findAll(user.organizacionId, query);
  }

  @Get('buscar')
  @ApiOperation({
    summary:
      'Resolver un código QR escaneado a un activo (404 → flujo NO_REGISTRADO)',
  })
  buscar(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(buscarActivoQuerySchema))
    query: BuscarActivoQueryDto,
  ) {
    return this.activosService.buscarPorCodigoQR(
      user.organizacionId,
      query.codigoQR,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa del activo + último registro' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.activosService.findOne(user.organizacionId, id);
  }

  @Get(':id/registros')
  @ApiOperation({
    summary: 'Línea de tiempo de registros de auditoría + galería de fotos',
  })
  historial(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.activosService.historial(user.organizacionId, id);
  }
}
