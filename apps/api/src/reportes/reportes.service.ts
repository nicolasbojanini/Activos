import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { Archiver, ZipArchive } from 'archiver';
import type { ReporteFormato } from '@adn/shared';
import type {
  Activo,
  PrismaClient as TenantPrismaClient,
  Ubicacion,
} from '../../generated/tenant-client';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import { resolverNombresAuditores } from '../common/resolver-nombres-auditores';
import { ProyectosService } from '../proyectos/proyectos.service';
import { S3Service } from '../files/s3.service';
import { ConfiguracionCamposService } from '../configuracion-campos/configuracion-campos.service';

const ESTADO_FISICO_LABEL: Record<string, string> = {
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  MALO: 'Malo',
  BAJA: 'De baja',
};

/** Valor de un campo del catálogo estándar para una fila del reporte "Estado por activo". */
function valorCampoActivo(
  activo: Activo & { ubicacion: Ubicacion | null },
  campo: string,
): string {
  switch (campo) {
    case 'codigoNuevo':
      return activo.codigoNuevo;
    case 'codigoAnterior':
      return activo.codigoAnterior ?? '';
    case 'codigoControl':
      return activo.codigoControl ?? '';
    case 'nombre':
      return activo.nombre;
    case 'descripcion':
      return activo.descripcion ?? '';
    case 'ubicacion':
      return activo.ubicacion?.sede ?? '';
    case 'color':
      return activo.color ?? '';
    case 'medidas':
      return activo.medidas ?? '';
    case 'capacidad':
      return activo.capacidad ?? '';
    case 'marca':
      return activo.marca ?? '';
    case 'modelo':
      return activo.modelo ?? '';
    case 'serie':
      return activo.serie ?? '';
    case 'estadoFisico':
      return ESTADO_FISICO_LABEL[activo.estadoFisico] ?? activo.estadoFisico;
    case 'responsable':
      return activo.responsable ?? '';
    case 'centroCosto':
      return activo.centroCosto ?? '';
    case 'categoria':
      return activo.categoria.replace('_', ' ');
    case 'fechaAdquisicion':
      return activo.fechaAdquisicion
        ? new Date(activo.fechaAdquisicion).toLocaleDateString('es-CO', {
            timeZone: 'America/Bogota',
          })
        : '';
    case 'valorLibros':
      return activo.valorLibros != null ? String(activo.valorLibros) : '';
    case 'proveedor':
      return activo.proveedor ?? '';
    case 'vidaUtilMeses':
      return activo.vidaUtilMeses != null ? String(activo.vidaUtilMeses) : '';
    default:
      return '';
  }
}

interface FilaCambio {
  Código: string;
  Activo: string;
  Cambios: string;
  Nota: string;
  Auditor: string;
  Fecha: string;
}

interface FilaNoRegistrado {
  'Código nuevo': string;
  Descripción: string;
  Categoría: string;
  Nota: string;
  Auditor: string;
  Fecha: string;
}

function formatearFecha(fecha: Date | null | undefined): string {
  return fecha
    ? new Date(fecha).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      })
    : '';
}

function aTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean')
    return String(valor);
  return JSON.stringify(valor);
}

function formatearCambios(cambios: unknown): string {
  if (!cambios || typeof cambios !== 'object') return '';
  return Object.entries(
    cambios as Record<string, { antes?: unknown; despues?: unknown }>,
  )
    .map(
      ([campo, diff]) =>
        `${campo}: ${aTexto(diff.antes)} → ${aTexto(diff.despues)}`,
    )
    .join('; ');
}

@Injectable()
export class ReportesService {
  constructor(
    private readonly control: ControlPrismaService,
    private readonly proyectosService: ProyectosService,
    private readonly s3: S3Service,
    private readonly configuracionCampos: ConfiguracionCamposService,
  ) {}

  /**
   * ZIP con las fotos confirmadas del último registro de cada activo del
   * proyecto (activos sin fotos se omiten). Nombre de archivo:
   * `{codigoNuevo}-{consecutivo}.jpg`, consecutivo = orden + 1 dentro de ese activo.
   */
  async generarZipFotos(
    tenantPrisma: TenantPrismaClient,
    proyectoId: string,
  ): Promise<{ archive: Archiver; filename: string }> {
    const proyecto = await this.proyectosService.findOne(
      tenantPrisma,
      proyectoId,
    );
    const ultimoPorActivo = await this.proyectosService.ultimoRegistroPorActivo(
      tenantPrisma,
      proyecto.id,
    );

    const activos = await tenantPrisma.activo.findMany({
      where: { deletedAt: null, id: { in: [...ultimoPorActivo.keys()] } },
      select: { id: true, codigoNuevo: true },
    });

    const registroIds = [...ultimoPorActivo.values()].map((r) => r.id);
    const fotos =
      registroIds.length > 0
        ? await tenantPrisma.foto.findMany({
            where: { registroId: { in: registroIds }, bytes: { not: null } },
            orderBy: { orden: 'asc' },
          })
        : [];
    const fotosPorRegistro = new Map<string, typeof fotos>();
    for (const foto of fotos) {
      const lista = fotosPorRegistro.get(foto.registroId) ?? [];
      lista.push(foto);
      fotosPorRegistro.set(foto.registroId, lista);
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });

    for (const activo of activos) {
      const registro = ultimoPorActivo.get(activo.id);
      if (!registro) continue;
      const fotosDelActivo = fotosPorRegistro.get(registro.id) ?? [];
      for (const foto of fotosDelActivo) {
        const bytes = await this.s3.descargarObjeto(foto.s3Key);
        archive.append(bytes, {
          name: `${activo.codigoNuevo}-${foto.orden + 1}.jpg`,
        });
      }
    }

    void archive.finalize();

    const nombreArchivo = proyecto.nombre
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase();
    return { archive, filename: `fotos-${nombreArchivo}.zip` };
  }

  async generar(
    tenantPrisma: TenantPrismaClient,
    clienteId: string,
    proyectoId: string,
    formato: ReporteFormato,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const proyecto = await this.proyectosService.findOne(
      tenantPrisma,
      proyectoId,
    );
    const resumen = await this.proyectosService.resumen(
      tenantPrisma,
      proyectoId,
    );
    const ultimoPorActivo = await this.proyectosService.ultimoRegistroPorActivo(
      tenantPrisma,
      proyecto.id,
    );

    const activos = await tenantPrisma.activo.findMany({
      where: { deletedAt: null },
      include: { ubicacion: true },
      orderBy: { codigoNuevo: 'asc' },
    });

    const registrosNoRegistrados =
      await tenantPrisma.registroAuditoria.findMany({
        where: {
          proyectoId: proyecto.id,
          activoId: null,
          estado: 'NO_REGISTRADO',
        },
        orderBy: { auditadoEn: 'desc' },
      });
    const nombresNoRegistrados = await resolverNombresAuditores(
      this.control,
      registrosNoRegistrados.map((r) => r.auditorId),
    );

    // Columnas dinámicas: todo el catálogo estándar + los campos personalizados
    // marcados visibles para este cliente, en ese orden — nunca los ocultos.
    const camposVisibles = (
      await this.configuracionCampos.obtenerCampos(clienteId)
    ).filter((c) => c.visible);
    const camposPersonalizadosVisibles = (
      await this.configuracionCampos.obtenerCamposPersonalizados(clienteId)
    ).filter((cp) => cp.visible);

    const filasEstado: Record<string, string>[] = activos.map((activo) => {
      const registro = ultimoPorActivo.get(activo.id);
      const fila: Record<string, string> = {};
      for (const c of camposVisibles) {
        fila[c.etiqueta] = valorCampoActivo(activo, c.campo);
      }
      const valoresPersonalizados =
        (activo.camposPersonalizados as Record<string, string> | null) ?? {};
      for (const cp of camposPersonalizadosVisibles) {
        fila[cp.etiqueta] = valoresPersonalizados[cp.id] ?? '';
      }
      // Prefijo "auditoría" porque "Estado" ya es la etiqueta del campo
      // estadoFisico (Bueno/Regular/Malo/Baja) cuando está visible — sin el
      // prefijo, esta columna lo pisaría en el mismo objeto de fila.
      fila['Estado auditoría'] = registro?.estado ?? 'PENDIENTE';
      fila.Auditor = registro?.auditorNombre ?? '';
      fila.Fecha = formatearFecha(registro?.auditadoEn);
      return fila;
    });

    const filasDiferencias: FilaCambio[] = activos
      .map((activo) => ({ activo, registro: ultimoPorActivo.get(activo.id) }))
      .filter((r) => r.registro?.estado === 'DIFERENCIA')
      .map(({ activo, registro }) => ({
        Código: activo.codigoNuevo,
        Activo: activo.nombre,
        Cambios: formatearCambios(registro!.cambios),
        Nota: registro!.nota ?? '',
        Auditor: registro!.auditorNombre,
        Fecha: formatearFecha(registro!.auditadoEn),
      }));

    const filasFaltantes: FilaCambio[] = activos
      .map((activo) => ({ activo, registro: ultimoPorActivo.get(activo.id) }))
      .filter((r) => r.registro?.estado === 'FALTANTE')
      .map(({ activo, registro }) => ({
        Código: activo.codigoNuevo,
        Activo: activo.nombre,
        Cambios: '',
        Nota: registro!.nota ?? '',
        Auditor: registro!.auditorNombre,
        Fecha: formatearFecha(registro!.auditadoEn),
      }));

    const filasNoRegistrados: FilaNoRegistrado[] = registrosNoRegistrados.map(
      (registro) => {
        const cambios = registro.cambios as Record<
          string,
          { despues?: unknown }
        > | null;
        return {
          'Código nuevo':
            cambios?.codigoNuevo?.despues !== undefined
              ? aTexto(cambios.codigoNuevo.despues)
              : '',
          Descripción:
            cambios?.nombre?.despues !== undefined
              ? aTexto(cambios.nombre.despues)
              : '',
          Categoría:
            cambios?.categoria?.despues !== undefined
              ? aTexto(cambios.categoria.despues)
              : '',
          Nota: registro.nota ?? '',
          Auditor: nombresNoRegistrados.get(registro.auditorId) ?? '—',
          Fecha: formatearFecha(registro.auditadoEn),
        };
      },
    );

    const nombreArchivo = proyecto.nombre
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase();

    if (formato === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(
        XLSX.utils.json_to_sheet(filasEstado),
      );
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        contentType: 'text/csv',
        filename: `reporte-${nombreArchivo}.csv`,
      };
    }

    if (formato === 'pdf') {
      const buffer = await this.generarPDF(
        proyecto.nombre,
        resumen,
        filasDiferencias,
        filasFaltantes,
        filasNoRegistrados,
      );
      return {
        buffer,
        contentType: 'application/pdf',
        filename: `reporte-${nombreArchivo}.pdf`,
      };
    }

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(filasEstado),
      'Estado por activo',
    );
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(filasDiferencias),
      'Diferencias',
    );
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(filasFaltantes),
      'Faltantes',
    );
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(filasNoRegistrados),
      'No registrados',
    );
    const buffer = XLSX.write(libro, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;
    return {
      buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `reporte-${nombreArchivo}.xlsx`,
    };
  }

  private generarPDF(
    nombreProyecto: string,
    resumen: Awaited<ReturnType<ProyectosService['resumen']>>,
    filasDiferencias: FilaCambio[],
    filasFaltantes: FilaCambio[],
    filasNoRegistrados: FilaNoRegistrado[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Reporte de auditoría', { continued: false });
      doc.fontSize(13).fillColor('#0073CF').text(nombreProyecto);
      doc.moveDown();

      doc
        .fontSize(12)
        .fillColor('#101114')
        .text('Resumen', { underline: true });
      doc
        .fontSize(10)
        .text(
          `Total: ${resumen.total}   Auditados: ${resumen.auditados}   Diferencias: ${resumen.diferencias}   ` +
            `Faltantes: ${resumen.faltantes}   Pendientes: ${resumen.pendientes}   No registrados: ${resumen.noRegistrados}`,
        );
      doc.text(`Avance: ${Math.round(resumen.pct * 100)}%`);
      doc.moveDown();

      doc.fontSize(12).text('Diferencias', { underline: true });
      if (filasDiferencias.length === 0) {
        doc.fontSize(10).text('Sin diferencias registradas.');
      } else {
        filasDiferencias.forEach((f) => {
          doc
            .fontSize(10)
            .text(`${f.Código} — ${f.Activo}`, { continued: false });
          doc
            .fontSize(9)
            .fillColor('#6A7585')
            .text(`${f.Cambios || 'Sin detalle'} · ${f.Auditor} · ${f.Fecha}`);
          doc.fillColor('#101114');
        });
      }
      doc.moveDown();

      doc.fontSize(12).text('Faltantes', { underline: true });
      if (filasFaltantes.length === 0) {
        doc.fontSize(10).text('Sin faltantes registrados.');
      } else {
        filasFaltantes.forEach((f) => {
          doc.fontSize(10).text(`${f.Código} — ${f.Activo}`);
          doc
            .fontSize(9)
            .fillColor('#6A7585')
            .text(`${f.Nota || 'Sin nota'} · ${f.Auditor} · ${f.Fecha}`);
          doc.fillColor('#101114');
        });
      }
      doc.moveDown();

      doc.fontSize(12).text('Activos no registrados', { underline: true });
      if (filasNoRegistrados.length === 0) {
        doc.fontSize(10).text('Sin hallazgos nuevos.');
      } else {
        filasNoRegistrados.forEach((f) => {
          doc.fontSize(10).text(`${f['Código nuevo']} — ${f.Descripción}`);
          doc
            .fontSize(9)
            .fillColor('#6A7585')
            .text(`${f.Categoría} · ${f.Auditor} · ${f.Fecha}`);
          doc.fillColor('#101114');
        });
      }

      doc.end();
    });
  }
}
