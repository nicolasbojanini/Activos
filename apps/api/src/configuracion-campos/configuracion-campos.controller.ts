import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Rol } from '@adn/shared';
import { ConfiguracionCamposService } from './configuracion-campos.service';
import {
  actualizarCampoPersonalizadoSchema,
  type ActualizarCampoPersonalizadoDto,
} from './dto/actualizar-campo-personalizado.dto';
import {
  actualizarConfiguracionCamposSchema,
  type ActualizarConfiguracionCamposDto,
} from './dto/actualizar-configuracion-campos.dto';
import {
  actualizarFotoObligatoriaSchema,
  type ActualizarFotoObligatoriaDto,
} from './dto/actualizar-foto-obligatoria.dto';
import {
  crearCampoPersonalizadoSchema,
  type CrearCampoPersonalizadoDto,
} from './dto/crear-campo-personalizado.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('configuracion-campos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADN_ADMIN, Rol.COORDINADOR)
@Controller('clientes/:clienteId')
export class ConfiguracionCamposController {
  constructor(private readonly service: ConfiguracionCamposService) {}

  @Get('configuracion-campos')
  @Roles(Rol.ADN_ADMIN, Rol.COORDINADOR, Rol.AUDITOR)
  @ApiOperation({
    summary: 'Catálogo de campos + configuración actual del cliente',
  })
  async obtener(@Param('clienteId') clienteId: string) {
    const [campos, camposPersonalizados, fotoObligatoria] = await Promise.all([
      this.service.obtenerCampos(clienteId),
      this.service.obtenerCamposPersonalizados(clienteId),
      this.service.obtenerFotoObligatoria(clienteId),
    ]);
    return { campos, camposPersonalizados, fotoObligatoria };
  }

  @Patch('foto-obligatoria')
  @ApiOperation({
    summary: 'Si la primera foto ("Vista general") es obligatoria para el cliente',
  })
  actualizarFotoObligatoria(
    @Param('clienteId') clienteId: string,
    @Body(new ZodValidationPipe(actualizarFotoObligatoriaSchema))
    dto: ActualizarFotoObligatoriaDto,
  ) {
    return this.service.actualizarFotoObligatoria(clienteId, dto);
  }

  @Put('configuracion-campos')
  @ApiOperation({
    summary: 'Actualizar qué campos son visibles/obligatorios para el cliente',
  })
  actualizar(
    @Param('clienteId') clienteId: string,
    @Body(new ZodValidationPipe(actualizarConfiguracionCamposSchema))
    dto: ActualizarConfiguracionCamposDto,
  ) {
    return this.service.actualizar(clienteId, dto);
  }

  @Post('campos-personalizados')
  @ApiOperation({ summary: 'Crear un campo personalizado para el cliente' })
  crearCampoPersonalizado(
    @Param('clienteId') clienteId: string,
    @Body(new ZodValidationPipe(crearCampoPersonalizadoSchema))
    dto: CrearCampoPersonalizadoDto,
  ) {
    return this.service.crearCampoPersonalizado(clienteId, dto);
  }

  @Delete('campos-personalizados/:campoId')
  @ApiOperation({ summary: 'Eliminar un campo personalizado del cliente' })
  eliminarCampoPersonalizado(@Param('campoId') campoId: string) {
    return this.service.eliminarCampoPersonalizado(campoId);
  }

  @Patch('campos-personalizados/:campoId')
  @ApiOperation({
    summary: 'Actualizar visibilidad/obligatoriedad de un campo personalizado',
  })
  actualizarCampoPersonalizado(
    @Param('campoId') campoId: string,
    @Body(new ZodValidationPipe(actualizarCampoPersonalizadoSchema))
    dto: ActualizarCampoPersonalizadoDto,
  ) {
    return this.service.actualizarCampoPersonalizado(campoId, dto);
  }
}
