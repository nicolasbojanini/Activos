import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CAMPOS_ACTIVO_CATALOGO,
  CAMPOS_BLOQUEADOS,
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
   * hay). Los campos bloqueados (ver CAMPOS_BLOQUEADOS) ignoran cualquier
   * override guardado — siempre visible/obligatorio — por si quedó una fila
   * vieja de antes de que el campo se bloqueara (`actualizar()` ya rechaza
   * escribir una fila así hacia adelante, pero esto blinda también la
   * lectura de una que haya quedado de antes, que es justo lo que le pasó a
   * Decameron con "ubicacion").
   */
  async obtenerCampos(clienteId: string) {
    const guardados = await this.control.configuracionCampo.findMany({
      where: { clienteId },
    });
    const guardadosPorCampo = new Map(guardados.map((g) => [g.campo, g]));

    return CAMPOS_ACTIVO_CATALOGO.map((catalogo) => {
      if (CAMPOS_BLOQUEADOS.includes(catalogo.campo)) {
        return {
          campo: catalogo.campo,
          etiqueta: catalogo.etiqueta,
          tipo: catalogo.tipo,
          visible: true,
          requerido: true,
          orden: guardadosPorCampo.get(catalogo.campo)?.orden ?? 0,
          sugerencias: false,
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
        // Clamp defensivo: aunque quedara una fila guardada con sugerencias=true
        // de antes de que el campo dejara de ser elegible, nunca se expone así.
        sugerencias: catalogo.permiteSugerencias
          ? (override?.sugerencias ?? false)
          : false,
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
        CAMPOS_BLOQUEADOS.includes(item.campo) &&
        (!item.visible || !item.requerido)
      ) {
        throw new BadRequestException(
          `El campo "${item.campo}" no se puede ocultar ni volver opcional`,
        );
      }
      const catalogo = CAMPOS_ACTIVO_CATALOGO.find(
        (c) => c.campo === item.campo,
      );
      if (item.sugerencias && !catalogo?.permiteSugerencias) {
        throw new BadRequestException(
          `El campo "${item.campo}" no admite sugerencias dinámicas`,
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
            sugerencias: item.sugerencias,
          },
          update: {
            visible: item.visible,
            requerido: item.requerido,
            sugerencias: item.sugerencias,
          },
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
      data: {
        clienteId,
        etiqueta: dto.etiqueta,
        requerido: dto.requerido,
        sugerencias: dto.sugerencias,
      },
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
