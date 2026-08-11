import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

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
 * Respaldo permanente: una copia de cada foto capturada, con nombre legible
 * (código del activo + orden/etiqueta), que NUNCA se borra — a diferencia de
 * la copia de trabajo en `carpetaFotos` (nombrada por clientPhotoId, que sí
 * se borra una vez confirmada la subida). Sirve para que, conectando el
 * celular a una PC más adelante, alguien pueda revisar/rescatar fotos a
 * mano sin depender de que la sincronización haya funcionado. Sin límite de
 * tiempo ni de proyecto a propósito — queda a criterio de quien administre
 * el dispositivo limpiar esta carpeta si el almacenamiento se ajusta.
 */
const carpetaArchivo = new Directory(Paths.document, 'archivo-fotos');

/** Copia cada foto ya capturada (por clientPhotoId) al respaldo permanente. No falla si alguna ya no existe localmente. */
export function archivarFotosLocal(
  codigoAnterior: string | null,
  clientId: string,
  fotos: { clientPhotoId: string; etiqueta: string | null; orden: number }[],
) {
  if (fotos.length === 0) return;
  const carpetaActivo = new Directory(carpetaArchivo, `${sanear(codigoAnterior ?? 'sin-codigo')}-${clientId.slice(-6)}`);
  if (!carpetaActivo.exists) carpetaActivo.create({ intermediates: true });

  for (const foto of fotos) {
    const origen = archivoLocalFoto(foto.clientPhotoId);
    if (!origen.exists) continue;
    const destino = new File(carpetaActivo, `${foto.orden}_${sanear(foto.etiqueta ?? 'foto')}.jpg`);
    if (destino.exists) continue;
    try {
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
