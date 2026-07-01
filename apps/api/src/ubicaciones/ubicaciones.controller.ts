import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UbicacionesService } from './ubicaciones.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('ubicaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ubicaciones')
export class UbicacionesController {
  constructor(private readonly ubicacionesService: UbicacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Sedes/ubicaciones de la organización' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.ubicacionesService.findAll(user.organizacionId);
  }
}
