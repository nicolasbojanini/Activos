import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Rol } from '@adn/shared';
import { ClientesService } from './clientes.service';
import {
  crearClienteSchema,
  type CrearClienteDto,
} from './dto/crear-cliente.dto';
import {
  actualizarClienteSchema,
  type ActualizarClienteDto,
} from './dto/actualizar-cliente.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @Roles(Rol.ADN_ADMIN, Rol.COORDINADOR)
  @ApiOperation({ summary: 'Listar clientes' })
  findAll() {
    return this.clientesService.findAll();
  }

  @Post()
  @Roles(Rol.ADN_ADMIN)
  @ApiOperation({
    summary:
      'Dar de alta un cliente nuevo: crea y migra su base de datos física',
  })
  crear(@Body(new ZodValidationPipe(crearClienteSchema)) dto: CrearClienteDto) {
    return this.clientesService.crear(dto);
  }

  @Patch(':clienteId')
  @Roles(Rol.ADN_ADMIN)
  @ApiOperation({
    summary:
      'Suspender un cliente (bloquea el acceso, conserva la base de datos) o reactivarlo',
  })
  actualizarEstado(
    @Param('clienteId') clienteId: string,
    @Body(new ZodValidationPipe(actualizarClienteSchema))
    dto: ActualizarClienteDto,
  ) {
    return this.clientesService.actualizarEstado(clienteId, dto);
  }

  @Delete(':clienteId')
  @Roles(Rol.ADN_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Eliminar permanentemente un cliente suspendido: borra su base de datos física (irreversible)',
  })
  eliminar(@Param('clienteId') clienteId: string) {
    return this.clientesService.eliminar(clienteId);
  }
}
