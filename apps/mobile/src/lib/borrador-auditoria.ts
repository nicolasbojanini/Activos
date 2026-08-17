import { eq, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { borradores } from '../db/schema';
import { archivoLocalFoto, eliminarFotoLocal, type FotoCapturada } from './fotos';

/**
 * Un borrador más viejo que esto se descarta: pasado un día de trabajo, lo que
 * quedó a medio llenar ya no refleja lo que el auditor tiene enfrente, y
 * restaurarlo sería peor que empezar de nuevo.
 */
const VIGENCIA_BORRADOR_MS = 24 * 60 * 60 * 1000;

/** Campos del formulario de ActualizarScreen tal como se persisten (ver FormValues allá). */
export interface BorradorForm {
  estadoFisico: string;
  ubicacionTexto: string;
  responsable: string | null;
  centroCosto: string | null;
  nota: string;
}

export interface BorradorAuditoria {
  form: BorradorForm;
  /** Campos dinámicos + personalizados, misma forma que `valoresExtra` en la pantalla. */
  valoresExtra: Record<string, string>;
  fotos: FotoCapturada[];
}

export async function guardarBorrador(activoId: string, datos: BorradorAuditoria): Promise<void> {
  const datosJson = JSON.stringify(datos);
  const actualizadoEn = new Date().toISOString();
  await db
    .insert(borradores)
    .values({ activoId, datosJson, actualizadoEn })
    .onConflictDoUpdate({ target: borradores.activoId, set: { datosJson, actualizadoEn } });
}

/**
 * Devuelve el borrador vigente del activo, o null si no hay / venció / quedó
 * ilegible. Las fotos se filtran contra el disco: si el JPEG ya no está (el
 * auditor lo quitó, o se limpió al sincronizar) no sirve de nada restaurar una
 * miniatura que apuntaría a un archivo inexistente.
 */
export async function leerBorrador(activoId: string): Promise<BorradorAuditoria | null> {
  const [fila] = await db.select().from(borradores).where(eq(borradores.activoId, activoId)).limit(1);
  if (!fila) return null;

  if (Date.now() - new Date(fila.actualizadoEn).getTime() > VIGENCIA_BORRADOR_MS) {
    await borrarBorrador(activoId);
    return null;
  }

  try {
    const datos = JSON.parse(fila.datosJson) as BorradorAuditoria;
    return {
      form: datos.form,
      valoresExtra: datos.valoresExtra ?? {},
      fotos: (datos.fotos ?? []).filter((f) => archivoLocalFoto(f.clientPhotoId).exists),
    };
  } catch {
    // JSON corrupto: mejor arrancar limpio que dejar la pantalla rota para siempre.
    await borrarBorrador(activoId);
    return null;
  }
}

export async function borrarBorrador(activoId: string): Promise<void> {
  await db.delete(borradores).where(eq(borradores.activoId, activoId));
}

/**
 * Descarta el borrador y además borra los JPEG que solo él referenciaba — si no,
 * quedarían ocupando espacio en el teléfono sin que nada vuelva a apuntarlos.
 */
export async function descartarBorrador(activoId: string, fotos: FotoCapturada[]): Promise<void> {
  for (const foto of fotos) eliminarFotoLocal(foto.clientPhotoId);
  await borrarBorrador(activoId);
}

/** Barrido de higiene al arrancar: los vencidos no se restauran, pero igual hay que sacarlos de la base. */
export async function limpiarBorradoresVencidos(): Promise<void> {
  const limite = new Date(Date.now() - VIGENCIA_BORRADOR_MS).toISOString();
  await db.delete(borradores).where(lt(borradores.actualizadoEn, limite));
}
