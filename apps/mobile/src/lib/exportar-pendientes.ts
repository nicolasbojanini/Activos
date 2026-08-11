import { and, eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { COLUMNAS_EXPORT_PENDIENTES } from '@adn/shared';
import { db } from '../db/client';
import { colaRegistros } from '../db/schema';
import { useAuthStore } from './auth-store';

const carpetaExportados = new Directory(Paths.document, 'exportados');

function asegurarCarpeta() {
  if (!carpetaExportados.exists) {
    carpetaExportados.create({ intermediates: true });
  }
}

export interface ResultadoExportarPendientes {
  archivo: File;
  cantidad: number;
}

/**
 * Fallback para sitios sin señal en absoluto: arma un .xlsx con la cola local
 * sin sincronizar (mismos campos que ya viajan a crearRegistro) y abre el
 * selector nativo para guardarlo/compartirlo — a una PC por USB, por
 * Bluetooth, donde sea. No marca nada como sincronizado ni toca la cola: el
 * dispositivo sigue reintentando sincronizar normal en cuanto tenga señal,
 * y como crearRegistro es idempotente por clientId, ese reintento no duplica
 * lo que ya se haya importado desde el Excel — solo completa las fotos, que
 * a propósito no viajan acá (ver COLUMNAS_EXPORT_PENDIENTES).
 */
export async function exportarPendientes(): Promise<ResultadoExportarPendientes | null> {
  // Solo lo que de verdad no llegó al servidor (registroSincronizado = 0) —
  // lo que ya se guardó y solo le faltan fotos no necesita re-importarse,
  // esas se completan solas por el canal normal apenas haya señal.
  const pendientes = await db
    .select()
    .from(colaRegistros)
    .where(and(eq(colaRegistros.synced, 0), eq(colaRegistros.registroSincronizado, 0)));
  if (pendientes.length === 0) return null;

  const { clienteId, usuario } = useAuthStore.getState();
  const auditorId = usuario?.id ?? '';

  const filas = pendientes.map((p) => ({
    [COLUMNAS_EXPORT_PENDIENTES.clientId]: p.clientId,
    [COLUMNAS_EXPORT_PENDIENTES.clienteId]: clienteId ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.proyectoId]: p.proyectoId,
    [COLUMNAS_EXPORT_PENDIENTES.activoId]: p.activoId ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.codigo]: p.codigoAnteriorSnapshot ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.nombre]: p.nombreSnapshot ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.estado]: p.estado,
    [COLUMNAS_EXPORT_PENDIENTES.estadoFisico]: p.estadoFisico ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.cambiosJson]: p.cambiosJson ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.nota]: p.nota ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.lat]: p.lat ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.lng]: p.lng ?? '',
    [COLUMNAS_EXPORT_PENDIENTES.auditadoEn]: p.auditadoEn,
    [COLUMNAS_EXPORT_PENDIENTES.fotosJson]: p.fotosJson,
    [COLUMNAS_EXPORT_PENDIENTES.auditorId]: auditorId,
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Pendientes');
  const base64 = XLSX.write(libro, { type: 'base64', bookType: 'xlsx' }) as string;

  asegurarCarpeta();
  const fecha = new Date().toISOString().slice(0, 10);
  const archivo = new File(carpetaExportados, `adn-pendientes-${fecha}-${pendientes.length}.xlsx`);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(base64, { encoding: 'base64' });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exportar pendientes',
    });
  }

  return { archivo, cantidad: pendientes.length };
}
