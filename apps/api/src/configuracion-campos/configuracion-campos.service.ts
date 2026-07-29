import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CAMPO_IDENTIDAD,
  CAMPOS_ACTIVO_CATALOGO,
  type ActualizarCampoPersonalizadoInput,
  type ActualizarCampoUbicacionInput,
  type ActualizarConfiguracionCamposInput,
  type ActualizarFotoObligatoriaInput,
  type CrearCampoPersonalizadoInput,
  type CrearCampoUbicacionInput,
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

  /**
   * A diferencia de los campos de la ficha, las fotos no son parte del
   * catálogo (packages/shared/src/campos-catalogo.ts) — es un único
   * interruptor por cliente, guardado directo en Cliente en vez de en
   * ConfiguracionCampo, porque solo hay un slot ("Vista general") que puede
   * ser obligatorio.
   */
  async obtenerFotoObligatoria(clienteId: string): Promise<boolean> {
    const cliente = await this.control.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { fotoObligatoria: true },
    });
    return cliente.fotoObligatoria;
  }

  async actualizarFotoObligatoria(
    clienteId: string,
    dto: ActualizarFotoObligatoriaInput,
  ) {
    return this.control.cliente.update({
      where: { id: clienteId },
      data: { fotoObligatoria: dto.fotoObligatoria },
      select: { fotoObligatoria: true },
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

  async obtenerCamposUbicacion(clienteId: string) {
    return this.control.campoUbicacion.findMany({
      where: { clienteId },
      orderBy: { orden: 'asc' },
    });
  }

  /**
   * "Ubicación" (el campo base) no vive en esta tabla — es fijo, siempre
   * presente. Estas filas son los campos ADICIONALES (Torre, Piso, etc.), y
   * la ubicación activa admite hasta 6 campos en total, así que acá el tope
   * es 5.
   */
  async crearCampoUbicacion(clienteId: string, dto: CrearCampoUbicacionInput) {
    const cliente = await this.control.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    const actuales = await this.control.campoUbicacion.count({
      where: { clienteId },
    });
    if (actuales >= 5) {
      throw new BadRequestException(
        'La ubicación activa admite máximo 6 campos en total (5 adicionales, más "Ubicación") — elimina uno antes de agregar otro',
      );
    }
    return this.control.campoUbicacion.create({
      data: { clienteId, etiqueta: dto.etiqueta, requerido: dto.requerido },
    });
  }

  async eliminarCampoUbicacion(campoUbicacionId: string) {
    await this.control.campoUbicacion.delete({
      where: { id: campoUbicacionId },
    });
  }

  async actualizarCampoUbicacion(
    campoUbicacionId: string,
    dto: ActualizarCampoUbicacionInput,
  ) {
    return this.control.campoUbicacion.update({
      where: { id: campoUbicacionId },
      data: dto,
    });
  }
}
