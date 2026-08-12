import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { escribirEnCarpetaPublica } from './carpeta-publica';

const carpetaFotos = new Directory(Paths.document, 'fotos');

function asegurarCarpeta() {
  if (!carpetaFotos.exists) {
    carpetaFotos.create({ intermediates: true });
  }
}

/** Nombre de carpeta/archivo sin caracteres que rompan el sistema de archivos. */
export function sanear(texto: string): string {
  return texto.replace(/[\\/:*?"<>|]/g, '-').trim() || 'sin-nombre';
}

/**
 * Respaldo permanente: una copia de cada foto capturada, con el MISMO
 * esquema de nombre que usa la descarga de fotos del portal
 * (`{código}-{slot}.jpg`, slot = orden+1) — a propósito, para que un
 * coordinador reconozca la misma foto en los dos lados. Nunca se borra por
 * sí sola — a diferencia de la copia de trabajo en `carpetaFotos` (nombrada
 * por clientPhotoId, que sí se borra una vez confirmada la subida). Sirve
 * para que, conectando el celular a una PC más adelante, alguien pueda
 * revisar/rescatar fotos a mano sin depender de que la sincronización haya
 * funcionado. Sin límite de tiempo ni de proyecto a propósito.
 *
 * Si el mismo activo se reprocesa (mismo código, mismo slot), la copia
 * nueva REEMPLAZA a la vieja acá — mismo criterio "última captura gana" que
 * ya usa el resto de la app (ver aplicarCambiosAActivo en el backend). El
 * portal, en cambio, sí puede llegar a tener el mismo nombre repetido en un
 * mismo ZIP si el rango de fechas incluye más de un reproceso — ahí la
 * fecha de captura (metadata del archivo) es lo que permite distinguirlas.
 */
const carpetaArchivo = new Directory(Paths.document, 'archivo-fotos');

function asegurarCarpetaArchivo() {
  if (!carpetaArchivo.exists) {
    carpetaArchivo.create({ intermediates: true });
  }
}

/**
 * Copia cada foto ya capturada (por clientPhotoId) al respaldo permanente. No
 * falla si alguna ya no existe localmente. Si el auditor ya eligió una
 * carpeta pública (ver carpeta-publica.ts), el respaldo va ahí — visible por
 * USB. Si todavía no la eligió, o la escritura pública falla, cae al
 * almacenamiento interno de siempre como red de seguridad (no visible por
 * USB, pero nunca se pierde la foto).
 */
export async function archivarFotosLocal(
  codigoAnterior: string | null,
  fotos: { clientPhotoId: string; etiqueta: string | null; orden: number }[],
) {
  if (fotos.length === 0) return;

  for (const foto of fotos) {
    const origen = archivoLocalFoto(foto.clientPhotoId);
    if (!origen.exists) continue;
    const nombre = `${sanear(codigoAnterior ?? 'sin-codigo')}-${foto.orden + 1}.jpg`;

    try {
      const base64 = await origen.base64();
      if (await escribirEnCarpetaPublica(nombre, base64, 'image/jpeg')) continue;
    } catch {
      // Sigue al respaldo interno.
    }

    try {
      asegurarCarpetaArchivo();
      const destino = new File(carpetaArchivo, nombre);
      if (destino.exists) destino.delete();
      origen.copy(destino);
    } catch {
      // El respaldo es un extra, no debe interrumpir el flujo de captura/sincronización.
    }
  }
}

export interface FotoCapturada {
  clientPhotoId: string;
  localUri: string;
  etiqueta: string;
  orden: number;
  ancho: number;
  alto: number;
}

/** Captura con la cámara, recomprime (máx. 1600px, JPEG ~0.7) y guarda localmente por clientPhotoId. */
export async function capturarFoto(etiqueta: string, orden: number): Promise<FotoCapturada | null> {
  const permiso = await ImagePicker.requestCameraPermissionsAsync();
  if (!permiso.granted) return null;

  const resultado = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (resultado.canceled) return null;

  const manipulada = await manipulateAsync(resultado.assets[0].uri, [{ resize: { width: 1600 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
  });

  asegurarCarpeta();
  const clientPhotoId = Crypto.randomUUID();
  const origen = new File(manipulada.uri);
  const destino = new File(carpetaFotos, `${clientPhotoId}.jpg`);
  await origen.copy(destino);

  return { clientPhotoId, localUri: destino.uri, etiqueta, orden, ancho: manipulada.width, alto: manipulada.height };
}

export function archivoLocalFoto(clientPhotoId: string): File {
  return new File(carpetaFotos, `${clientPhotoId}.jpg`);
}

export function eliminarFotoLocal(clientPhotoId: string) {
  const archivo = archivoLocalFoto(clientPhotoId);
  if (archivo.exists) {
    archivo.delete();
  }
}
