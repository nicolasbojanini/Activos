import * as FileSystem from 'expo-file-system';

/**
 * Capa mínima de archivos sobre la API clásica de expo-file-system.
 *
 * El proyecto usaba la API de clases de SDK 54 (`File`, `Directory`, `Paths`), pero
 * la app baja a Expo SDK 51 para poder correr en Android 6.0 (ver ANDROID6.md) y ahí
 * esa API todavía no existe: solo está la basada en funciones, 100% asíncrona (la
 * nueva exponía `.exists` como propiedad síncrona). Todo el acceso a archivos del
 * resto de la app pasa por acá, así el día que se suba de SDK el cambio queda en
 * este único archivo.
 *
 * Las rutas son las MISMAS que con la API nueva (`Paths.document` == `documentDirectory`),
 * así que las fotos pendientes que ya estén en el teléfono al actualizar la app se
 * siguen encontrando.
 */

/** Almacenamiento privado de la app. En Android siempre está definido y termina en "/". */
const RAIZ_DOCUMENTOS = FileSystem.documentDirectory ?? '';

/** URI (terminada en "/") de una carpeta dentro del almacenamiento privado de la app. */
export function rutaCarpeta(nombre: string): string {
  return `${RAIZ_DOCUMENTOS}${nombre}/`;
}

/**
 * URI de un archivo dentro de una carpeta. El nombre se codifica: los nombres del
 * respaldo salen del código del activo (ej. "DMZ 00131-1.jpg", o uno con "#" o
 * "%"), y estas APIs reciben una URI, donde un "#" corta la ruta y un "%" se
 * interpreta como escape.
 */
export function rutaArchivo(carpeta: string, nombre: string): string {
  return `${carpeta}${encodeURIComponent(nombre)}`;
}

const carpetasListas = new Set<string>();

/** Crea la carpeta si no existe. Idempotente; cada carpeta se verifica una sola vez por ejecución. */
export async function asegurarCarpeta(uri: string): Promise<void> {
  if (carpetasListas.has(uri)) return;
  // Con intermediates:true no falla si ya existía.
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  carpetasListas.add(uri);
}

export async function existeArchivo(uri: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(uri)).exists;
}

export interface InfoArchivo {
  existe: boolean;
  /** Bytes; 0 si no existe. */
  tamano: number;
}

export async function infoArchivo(uri: string): Promise<InfoArchivo> {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  return info.exists ? { existe: true, tamano: info.size } : { existe: false, tamano: 0 };
}

/** Borra el archivo; no falla si no existe. */
export async function borrarArchivo(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function copiarArchivo(origen: string, destino: string): Promise<void> {
  await FileSystem.copyAsync({ from: origen, to: destino });
}

export async function leerBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/** Escribe (creando o reemplazando) un archivo a partir de contenido en base64. */
export async function escribirBase64(uri: string, base64: string): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
}
