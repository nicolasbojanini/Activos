import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import {
  activoImportRowSchema,
  type ImportCommitInput,
  type ImportErrorRow,
  type ImportPreviewOutput,
} from '@adn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProyectosService } from '../proyectos/proyectos.service';
import {
  normalizarCategoria,
  normalizarEstadoFisico,
  sugerirMapeo,
} from './imports.mapping';

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proyectosService: ProyectosService,
  ) {}

  preview(file: Express.Multer.File): ImportPreviewOutput {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      throw new BadRequestException('El archivo no contiene hojas de datos');
    }

    const [headerRow] = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      range: 0,
      blankrows: false,
    });
    const columnasDetectadas = (headerRow ?? []).map(String).filter(Boolean);
    const muestra = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
      .slice(0, 5);

    return {
      columnasDetectadas,
      muestra,
      mapeoSugerido: sugerirMapeo(columnasDetectadas),
    };
  }

  async commit(
    organizacionId: string,
    autorId: string,
    archivoNombre: string,
    dto: ImportCommitInput,
  ) {
    const proyecto = await this.proyectosService.findOne(
      organizacionId,
      dto.proyectoId,
    );

    const errores: ImportErrorRow[] = [];
    let creadas = 0;
    let actualizadas = 0;

    const ubicacionCache = new Map<string, string>();
    const resolverUbicacionId = async (sede: string | null | undefined) => {
      if (!sede) return null;
      const cacheKey = sede.trim().toLowerCase();
      if (ubicacionCache.has(cacheKey)) return ubicacionCache.get(cacheKey)!;

      const existente = await this.prisma.ubicacion.findFirst({
        where: {
          organizacionId,
          sede: { equals: sede.trim(), mode: 'insensitive' },
        },
      });
      const ubicacion =
        existente ??
        (await this.prisma.ubicacion.create({
          data: { organizacionId, sede: sede.trim() },
        }));
      ubicacionCache.set(cacheKey, ubicacion.id);
      return ubicacion.id;
    };

    for (let i = 0; i < dto.filas.length; i++) {
      const fila = dto.filas[i];
      const numeroFila = i + 1;

      const valorPor = (campo: string) => {
        const columna = dto.mapeo[campo];
        return columna ? fila[columna] : undefined;
      };

      const raw = {
        placa:
          valorPor('placa') != null ? String(valorPor('placa')) : undefined,
        codigoQR:
          valorPor('codigoQR') != null
            ? String(valorPor('codigoQR'))
            : undefined,
        nombre:
          valorPor('nombre') != null ? String(valorPor('nombre')) : undefined,
        categoria: normalizarCategoria(
          valorPor('categoria') as string | undefined,
        ),
        marca:
          valorPor('marca') != null ? String(valorPor('marca')) : undefined,
        modelo:
          valorPor('modelo') != null ? String(valorPor('modelo')) : undefined,
        serie:
          valorPor('serie') != null ? String(valorPor('serie')) : undefined,
        responsable:
          valorPor('responsable') != null
            ? String(valorPor('responsable'))
            : undefined,
        centroCosto:
          valorPor('centroCosto') != null
            ? String(valorPor('centroCosto'))
            : undefined,
        estadoFisico: normalizarEstadoFisico(
          valorPor('estadoFisico') as string | undefined,
        ),
        fechaAdquisicion: valorPor('fechaAdquisicion') ?? undefined,
        valorLibros: valorPor('valorLibros') ?? undefined,
        proveedor:
          valorPor('proveedor') != null
            ? String(valorPor('proveedor'))
            : undefined,
        vidaUtilMeses: valorPor('vidaUtilMeses') ?? undefined,
      };

      const parsed = activoImportRowSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        errores.push({
          fila: numeroFila,
          campo: issue.path.join('.') || 'desconocido',
          motivo: issue.message,
        });
        continue;
      }

      if (!parsed.data.placa) {
        errores.push({
          fila: numeroFila,
          campo: 'placa',
          motivo: 'La placa es obligatoria',
        });
        continue;
      }

      const ubicacionId = await resolverUbicacionId(
        valorPor('ubicacion') as string | undefined,
      );

      const existente = await this.prisma.activo.findUnique({
        where: {
          organizacionId_placa: { organizacionId, placa: parsed.data.placa },
        },
      });

      await this.prisma.activo.upsert({
        where: {
          organizacionId_placa: { organizacionId, placa: parsed.data.placa },
        },
        create: {
          organizacionId,
          placa: parsed.data.placa,
          codigoQR: parsed.data.codigoQR || parsed.data.placa,
          nombre: parsed.data.nombre,
          categoria: parsed.data.categoria,
          marca: parsed.data.marca,
          modelo: parsed.data.modelo,
          serie: parsed.data.serie,
          ubicacionId,
          responsable: parsed.data.responsable,
          centroCosto: parsed.data.centroCosto,
          estadoFisico: parsed.data.estadoFisico,
          fechaAdquisicion: parsed.data.fechaAdquisicion,
          valorLibros: parsed.data.valorLibros,
          proveedor: parsed.data.proveedor,
          vidaUtilMeses: parsed.data.vidaUtilMeses,
        },
        update: {
          nombre: parsed.data.nombre,
          categoria: parsed.data.categoria,
          marca: parsed.data.marca,
          modelo: parsed.data.modelo,
          serie: parsed.data.serie,
          ubicacionId,
          responsable: parsed.data.responsable,
          centroCosto: parsed.data.centroCosto,
          estadoFisico: parsed.data.estadoFisico,
          fechaAdquisicion: parsed.data.fechaAdquisicion,
          valorLibros: parsed.data.valorLibros,
          proveedor: parsed.data.proveedor,
          vidaUtilMeses: parsed.data.vidaUtilMeses,
        },
      });

      if (existente) actualizadas++;
      else creadas++;
    }

    return this.prisma.loteImportacion.create({
      data: {
        proyectoId: proyecto.id,
        archivoNombre,
        filasTotales: dto.filas.length,
        filasCreadas: creadas,
        filasActualizadas: actualizadas,
        filasError: errores.length,
        erroresJson: errores as unknown as Prisma.InputJsonValue,
        autorId,
      },
    });
  }
}
