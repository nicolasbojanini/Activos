import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CAMPO_IDENTIDAD,
  CAMPOS_ACTIVO_CATALOGO,
  type ActualizarCampoPersonalizadoInput,
  type ActualizarConfiguracionCamposInput,
  type CrearCampoPersonalizadoInput,
} from '@adn/shared';
import { ControlPrismaService } from '../prisma/control-prisma.service';

@Injectable()
export class ConfiguracionCamposService {
  constructor(private readonly control: ControlPrismaService) {}

  /**
   * Combina el catálogo fijo con los overrides guardados del cliente (si los
   * hay). El campo identidad ignora cualquier override guardado — siempre
   * visible/obligatorio — por si quedó una fila vieja de antes de que ese
   * campo fuera la identidad (`actualizar()` ya rechaza escribir una fila así
   * hacia adelante, pero esto blinda también la lectura de una que haya
   * quedado de antes).
   */
  async obtenerCampos(clienteId: string) {
    const guardados = await this.control.configuracionCampo.findMany({
      where: { clienteId },
    });
    const guardadosPorCampo = new Map(guardados.map((g) => [g.campo, g]));

    return CAMPOS_ACTIVO_CATALOGO.map((catalogo) => {
      if (catalogo.campo === CAMPO_IDENTIDAD) {
        return {
          campo: catalogo.campo,
          etiqueta: catalogo.etiqueta,
          tipo: catalogo.tipo,
          visible: true,
          requerido: true,
          orden: guardadosPorCampo.get(catalogo.campo)?.orden ?? 0,
        };
      }
      const override = guardadosPorCampo.get(catalogo.campo);
      return {
        campo: catalogo.campo,
        etiqueta: catalogo.etiqueta,
        tipo: catalogo.tipo,
        visible: override?.visible ?? catalogo.defaultVisible,
        requerido: override?.requerido ?? catalogo.defaultRequerido,
        orden: override?.orden ?? 0,
      };
    });
  }

  async obtenerCamposPersonalizados(clienteId: string) {
    return this.control.campoPersonalizado.findMany({
      where: { clienteId },
      orderBy: { orden: 'asc' },
    });
  }

  /** Vista combinada para consumo de otros módulos (imports, activos). */
  async obtenerMapaCampos(clienteId: string) {
    const campos = await this.obtenerCampos(clienteId);
    return new Map(campos.map((c) => [c.campo, c]));
  }

  async actualizar(clienteId: string, dto: ActualizarConfiguracionCamposInput) {
    const cliente = await this.control.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    for (const item of dto.campos) {
      if (
        item.campo === CAMPO_IDENTIDAD &&
        (!item.visible || !item.requerido)
      ) {
        throw new BadRequestException(
          `El campo "${CAMPO_IDENTIDAD}" es el identificador único del activo — no se puede ocultar ni volver opcional`,
        );
      }
    }

    await this.control.$transaction(
      dto.campos.map((item) =>
        this.control.configuracionCampo.upsert({
          where: { clienteId_campo: { clienteId, campo: item.campo } },
          create: {
            clienteId,
            campo: item.campo,
            visible: item.visible,
            requerido: item.requerido,
          },
          update: { visible: item.visible, requerido: item.requerido },
        }),
      ),
    );

    return this.obtenerCampos(clienteId);
  }

  async crearCampoPersonalizado(
    clienteId: string,
    dto: CrearCampoPersonalizadoInput,
  ) {
    const cliente = await this.control.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return this.control.campoPersonalizado.create({
      data: { clienteId, etiqueta: dto.etiqueta, requerido: dto.requerido },
    });
  }

  async eliminarCampoPersonalizado(campoPersonalizadoId: string) {
    await this.control.campoPersonalizado.delete({
      where: { id: campoPersonalizadoId },
    });
  }

  async actualizarCampoPersonalizado(
    campoPersonalizadoId: string,
    dto: ActualizarCampoPersonalizadoInput,
  ) {
    return this.control.campoPersonalizado.update({
      where: { id: campoPersonalizadoId },
      data: dto,
    });
  }
}
