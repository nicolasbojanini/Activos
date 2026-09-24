import { eq, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { borradores } from '../db/schema';
import { eliminarFotoLocal, uriFotoLocal, type FotoCapturada } from './fotos';
import { existeArchivo } from './archivos';

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

/** Campos del formulario de NoRegistradoScreen (alta de un activo que no estaba en el inventario). */
export interface BorradorNuevoForm {
  nombre: string;
  categoria: string;
  estadoFisico: string;
  ubicacionTexto: string;
  responsable: string;
  centroCosto: string;
  nota: string;
}

/**
 * Clave de borrador para un alta. Las altas todavía no tienen activoId, pero sí
 * el código que el auditor acaba de escanear: si el proceso muere, vuelve a
 * escanear el mismo código y cae en esta misma pantalla. El prefijo evita
 * chocar con las claves de activos existentes, que son ids del servidor.
 */
export function claveBorradorNuevo(codigo: string): string {
  return `nuevo:${codigo}`;
}

export interface BorradorAuditoria<F = BorradorForm> {
  form: F;
  /** Campos dinámicos + personalizados, misma forma que `valoresExtra` en la pantalla. */
  valoresExtra: Record<string, string>;
  fotos: FotoCapturada[];
}

export async function guardarBorrador<F>(clave: string, datos: BorradorAuditoria<F>): Promise<void> {
  const datosJson = JSON.stringify(datos);
  const actualizadoEn = new Date().toISOString();
  await db
    .insert(borradores)
    .values({ activoId: clave, datosJson, actualizadoEn })
    .onConflictDoUpdate({ target: borradores.activoId, set: { datosJson, actualizadoEn } });
}

/**
 * Devuelve el borrador vigente de esa clave, o null si no hay / venció / quedó
 * ilegible. Las fotos se filtran contra el disco: si el JPEG ya no está (el
 * auditor lo quitó, o se limpió al sincronizar) no sirve de nada restaurar una
 * miniatura que apuntaría a un archivo inexistente.
 */
export async function leerBorrador<F = BorradorForm>(clave: string): Promise<BorradorAuditoria<F> | null> {
  const [fila] = await db.select().from(borradores).where(eq(borradores.activoId, clave)).limit(1);
  if (!fila) return null;

  if (Date.now() - new Date(fila.actualizadoEn).getTime() > VIGENCIA_BORRADOR_MS) {
    await borrarBorrador(clave);
    return null;
  }

  try {
    const datos = JSON.parse(fila.datosJson) as BorradorAuditoria<F>;
    const conArchivo = await Promise.all(
      (datos.fotos ?? []).map(async (f) => {
        // Un fallo de I/O al chequear NO debe caer al catch de abajo: ahí se borra el
        // borrador por "JSON corrupto", y perder el trabajo del auditor por un error
        // de disco pasajero es justo lo que este mecanismo existe para evitar.
        const existe = await existeArchivo(uriFotoLocal(f.clientPhotoId)).catch(() => false);
        return existe ? f : null;
      }),
    );
    return {
      form: datos.form,
      valoresExtra: datos.valoresExtra ?? {},
      fotos: conArchivo.filter((f): f is FotoCapturada => f !== null),
    };
  } catch {
    // JSON corrupto: mejor arrancar limpio que dejar la pantalla rota para siempre.
    await borrarBorrador(clave);
    return null;
  }
}

export async function borrarBorrador(clave: string): Promise<void> {
  await db.delete(borradores).where(eq(borradores.activoId, clave));
}

/**
 * Descarta el borrador y además borra los JPEG que solo él referenciaba — si no,
 * quedarían ocupando espacio en el teléfono sin que nada vuelva a apuntarlos.
 */
export async function descartarBorrador(clave: string, fotos: FotoCapturada[]): Promise<void> {
  await Promise.all(fotos.map((foto) => eliminarFotoLocal(foto.clientPhotoId)));
  await borrarBorrador(clave);
}

/** Barrido de higiene al arrancar: los vencidos no se restauran, pero igual hay que sacarlos de la base. */
export async function limpiarBorradoresVencidos(): Promise<void> {
  const limite = new Date(Date.now() - VIGENCIA_BORRADOR_MS).toISOString();
  await db.delete(borradores).where(lt(borradores.actualizadoEn, limite));
}
