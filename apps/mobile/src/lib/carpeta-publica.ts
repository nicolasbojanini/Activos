import * as SecureStore from 'expo-secure-store';
import { StorageAccessFramework, writeAsStringAsync } from 'expo-file-system/legacy';

const KEY_CARPETA_URI = 'adn.carpetaPublicaUri';
const KEY_YA_PEDIDA = 'adn.carpetaPublicaPedida';

/**
 * El almacenamiento interno de la app (`Paths.document`, usado antes para el
 * respaldo de fotos y los exports de pendientes) NO es visible conectando el
 * celular a una PC por USB en Android moderno — es privado del sandbox de la
 * app. Esta carpeta pública (elegida una vez por el auditor vía el selector
 * nativo de Android, típicamente "Download") sí queda visible por USB en
 * cualquier explorador de archivos, sin root.
 */
export async function obtenerCarpetaPublicaUri(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_CARPETA_URI);
}

export async function yaSePidioCarpetaPublica(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_YA_PEDIDA)) === '1';
}

/** El auditor dijo "ahora no" al aviso inicial — no se vuelve a insistir solo; queda el botón manual. */
export async function descartarPeticionCarpetaPublica(): Promise<void> {
  await SecureStore.setItemAsync(KEY_YA_PEDIDA, '1');
}

/**
 * Abre el selector nativo de Android para elegir la carpeta pública y
 * persiste el permiso (no hay que volver a pedirlo). Se marca como "ya
 * pedida" incluso si el auditor cancela el selector, para no insistir en
 * cada apertura de la app — queda disponible un botón manual para
 * reintentar.
 */
export async function pedirCarpetaPublica(): Promise<string | null> {
  await SecureStore.setItemAsync(KEY_YA_PEDIDA, '1');
  const permiso = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permiso.granted) return null;
  await SecureStore.setItemAsync(KEY_CARPETA_URI, permiso.directoryUri);
  return permiso.directoryUri;
}

/**
 * Copia contenido (base64) a la carpeta pública con el nombre dado. Devuelve
 * false si no hay carpeta configurada o si algo falla al escribir — quien
 * llama debe tratar esto como un respaldo best-effort, nunca como la única
 * copia. Nota: el proveedor de documentos de Android no sobrescribe por
 * nombre — si ya existe un archivo con ese nombre, crea uno nuevo con sufijo
 * (ej. "foo (1).jpg") en vez de reemplazarlo. Es aceptable acá porque ya
 * usamos la fecha de captura para distinguir duplicados en el resto del
 * esquema de nombres (ver reportes.service.ts).
 */
export async function escribirEnCarpetaPublica(nombre: string, base64: string, mime: string): Promise<boolean> {
  const carpetaUri = await obtenerCarpetaPublicaUri();
  if (!carpetaUri) return false;
  try {
    const archivoUri = await StorageAccessFramework.createFileAsync(carpetaUri, nombre, mime);
    await writeAsStringAsync(archivoUri, base64, { encoding: 'base64' });
    return true;
  } catch {
    return false;
  }
}
