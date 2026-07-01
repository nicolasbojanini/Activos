import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProyectosService } from './proyectos.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

@ApiTags('proyectos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de proyectos de la organización' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.proyectosService.findAll(user.organizacionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un proyecto' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.proyectosService.findOne(user.organizacionId, id);
  }

  @Get(':id/resumen')
  @ApiOperation({ summary: 'KPIs de avance del proyecto' })
  resumen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.proyectosService.resumen(user.organizacionId, id);
  }
}
