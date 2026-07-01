import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import type { ReporteFormato } from '@adn/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProyectosService } from '../proyectos/proyectos.service';

interface FilaEstado {
  Placa: string;
  Activo: string;
  Categoría: string;
  Ubicación: string;
  Estado: string;
  Auditor: string;
  Fecha: string;
}

interface FilaCambio {
  Placa: string;
  Activo: string;
  Cambios: string;
  Nota: string;
  Auditor: string;
  Fecha: string;
}

interface FilaNoRegistrado {
  'Código QR': string;
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
    private readonly prisma: PrismaService,
    private readonly proyectosService: ProyectosService,
  ) {}

  async generar(
    organizacionId: string,
    proyectoId: string,
    formato: ReporteFormato,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const proyecto = await this.proyectosService.findOne(
      organizacionId,
      proyectoId,
    );
    const resumen = await this.proyectosService.resumen(
      organizacionId,
      proyectoId,
    );
    const ultimoPorActivo = await this.proyectosService.ultimoRegistroPorActivo(
      proyecto.id,
    );

    const activos = await this.prisma.activo.findMany({
      where: { organizacionId: proyecto.organizacionId, deletedAt: null },
      include: { ubicacion: true },
      orderBy: { placa: 'asc' },
    });

    const registrosNoRegistrados = await this.prisma.registroAuditoria.findMany(
      {
        where: {
          proyectoId: proyecto.id,
          activoId: null,
          estado: 'NO_REGISTRADO',
        },
        include: { auditor: { select: { nombre: true } } },
        orderBy: { auditadoEn: 'desc' },
      },
    );

    const filasEstado: FilaEstado[] = activos.map((activo) => {
      const registro = ultimoPorActivo.get(activo.id);
      return {
        Placa: activo.placa,
        Activo: activo.nombre,
        Categoría: activo.categoria.replace('_', ' '),
        Ubicación: activo.ubicacion?.sede ?? '',
        Estado: registro?.estado ?? 'PENDIENTE',
        Auditor: registro?.auditor.nombre ?? '',
        Fecha: formatearFecha(registro?.auditadoEn),
      };
    });

    const filasDiferencias: FilaCambio[] = activos
      .map((activo) => ({ activo, registro: ultimoPorActivo.get(activo.id) }))
      .filter((r) => r.registro?.estado === 'DIFERENCIA')
      .map(({ activo, registro }) => ({
        Placa: activo.placa,
        Activo: activo.nombre,
        Cambios: formatearCambios(registro!.cambios),
        Nota: registro!.nota ?? '',
        Auditor: registro!.auditor.nombre,
        Fecha: formatearFecha(registro!.auditadoEn),
      }));

    const filasFaltantes: FilaCambio[] = activos
      .map((activo) => ({ activo, registro: ultimoPorActivo.get(activo.id) }))
      .filter((r) => r.registro?.estado === 'FALTANTE')
      .map(({ activo, registro }) => ({
        Placa: activo.placa,
        Activo: activo.nombre,
        Cambios: '',
        Nota: registro!.nota ?? '',
        Auditor: registro!.auditor.nombre,
        Fecha: formatearFecha(registro!.auditadoEn),
      }));

    const filasNoRegistrados: FilaNoRegistrado[] = registrosNoRegistrados.map(
      (registro) => {
        const cambios = registro.cambios as Record<
          string,
          { despues?: unknown }
        > | null;
        return {
          'Código QR':
            cambios?.codigoQR?.despues !== undefined
              ? aTexto(cambios.codigoQR.despues)
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
          Auditor: registro.auditor.nombre,
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
            .text(`${f.Placa} — ${f.Activo}`, { continued: false });
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
          doc.fontSize(10).text(`${f.Placa} — ${f.Activo}`);
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
          doc.fontSize(10).text(`${f['Código QR']} — ${f.Descripción}`);
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
