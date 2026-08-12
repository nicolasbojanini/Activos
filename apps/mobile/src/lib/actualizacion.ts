import { Linking } from 'react-native';

const REPO = 'nicolasbojanini/Activos';

export interface InfoActualizacion {
  disponible: boolean;
  tag: string;
  urlDescarga: string | null;
}

/**
 * Compara el build instalado (EXPO_PUBLIC_BUILD_ID, horneado por el
 * workflow de CI a partir del commit — ver build-android-apk.yml) contra el
 * último GitHub Release publicado, que cada build exitoso crea con el APK
 * como asset público. Solo avisa, nunca fuerza ni descarga sola: el
 * auditor decide cuándo instalar. Best-effort — cualquier falla (sin señal,
 * rate limit de GitHub, un build local de desarrollo sin
 * EXPO_PUBLIC_BUILD_ID) se trata como "no hay actualización" en vez de
 * romper el arranque de la app.
 */
export async function verificarActualizacion(): Promise<InfoActualizacion | null> {
  const buildActual = process.env.EXPO_PUBLIC_BUILD_ID;
  if (!buildActual) return null;

  try {
    const respuesta = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!respuesta.ok) return null;
    const release = (await respuesta.json()) as {
      tag_name: string;
      assets: { name: string; browser_download_url: string }[];
    };

    const tagActual = `apk-${buildActual}`;
    if (release.tag_name === tagActual) {
      return { disponible: false, tag: release.tag_name, urlDescarga: null };
    }

    const apkAsset = release.assets.find((a) => a.name.endsWith('.apk'));
    return { disponible: true, tag: release.tag_name, urlDescarga: apkAsset?.browser_download_url ?? null };
  } catch {
    return null;
  }
}

export function abrirDescargaActualizacion(url: string) {
  void Linking.openURL(url);
}
