import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CategoriaActivo,
  ConfirmarFotosInput,
  RegistroAuditoriaInput,
} from '@adn/shared';
import { Prisma } from '../../generated/tenant-client';
import type {
  Activo,
  PrismaClient as TenantPrismaClient,
} from '../../generated/tenant-client';
import { ProyectosService } from '../proyectos/proyectos.service';
import { S3Service } from '../files/s3.service';
import { resolverUbicacionIdPorNombre } from '../ubicaciones/resolver-ubicacion-por-nombre';

export interface UploadEntry {
  clientPhotoId: string;
  uploadUrl: string;
  s3Key: string;
}

/**
 * Campos de texto opcionales del catálogo, aplicables tal cual desde
 * `cambios`. `codigoAnterior` NO está acá a propósito — es la llave de
 * identidad del activo (@@unique), no se cambia por esta vía genérica.
 */
const CAMPOS_TEXTO_OPCIONAL = [
  'codigoNuevo',
  'codigoControl',
  'descripcion',
  'color',
  'medidas',
  'capacidad',
  'marca',
  'modelo',
  'serie',
  'responsable',
  'centroCosto',
  'proveedor',
] as const;
type CampoTextoOpcional = (typeof CAMPOS_TEXTO_OPCIONAL)[number];

function esCampoTextoOpcional(campo: string): campo is CampoTextoOpcional {
  return (CAMPOS_TEXTO_OPCIONAL as readonly string[]).includes(campo);
}

/** Prefijo de clave usado en `cambios` para diffs de CampoPersonalizado: `personalizado:<id>`. */
const PREFIJO_CAMPO_PERSONALIZADO = 'personalizado:';

function aTextoPlano(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') {
    return String(valor);
  }
  return '';
}

@Injectable()
export class RegistrosService {
  constructor(
    private readonly proyectosService: ProyectosService,
    private readonly s3: S3Service,
  ) {}

  private construirS3Key(registroId: string, clientPhotoId: string): string {
    return `fotos/${registroId}/${clientPhotoId}.jpg`;
  }

  private extraerClientPhotoId(s3Key: string): string {
    return s3Key.split('/').pop()!.replace('.jpg', '');
  }

  /**
   * Idempotente por clientId: un reintento de sincronización con el mismo
   * clientId nunca duplica el registro.
   */
  async crear(
    tenantPrisma: TenantPrismaClient,
    auditorId: string,
    dto: RegistroAuditoriaInput,
  ) {
    const existente = await tenantPrisma.registroAuditoria.findUnique({
      where: { clientId: dto.clientId },
      include: { fotos: true },
    });
    if (existente) {
      // Reintento idempotente: regenera URLs de subida solo para las fotos que aún no se confirmaron.
      const fotosPendientes = existente.fotos.filter(
        (foto) => foto.bytes === null,
      );
      const uploads: UploadEntry[] = await Promise.all(
        fotosPendientes.map(async (foto) => ({
          clientPhotoId: this.extraerClientPhotoId(foto.s3Key),
          s3Key: foto.s3Key,
          uploadUrl: await this.s3.generarUrlSubida(foto.s3Key),
        })),
      );
      return { registro: existente, uploads };
    }

    const proyecto = await this.proyectosService.findOne(
      tenantPrisma,
      dto.proyectoId,
    );

    if (!dto.activoId && dto.estado !== 'NO_REGISTRADO') {
      throw new BadRequestException(
        'activoId es obligatorio salvo para el estado NO_REGISTRADO',
      );
    }

    const activo = dto.activoId
      ? await tenantPrisma.activo.findFirst({
          where: { id: dto.activoId, deletedAt: null },
        })
      : null;
    if (dto.activoId && !activo) {
      throw new NotFoundException('Activo no encontrado');
    }

    const fotosConKey = dto.fotos.map((foto) => ({
      ...foto,
      s3Key: this.construirS3Key(dto.clientId, foto.clientPhotoId),
    }));

    const registro = await tenantPrisma.$transaction(async (tx) => {
      // NO_REGISTRADO ya no queda como hallazgo huérfano a la espera de que el
      // coordinador lo promueva: el activo se da de alta en el mismo momento en
      // que el auditor lo escanea, con los datos mínimos que capturó en campo.
      const activoNuevo =
        !activo && dto.estado === 'NO_REGISTRADO'
          ? await this.crearActivoDesdeHallazgo(tx, dto)
          : null;
      const activoParaCambios = activo ?? activoNuevo;

      const creado = await tx.registroAuditoria.create({
        data: {
          proyectoId: proyecto.id,
          activoId: activoParaCambios?.id ?? dto.activoId,
          auditorId,
          estado: dto.estado,
          estadoFisico: dto.estadoFisico ?? null,
          cambios: dto.cambios
            ? (dto.cambios as Prisma.InputJsonValue)
            : undefined,
          nota: dto.nota,
          lat: dto.lat,
          lng: dto.lng,
          auditadoEn: dto.auditadoEn,
          clientId: dto.clientId,
        },
      });

      if (activoParaCambios) {
        await this.aplicarCambiosAActivo(tx, activoParaCambios.id, dto);
      }

      if (fotosConKey.length > 0) {
        await tx.foto.createMany({
          data: fotosConKey.map((foto) => ({
            registroId: creado.id,
            s3Key: foto.s3Key,
            etiqueta: foto.etiqueta,
            orden: foto.orden,
          })),
        });
      }

      if (activoParaCambios) {
        await this.heredarFotosFaltantes(
          tx,
          activoParaCambios.id,
          creado.id,
          new Set(fotosConKey.map((foto) => foto.orden)),
        );
      }

      return tx.registroAuditoria.findUniqueOrThrow({
        where: { id: creado.id },
        include: { fotos: true },
      });
    });

    const uploads: UploadEntry[] = await Promise.all(
      fotosConKey.map(async (foto) => ({
        clientPhotoId: foto.clientPhotoId,
        s3Key: foto.s3Key,
        uploadUrl: await this.s3.generarUrlSubida(foto.s3Key),
      })),
    );

    return { registro, uploads };
  }

  /** Confirma que las fotos ya se subieron a S3 y completa sus metadatos (ancho/alto/bytes). */
  async confirmarFotos(
    tenantPrisma: TenantPrismaClient,
    registroId: string,
    dto: ConfirmarFotosInput,
  ) {
    const registro = await tenantPrisma.registroAuditoria.findFirst({
      where: { id: registroId },
    });
    if (!registro) {
      throw new NotFoundException('Registro no encontrado');
    }

    await Promise.all(
      dto.fotos.map((foto) =>
        tenantPrisma.foto.updateMany({
          where: { registroId, s3Key: foto.s3Key },
          data: { ancho: foto.ancho, alto: foto.alto, bytes: foto.bytes },
        }),
      ),
    );

    return tenantPrisma.foto.findMany({ where: { registroId } });
  }

  /**
   * Las fotos son un "campo" más con última-versión-gana, igual que el resto
   * de la ficha (ver aplicarCambiosAActivo): si el auditor no retoma un slot
   * (p. ej. deja "N° de serie" sin repetir porque no cambió), este registro
   * nuevo hereda la última foto conocida de ese slot en vez de quedar sin
   * ella. Sin esto, ultimoRegistroPorActivo (que usa el ZIP de fotos y
   * cualquier vista de "estado actual") solo ve el registro más reciente —
   * si no trae todas las fotos, las anteriores parecen borradas aunque sigan
   * intactas en S3, solo que colgadas de un registro viejo.
   *
   * No duplica el archivo en S3: el Foto nuevo apunta al mismo s3Key que el
   * heredado, así que no hace falta descargar/resubir nada.
   */
  private async heredarFotosFaltantes(
    tx: Prisma.TransactionClient,
    activoId: string,
    registroNuevoId: string,
    ordenesNuevos: Set<number>,
  ) {
    const ultimaPorOrden = await tx.$queryRaw<
      {
        s3Key: string;
        etiqueta: string | null;
        orden: number;
        ancho: number | null;
        alto: number | null;
        bytes: number | null;
      }[]
    >`
      SELECT DISTINCT ON (f.orden) f."s3Key", f.etiqueta, f.orden, f.ancho, f.alto, f.bytes
      FROM "Foto" f
      JOIN "RegistroAuditoria" r ON r.id = f."registroId"
      WHERE r."activoId" = ${activoId} AND r.id != ${registroNuevoId}
      ORDER BY f.orden, r."auditadoEn" DESC, r.id DESC, f."createdAt" DESC
    `;

    const heredadas = ultimaPorOrden.filter((f) => !ordenesNuevos.has(f.orden));
    if (heredadas.length === 0) return;

    await tx.foto.createMany({
      data: heredadas.map((f) => ({
        registroId: registroNuevoId,
        s3Key: f.s3Key,
        etiqueta: f.etiqueta,
        orden: f.orden,
        ancho: f.ancho,
        alto: f.alto,
        bytes: f.bytes,
      })),
    });
  }

  /**
   * Da de alta el Activo detrás de un hallazgo NO_REGISTRADO, tomando codigoAnterior/
   * nombre/categoria de `cambios` (siempre presentes: los llena NoRegistradoScreen
   * en mobile, con el código físico que el auditor escaneó). Si el código ya existe
   * — otro auditor registró el mismo hallazgo en paralelo, o alguien lo escaneó dos
   * veces antes de que el espejo local se refrescara — reutiliza el Activo existente
   * en vez de fallar por duplicado.
   */
  private async crearActivoDesdeHallazgo(
    tx: Prisma.TransactionClient,
    dto: RegistroAuditoriaInput,
  ): Promise<Activo> {
    const cambios = dto.cambios ?? {};
    const codigoAnterior = (
      cambios.codigoAnterior as { despues?: unknown } | undefined
    )?.despues as string | undefined;
    const nombre = (cambios.nombre as { despues?: unknown } | undefined)
      ?.despues as string | undefined;
    const categoria = (cambios.categoria as { despues?: unknown } | undefined)
      ?.despues as CategoriaActivo | undefined;

    if (!codigoAnterior || !nombre || !categoria) {
      throw new BadRequestException(
        'codigoAnterior, nombre y categoria son obligatorios para registrar un activo nuevo',
      );
    }

    const existente = await tx.activo.findFirst({
      where: { codigoAnterior },
    });
    if (existente) return existente;

    try {
      return await tx.activo.create({
        data: { codigoAnterior, nombre, categoria },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return tx.activo.findFirstOrThrow({ where: { codigoAnterior } });
      }
      throw err;
    }
  }

  /**
   * "Last-write-wins" a nivel de campo sobre el Activo: la ficha siempre
   * refleja el último valor conocido, mientras que el RegistroAuditoria
   * preserva la historia completa e inmutable de cada captura. Aplica
   * cualquier campo del catálogo presente en `cambios` (no solo un subconjunto
   * fijo), y mergea `camposPersonalizados` en vez de sobreescribirlo entero.
   */
  private async aplicarCambiosAActivo(
    tx: Prisma.TransactionClient,
    activoId: string,
    dto: RegistroAuditoriaInput,
  ) {
    const data: Prisma.ActivoUpdateInput = {};

    if (dto.estadoFisico) {
      data.estadoFisico = dto.estadoFisico;
    }

    if (dto.cambios) {
      const camposPersonalizadosNuevos: Record<string, string> = {};

      for (const [campo, diff] of Object.entries(dto.cambios)) {
        const despues = (diff as { despues?: unknown }).despues;

        if (campo === 'ubicacionId') {
          data.ubicacion = despues
            ? { connect: { id: despues as string } }
            : { disconnect: true };
        } else if (campo === 'ubicacionNombre') {
          // Ubicación activa móvil: el auditor la escribe a mano, sin
          // escanear ni validar contra la base (funciona offline) — acá,
          // con red y DB disponibles, se resuelve o crea la Ubicacion por
          // nombre (case-insensitive) y recién ahí se conecta al activo.
          data.ubicacion = despues
            ? {
                connect: {
                  id: await resolverUbicacionIdPorNombre(tx, despues as string),
                },
              }
            : { disconnect: true };
        } else if (campo === 'nombre') {
          if (despues) data.nombre = despues;
        } else if (esCampoTextoOpcional(campo)) {
          data[campo] = (despues as string) ?? null;
        } else if (campo === 'categoria') {
          if (despues) data.categoria = despues;
        } else if (campo === 'estadoFisico') {
          if (despues) data.estadoFisico = despues;
        } else if (campo === 'fechaAdquisicion') {
          data.fechaAdquisicion = despues ? new Date(despues as string) : null;
        } else if (campo === 'valorLibros') {
          data.valorLibros = despues != null ? Number(despues) : null;
        } else if (campo === 'vidaUtilMeses') {
          data.vidaUtilMeses = despues != null ? Number(despues) : null;
        } else if (campo.startsWith(PREFIJO_CAMPO_PERSONALIZADO)) {
          const id = campo.slice(PREFIJO_CAMPO_PERSONALIZADO.length);
          camposPersonalizadosNuevos[id] = aTextoPlano(despues);
        }
      }

      if (Object.keys(camposPersonalizadosNuevos).length > 0) {
        const activo = await tx.activo.findUniqueOrThrow({
          where: { id: activoId },
        });
        const actuales =
          (activo.camposPersonalizados as Record<string, string> | null) ?? {};
        data.camposPersonalizados = {
          ...actuales,
          ...camposPersonalizadosNuevos,
        };
      }
    }

    if (Object.keys(data).length > 0) {
      await tx.activo.update({ where: { id: activoId }, data });
    }
  }
}
