import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Rol } from '@adn/shared';
import { UsuariosService } from './usuarios.service';
import {
  crearUsuarioSchema,
  type CrearUsuarioDto,
} from './dto/crear-usuario.dto';
import {
  actualizarUsuarioSchema,
  type ActualizarUsuarioDto,
} from './dto/actualizar-usuario.dto';
import {
  asignarProyectoSchema,
  type AsignarProyectoDto,
} from './dto/asignar-proyecto.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADN_ADMIN, Rol.COORDINADOR)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar auditores/coordinadores (personal de ADN)' })
  findAll() {
    return this.usuariosService.findAll();
  }

  @Post()
  @ApiOperation({
    summary:
      'Crear un auditor o coordinador nuevo, con contraseña asignada por el coordinador',
  })
  crear(@Body(new ZodValidationPipe(crearUsuarioSchema)) dto: CrearUsuarioDto) {
    return this.usuariosService.crear(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Activar/desactivar o cambiar la contraseña de un usuario',
  })
  actualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(actualizarUsuarioSchema))
    dto: ActualizarUsuarioDto,
  ) {
    return this.usuariosService.actualizar(id, dto);
  }

  @Get('me/asignacion')
  @Roles(Rol.ADN_ADMIN, Rol.COORDINADOR, Rol.AUDITOR)
  @ApiOperation({
    summary:
      'Asignación actual del usuario autenticado (o null si no tiene ninguna)',
  })
  miAsignacion(@CurrentUser() user: AuthenticatedUser) {
    return this.usuariosService.miAsignacion(user.id);
  }

  @Get(':id/asignaciones')
  @ApiOperation({ summary: 'Proyectos asignados a este usuario' })
  listarAsignaciones(@Param('id') id: string) {
    return this.usuariosService.listarAsignaciones(id);
  }

  @Post('asignaciones')
  @ApiOperation({
    summary: 'Asignar un auditor a un proyecto específico de un cliente',
  })
  asignarProyecto(
    @Body(new ZodValidationPipe(asignarProyectoSchema)) dto: AsignarProyectoDto,
  ) {
    return this.usuariosService.asignarProyecto(dto);
  }

  @Delete('asignaciones/:asignacionId')
  @ApiOperation({ summary: 'Quitar la asignación de un auditor a un proyecto' })
  quitarAsignacion(@Param('asignacionId') asignacionId: string) {
    return this.usuariosService.quitarAsignacion(asignacionId);
  }
}
