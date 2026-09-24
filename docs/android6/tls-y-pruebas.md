# Android 6.0: certificados TLS y cómo probar sin la PDA

Complementa `apps/mobile/ANDROID6.md`. Todo lo de acá se verificó en un emulador Android 6.0
(API 23, arm64) con el APK que compila CI.

## Bloqueante: Android 6.0 no confía en los certificados de Railway

La API (`api-production-1d41b.up.railway.app`) y MinIO (`minio-production-5992.up.railway.app`)
sirven certificados de **Let's Encrypt** con la jerarquía nueva:

    *.up.railway.app -> Let's Encrypt YE1 -> ISRG Root YE -> ISRG Root X2 -> ISRG Root X1

Android solo incluye la raíz **ISRG Root X1** desde 7.1.1 (y X2 desde 14; fuente:
letsencrypt.org/docs/certificate-compatibility). En Android 6.0 ninguna de las dos está en el
almacén del sistema (en la imagen de prueba: 158 raíces, sin `6187b673`, el hash de X1), así que
**todas** las llamadas HTTPS fallan sin importar la versión de Expo:

- Navegador: "There are problems with the security certificate for this site".
- Log: `CertPathValidatorException: Trust anchor for certification path not found`.
- La app, con el mismo APK y las mismas entradas: sin el certificado muestra "No se pudo iniciar
  sesión"; con él llega al servidor y muestra "Credenciales inválidas" (401).

### Solución validada (sin cambios de código): instalar ISRG Root X1 en cada PDA

Archivo: `docs/android6/isrg-root-x1.crt` (certificado público). Verificar la huella SHA-256
contra la que publica Let's Encrypt (letsencrypt.org/certs) antes de repartirlo:

    96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6

En la PDA: copiar el `.crt` al almacenamiento interno (carpeta Download) y luego
**Ajustes > Seguridad > Instalar desde tarjeta SD** > Almacenamiento interno > Download >
`isrg-root-x1.crt` > nombre cualquiera, uso "VPN y apps" > OK.

Consecuencias que Android 6 impone (todas observadas):

- **Exige PIN, patrón o contraseña de pantalla** antes de instalar; sin bloqueo de pantalla no
  deja. Con almacenamiento de credenciales activo, "Deslizar" queda deshabilitado.
- Muestra un ícono de advertencia permanente ("la red puede estar monitoreada") con certificados
  de usuario. Es cosmético.
- En Android < 7 las apps confían en certificados de usuario por defecto, por eso funciona para la
  app y para el navegador sin tocar nada más.
- Se hace una vez por equipo. La raíz X1 vence en 2035 y es el ancla de la cadena que hoy sirve Railway (observada arriba).

### Alternativas (sin validar)

- **Confianza dentro de la app** solo para Android < 7.1.1: config plugin nativo que agregue X1 al
  `TrustManager`. Ojo: la app usa DOS clientes HTTP distintos — el de React Native (`fetch`, API) y
  el propio de `expo-file-system` (`uploadAsync`, subida de fotos a MinIO; se crea con
  `OkHttpClient.Builder()` en `FileSystemModule.kt` y no es configurable). Habría que reemplazar
  `uploadAsync` o parchear el módulo.
- **Dominio propio detrás de un CDN** cuyo certificado encadene a una raíz que Android 6 sí trae.
  Railway solo emite Let's Encrypt, así que el certificado visible tendría que ser el del CDN;
  implica cambiar la URL de la API y `S3_PUBLIC_ENDPOINT`.

## Probar en Android 6.0 sin la PDA

Imagen oficial de Google: `system-images;android-23;default;arm64-v8a`
(`https://dl.google.com/android/repository/sys-img/android/arm64-v8a-23_r07.zip`, 254 MB,
SHA-1 `ac18f3bd717e02804eee585e029f5dbc1a2616bf`). Corre nativa en Mac con Apple Silicon.
Se descomprime en `~/Library/Android/sdk/system-images/android-23/default/arm64-v8a/`.
AVD `ADN_Android6_API23` (creado a mano con `config.ini`; el emulador 31.2.10 no trae `e2fsck`,
así que `disk.dataPartition.size=2G` debe coincidir con el `userdata.img` de la imagen, y
`hw.gpu.mode=auto`, porque `swiftshader_indirect` no existe en ese emulador):

    emulator -avd ADN_Android6_API23 -no-snapshot -no-audio
    adb install -r app-release.apk        # el APK de CI

Notas de la sesión que las produjo:

- El directorio de certificados de usuario en API 23 es `/data/misc/user/0/cacerts-added`
  (`/data/misc/keychain/cacerts-added` NO sirve). Para quitarlo: `adb root` y borrar el archivo.
- **No probar con APKs compilados contra plataformas 35+**: Kotlin enlaza `List.removeLast()` al
  método del JDK (Android 15+) y la app se cierra al abrir con `NoSuchMethodError`. CI compila
  contra la 34 y no tiene ese problema.
- Con `adb shell input`, tocar el campo de contraseña primero y luego el de correo; TAB no mueve
  el foco.

## Build de CI: qué se rompió y por qué

- **NDK**: la plantilla de SDK 51 fija `26.1.10909125`, y `expo-sqlite` 14 no declara `ndkVersion`
  (Gradle usa el 25.1). El auto-descargador de Gradle 8.8 no entiende el catálogo actual de
  Google ("SDK XML version 4") y se cuelga. Ver `apps/mobile/plugins/with-ndk-version.js` y el paso
  "Instalar NDK 26.1" del workflow.
- **Splash**: sin `splash.backgroundColor` en `app.json`, falla AAPT por `splashscreen_background`.

## Sin verificar (requiere una C71 real)

Login real y descarga de sesión (~9 mil activos), escaneo QR, cámara del sistema de la PDA, subida
de fotos a MinIO, sincronización, exportar pendientes, y que la actualización encima de la app de
SDK 54 conserve la cola (misma firma y `versionCode`, verificado; falta ver los datos —
`expo-secure-store` 13 vs 15 podría obligar a iniciar sesión de nuevo).
