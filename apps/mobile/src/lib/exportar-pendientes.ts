import { and, eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { COLUMNAS_EXPORT_PENDIENTES, type FotoInput } from '@adn/shared';
import { db } from '../db/client';
import { colaRegistros } from '../db/schema';
import { useAuthStore } from './auth-store';
import { archivoLocalFoto, sanear } from './fotos';

const carpetaExportados = new Directory(Paths.document, 'exportados');

function asegurarCarpeta() {
  if (!carpetaExportados.exists) {
    carpetaExportados.create({ intermediates: true });
  }
}

export interface ResultadoExportarPendientes {
  archivo: File;
  cantidad: number;
  /** Fotos que la cola dice que existen (fotosJson) vs. las que realmente se encontraron en el almacenamiento del celular al armar el zip. */
  fotosReferenciadas: number;
  fotosEncontradas: number;
  /** Si algo rompió al armar/compartir el zip (una foto puntual no cuenta acá, eso va en "faltantes" dentro del propio zip) — el Excel ya se exportó igual, esto es solo informativo. */
  errorZip: string | null;
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

  const disponible = await Sharing.isAvailableAsync();
  if (disponible) {
    await Sharing.shareAsync(archivo.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exportar pendientes',
    });
  }

  // Las fotos NO van dentro del Excel (son binarios) ni se suben a ningún
  // lado — es un respaldo aparte, solo para que el coordinador pueda revisar
  // a mano lo que capturó cada auditor mientras estuvo sin señal. Una
  // carpeta por activo (código + últimos 6 del clientId, por si el mismo
  // código quedó auditado dos veces en la cola) con sus fotos adentro,
  // nombradas por orden/etiqueta para reconocerlas de un vistazo.
  //
  // Se cuenta aparte lo REFERENCIADO (lo que la cola dice que existe) contra
  // lo ENCONTRADO (lo que de verdad se pudo leer del celular): antes, si UNA
  // sola foto tiraba una excepción al leerla (archivo corrupto, permiso, lo
  // que sea), el error se propagaba y mataba el export entero — el Excel ya
  // se había compartido, pero el zip de fotos desaparecía en silencio sin
  // ningún rastro de qué pasó. Cada foto ahora se procesa en su propio
  // try/catch: una que falle no tira abajo a las demás, y tanto las que no
  // se encontraron como las que dieron error quedan listadas en un archivo
  // de texto dentro del zip.
  const zip = new JSZip();
  let fotosReferenciadas = 0;
  let fotosEncontradas = 0;
  const faltantes: string[] = [];
  for (const p of pendientes) {
    const fotos = JSON.parse(p.fotosJson) as FotoInput[];
    if (fotos.length === 0) continue;
    const carpeta = `${sanear(p.codigoAnteriorSnapshot ?? 'sin-codigo')}-${p.clientId.slice(-6)}`;
    for (const foto of fotos) {
      fotosReferenciadas++;
      const etiquetaArchivo = `${carpeta}/${foto.orden}_${sanear(foto.etiqueta ?? 'foto')}.jpg`;
      try {
        const local = archivoLocalFoto(foto.clientPhotoId);
        if (!local.exists) {
          faltantes.push(`${etiquetaArchivo} — no se encontró en el celular (clientPhotoId: ${foto.clientPhotoId})`);
          continue;
        }
        zip.file(etiquetaArchivo, await local.bytes());
        fotosEncontradas++;
      } catch (err) {
        faltantes.push(
          `${etiquetaArchivo} — error al leerla: ${err instanceof Error ? err.message : String(err)} (clientPhotoId: ${foto.clientPhotoId})`,
        );
      }
    }
  }

  let errorZip: string | null = null;
  if (fotosReferenciadas > 0) {
    try {
      if (faltantes.length > 0) {
        zip.file(
          '_fotos_no_encontradas.txt',
          `Estas fotos estaban registradas pero no se pudieron incluir en el zip:\n\n${faltantes.join('\n')}`,
        );
      }
      const zipBase64 = await zip.generateAsync({ type: 'base64' });
      const archivoZip = new File(carpetaExportados, `adn-fotos-pendientes-${fecha}-${pendientes.length}.zip`);
      if (archivoZip.exists) archivoZip.delete();
      archivoZip.create();
      archivoZip.write(zipBase64, { encoding: 'base64' });

      if (disponible) {
        await Sharing.shareAsync(archivoZip.uri, {
          mimeType: 'application/zip',
          dialogTitle: 'Exportar fotos de pendientes',
        });
      }
    } catch (err) {
      errorZip = err instanceof Error ? err.message : String(err);
    }
  }

  return { archivo, cantidad: pendientes.length, fotosReferenciadas, fotosEncontradas, errorZip };
}
