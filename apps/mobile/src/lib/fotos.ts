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
