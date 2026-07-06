import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  activoImportRowSchema,
  type ImportCommitInput,
  type ImportErrorRow,
  type ImportPreviewOutput,
} from '@adn/shared';
import type {
  Prisma,
  PrismaClient as TenantPrismaClient,
} from '../../generated/tenant-client';
import { ProyectosService } from '../proyectos/proyectos.service';
import { ConfiguracionCamposService } from '../configuracion-campos/configuracion-campos.service';
import {
  normalizarCategoria,
  normalizarEstadoFisico,
  PREFIJO_CAMPO_PERSONALIZADO,
  sugerirMapeo,
  sugerirMapeoPersonalizados,
} from './imports.mapping';

@Injectable()
export class ImportsService {
  constructor(
    private readonly proyectosService: ProyectosService,
    private readonly configuracionCampos: ConfiguracionCamposService,
  ) {}

  async preview(
    file: Express.Multer.File,
    clienteId: string,
    hoja?: string,
  ): Promise<ImportPreviewOutput> {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    // Un libro con varias hojas (p.ej. hojas de trabajo previas + la hoja final
    // consolidada) no tiene por qué tener los datos reales en la primera —
    // el cliente web ya le pide al usuario elegir la hoja cuando hay más de
    // una; acá solo se cae a la primera cuando no llega ninguna (CSV, o un
    // libro de una sola hoja).
    if (hoja && !workbook.SheetNames.includes(hoja)) {
      throw new BadRequestException(
        `La hoja "${hoja}" no existe en este archivo`,
      );
    }
    const sheet = workbook.Sheets[hoja ?? workbook.SheetNames[0]];
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

    const campos = await this.configuracionCampos.obtenerCampos(clienteId);
    const camposVisibles = campos.filter((c) => c.visible).map((c) => c.campo);
    const camposPersonalizadosVisibles = (
      await this.configuracionCampos.obtenerCamposPersonalizados(clienteId)
    ).filter((cp) => cp.visible);

    return {
      columnasDetectadas,
      muestra,
      mapeoSugerido: {
        ...sugerirMapeo(columnasDetectadas, camposVisibles),
        ...sugerirMapeoPersonalizados(
          columnasDetectadas,
          camposPersonalizadosVisibles,
        ),
      },
    };
  }

  async commit(
    tenantPrisma: TenantPrismaClient,
    clienteId: string,
    autorId: string,
    archivoNombre: string,
    dto: ImportCommitInput,
  ) {
    const proyecto = await this.proyectosService.findOne(
      tenantPrisma,
      dto.proyectoId,
    );

    const mapaCampos =
      await this.configuracionCampos.obtenerMapaCampos(clienteId);
    const camposRequeridos = [...mapaCampos.values()].filter(
      (c) => c.visible && c.requerido,
    );
    const camposPersonalizados = (
      await this.configuracionCampos.obtenerCamposPersonalizados(clienteId)
    ).filter((cp) => cp.visible);

    const errores: ImportErrorRow[] = [];

    const ubicacionCache = new Map<string, string>();
    const resolverUbicacionId = async (sede: string | null | undefined) => {
      if (!sede) return null;
      const cacheKey = sede.trim().toLowerCase();
      if (ubicacionCache.has(cacheKey)) return ubicacionCache.get(cacheKey)!;

      const existente = await tenantPrisma.ubicacion.findFirst({
        where: { sede: { equals: sede.trim(), mode: 'insensitive' } },
      });
      const ubicacion =
        existente ??
        (await tenantPrisma.ubicacion.create({
          data: {
            sede: sede.trim(),
            codigo: await generarCodigoUbicacionUnico(tenantPrisma),
          },
        }));
      ubicacionCache.set(cacheKey, ubicacion.id);
      return ubicacion.id;
    };

    // Fase 1: valida y arma los datos de cada fila (barato, sin tocar Activo
    // todavía) — la resolución de ubicación sí pega a la base, pero está
    // cacheada por sede, así que su costo real es "sedes distintas", no
    // "filas". Separar validación de persistencia es lo que permite que la
    // fase 3 escriba en lotes concurrentes en vez de fila por fila.
    const filasValidas: {
      codigoNuevo: string;
      datos: Omit<Prisma.ActivoUncheckedCreateInput, 'codigoNuevo'>;
    }[] = [];

    for (let i = 0; i < dto.filas.length; i++) {
      const fila = dto.filas[i];
      const numeroFila = i + 1;

      // Defensa adicional a la del cliente web: una fila totalmente vacía
      // (típico de archivos Excel cuyo rango usado excede los datos reales)
      // se ignora en silencio en vez de reportarse como error de "código
      // nuevo obligatorio" — no es un dato mal cargado, es ruido del archivo.
      const esFilaVacia = (
        Object.values(fila) as (string | number | boolean | null | undefined)[]
      ).every(
        (valor) =>
          valor === null || valor === undefined || String(valor).trim() === '',
      );
      if (esFilaVacia) continue;

      const valorPor = (campo: string) => {
        const columna = dto.mapeo[campo];
        return columna ? fila[columna] : undefined;
      };

      const raw = {
        codigoNuevo:
          valorPor('codigoNuevo') != null
            ? String(valorPor('codigoNuevo'))
            : undefined,
        codigoAnterior:
          valorPor('codigoAnterior') != null
            ? String(valorPor('codigoAnterior'))
            : undefined,
        codigoControl:
          valorPor('codigoControl') != null
            ? String(valorPor('codigoControl'))
            : undefined,
        nombre:
          valorPor('nombre') != null ? String(valorPor('nombre')) : undefined,
        descripcion:
          valorPor('descripcion') != null
            ? String(valorPor('descripcion'))
            : undefined,
        categoria: normalizarCategoria(
          valorPor('categoria') as string | undefined,
        ),
        color:
          valorPor('color') != null ? String(valorPor('color')) : undefined,
        medidas:
          valorPor('medidas') != null ? String(valorPor('medidas')) : undefined,
        capacidad:
          valorPor('capacidad') != null
            ? String(valorPor('capacidad'))
            : undefined,
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

      if (!parsed.data.codigoNuevo) {
        errores.push({
          fila: numeroFila,
          campo: 'codigoNuevo',
          motivo: 'El código nuevo es obligatorio',
        });
        continue;
      }

      const datosParaFila = parsed.data as Record<string, unknown>;
      const campoFaltante = camposRequeridos.find((c) => {
        if (c.campo === 'ubicacion') {
          const valor = valorPor('ubicacion') as string | undefined;
          return valor == null || valor.trim() === '';
        }
        const valor = datosParaFila[c.campo];
        return valor === undefined || valor === null || valor === '';
      });
      if (campoFaltante) {
        errores.push({
          fila: numeroFila,
          campo: campoFaltante.campo,
          motivo: `El campo "${campoFaltante.etiqueta}" es obligatorio para este cliente`,
        });
        continue;
      }

      // Igual que los campos del catálogo estándar: se lee por su clave de
      // mapeo propia (`personalizado:<id>`) y se re-escribe entero en cada
      // importación — un campo personalizado sin columna mapeada en este
      // archivo queda vacío, el mismo comportamiento de "resincronización
      // total" que ya aplica a nombre/serie/marca/etc.
      const camposPersonalizadosValores: Record<string, string> = {};
      for (const cp of camposPersonalizados) {
        const columna = dto.mapeo[`${PREFIJO_CAMPO_PERSONALIZADO}${cp.id}`];
        const valor = columna
          ? (fila[columna] as string | number | boolean | null | undefined)
          : undefined;
        if (valor != null && String(valor).trim() !== '') {
          camposPersonalizadosValores[cp.id] = String(valor);
        }
      }
      const personalizadoFaltante = camposPersonalizados.find(
        (cp) => cp.requerido && !camposPersonalizadosValores[cp.id]?.trim(),
      );
      if (personalizadoFaltante) {
        errores.push({
          fila: numeroFila,
          campo: `${PREFIJO_CAMPO_PERSONALIZADO}${personalizadoFaltante.id}`,
          motivo: `El campo "${personalizadoFaltante.etiqueta}" es obligatorio para este cliente`,
        });
        continue;
      }

      const ubicacionId = await resolverUbicacionId(
        valorPor('ubicacion') as string | undefined,
      );

      const datos = {
        nombre: parsed.data.nombre ?? '',
        descripcion: parsed.data.descripcion ?? null,
        categoria: parsed.data.categoria ?? 'OTRO',
        codigoAnterior: parsed.data.codigoAnterior ?? null,
        codigoControl: parsed.data.codigoControl ?? null,
        color: parsed.data.color ?? null,
        medidas: parsed.data.medidas ?? null,
        capacidad: parsed.data.capacidad ?? null,
        marca: parsed.data.marca ?? null,
        modelo: parsed.data.modelo ?? null,
        serie: parsed.data.serie ?? null,
        ubicacionId,
        responsable: parsed.data.responsable ?? null,
        centroCosto: parsed.data.centroCosto ?? null,
        estadoFisico: parsed.data.estadoFisico,
        fechaAdquisicion: parsed.data.fechaAdquisicion ?? null,
        valorLibros: parsed.data.valorLibros ?? null,
        proveedor: parsed.data.proveedor ?? null,
        vidaUtilMeses: parsed.data.vidaUtilMeses ?? null,
        ...(camposPersonalizados.length > 0
          ? { camposPersonalizados: camposPersonalizadosValores }
          : {}),
      };

      filasValidas.push({ codigoNuevo: parsed.data.codigoNuevo, datos });
    }

    // Fase 2: un solo findMany (en lotes, por si el IN crece demasiado) para
    // saber qué codigoNuevo ya existían ANTES de este import — así el conteo
    // creadas/actualizadas no necesita un findUnique por fila. Si el mismo
    // codigoNuevo aparece dos veces en el propio archivo, ambas ocurrencias
    // se cuentan igual (con el estado "antes del import"); el dato final en
    // la base es correcto de todas formas porque el upsert es last-write-wins.
    const codigosUnicos = [...new Set(filasValidas.map((f) => f.codigoNuevo))];
    const existentesAntes = new Set<string>();
    for (const lote of enLotes(codigosUnicos, 2000)) {
      const filas = await tenantPrisma.activo.findMany({
        where: { codigoNuevo: { in: lote } },
        select: { codigoNuevo: true },
      });
      for (const fila of filas) existentesAntes.add(fila.codigoNuevo);
    }

    // Fase 3: persiste en lotes concurrentes (no uno por uno) — el cuello de
    // botella real de una importación grande es la latencia de ida y vuelta a
    // la base, no el trabajo que hace Postgres por fila, así que superponer
    // varias peticiones a la vez reduce el tiempo total de forma casi lineal
    // con la concurrencia, sin necesidad de reescribir esto como SQL crudo.
    let creadas = 0;
    let actualizadas = 0;
    const CONCURRENCIA = 25;
    for (const lote of enLotes(filasValidas, CONCURRENCIA)) {
      await Promise.all(
        lote.map((f) =>
          tenantPrisma.activo.upsert({
            where: { codigoNuevo: f.codigoNuevo },
            create: { codigoNuevo: f.codigoNuevo, ...f.datos },
            update: f.datos,
          }),
        ),
      );
      for (const f of lote) {
        if (existentesAntes.has(f.codigoNuevo)) actualizadas++;
        else creadas++;
      }
    }

    return tenantPrisma.loteImportacion.create({
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

function enLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

async function generarCodigoUbicacionUnico(
  tenantPrisma: TenantPrismaClient,
): Promise<string> {
  for (let intento = 0; intento < 5; intento++) {
    const candidato = `UBI-${randomBytes(4).toString('hex').toUpperCase()}`;
    const existe = await tenantPrisma.ubicacion.findFirst({
      where: { codigo: candidato },
    });
    if (!existe) return candidato;
  }
  throw new Error('No se pudo generar un código único de ubicación');
}
