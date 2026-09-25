# App móvil compatible con Android 6.0 (Expo SDK 51)

## Por qué existe esto

Las PDAs Chainway C71 del proyecto (10 unidades) corren **Android 6.0 (API 23)** y el fabricante
confirmó que no hay actualización de sistema posible. El SDK que usaba la app (Expo SDK 54,
React Native 0.81) exige Android 7.0 (API 24) como mínimo, así que no se podía ni instalar.

React Native fue subiendo ese mínimo así:

| React Native | Expo SDK | `minSdkVersion` |
|---|---|---|
| ≤ 0.73 | ≤ 50 | 21 |
| **0.74 – 0.75** | **51** | **23 (Android 6.0)** |
| ≥ 0.76 | ≥ 52 | 24 (Android 7.0) |

**Expo SDK 51 (RN 0.74) es la última línea que corre en Android 6.0.** `minSdkVersion 23`
significa "23 en adelante": el mismo APK sirve en las PDAs y en cualquier teléfono actual. Hay
una sola app, no dos.

## Qué cambió respecto a SDK 54

- **Versiones**: `expo ~51`, `react-native 0.74.5`, `react 18.2.0` y el resto de paquetes `expo-*`
  en las versiones que Expo fija para SDK 51 (ver `package.json`).
- **React Navigation 7 → 6** (`@react-navigation/native` y `native-stack` ^6), la línea que
  corresponde a `react-native-screens` 3.31, la versión que Expo fija para SDK 51. La v7 no se probó
  con este SDK. El código de las pantallas no cambió.
- **Archivos**: la API de clases de `expo-file-system` (`File`, `Directory`, `Paths`) llegó
  recién con SDK 54; acá solo existe la API clásica, asíncrona. Todo el acceso a archivos pasa por
  `src/lib/archivos.ts`. Las rutas son las mismas que antes (`documentDirectory`), así que las
  fotos pendientes que ya estén en un teléfono al actualizar se siguen encontrando.
- **`app.json`**: se quitó el plugin `expo-sqlite` (recién tiene config plugin desde SDK 52).
- **Instalación**: `apps/mobile` salió del workspace de pnpm (ver abajo).

Lo que NO cambió: la base local (`expo-sqlite` 14 ya trae las APIs síncrona y asíncrona que usa
`db/sync.ts`), `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, la cola offline, los
borradores. Nada de la lógica de negocio.

## Instalación y comandos (cambian!)

`apps/mobile` **ya no es parte del workspace de pnpm**. Razón: SDK 51 exige
`node-linker=hoisted` y React 18.2, mientras que `apps/web` usa React 19; instalarlos juntos
obligaría a hoistear dos Reacts distintos en la misma raíz (el clásico "Invalid hook call").
Así, `api` y `web` siguen exactamente igual.

```bash
cd apps/mobile
pnpm install --ignore-workspace     # lockfile propio: apps/mobile/pnpm-lock.yaml
pnpm typecheck
pnpm start                          # Metro
```

`pnpm --filter mobile ...` desde la raíz **ya no funciona**. Tampoco `pnpm lint`/`pnpm typecheck` de la
raíz (turbo) cubren mobile: correrlos dentro de `apps/mobile`. Y como `CLAUDE.md` documenta, las
tiendas solo distribuyen Expo Go para SDK 54: para probar en un teléfono, usar el APK que arma CI. `@adn/shared` y `@adn/ui-tokens` se
enlazan con `link:` y se consumen como TypeScript fuente (ver `metro.config.js` y los `paths` de
`tsconfig.json`, que hacen que `zod` se resuelva siempre desde la instalación de mobile).

## Builds de prueba

Los pushes a la rama `feat/android-6-compat` disparan el workflow "Build Android APK" y publican
el APK como **pre-release** de GitHub. Los pre-releases no cuentan como `releases/latest`, que es
lo que consulta la app para avisar "hay una versión nueva", así que un APK de prueba nunca le
llega a un auditor por ese aviso. Solo `main` publica releases normales.

## Qué verificar en una PDA antes de repartir a todos

Esto no se puede probar sin el equipo físico:

1. Instala y abre sin cerrarse (Android 6.0).
2. Login y descarga de la sesión (9 mil activos: es la operación más pesada).
3. Escanear QR, auditar un activo y tomar las 4 fotos (cámara del sistema de la PDA).
4. Sincronizar y ver la foto en el portal.
5. Con un teléfono que ya tenga la app de SDK 54: instalar este APK encima y comprobar que
   conserva los pendientes de la cola.
6. Exportar pendientes (Excel + zip de fotos).

## Límite de referencias JNI en Android 6/7 (cierre con inventarios grandes)

Con un cliente real (miles de activos) la app se cerraba en la PDA justo después de iniciar
sesión: "Se ha detenido la aplicación". El registro (logcat / informe de errores) decía
`JNI ERROR (app bug): local reference table overflow (max=512)` en `NewStringUTF`, dentro de
`libexpo-modules-core.so`, en el hilo JS. expo-modules-core convierte cada valor JS de una llamada
nativa en un objeto Java y mantiene esas referencias locales vivas hasta que la llamada termina;
ART de Android 6.0/7.x aborta al pasar de 512, y desde Android 8 ese tope ya no existe. Por eso
solo pasaba en las PDAs y solo con volumen (el insert de la descarga mandaba lotes de 500 filas ×
26 columnas = 13.000 valores en una sola sentencia).

Regla para el móvil: **ninguna llamada nativa debe recibir más de ~200 valores**. `db/sync.ts` lo
aplica con `MAX_PARAMS_POR_SENTENCIA` (inserts de activos y ubicaciones y el `inArray` del resumen
van por lotes). Cualquier `INSERT`/`IN (...)` masivo nuevo debe usar `enLotes`/`filasPorLote`.
Verificado en emulador Android 6.0 con el usuario de prueba y un cliente de 3.435 activos: descarga
completa, lista y ficha sin cierres. No verificado: campos de fecha/valor de la ficha (`Intl`) porque ese
cliente no los trae, y volúmenes de ~9 mil activos.

## Desviaciones conocidas respecto a lo que Expo recomienda para SDK 51

`npx expo install --check` marca dos paquetes de desarrollo (no van en el APK): `typescript` (se
usa 5.9 y no 5.3, porque las librerías actuales de tipos lo esperan) y `eslint-config-expo` (v10 y
no 7.x, porque `eslint.config.js` del repo usa el formato *flat*). Typecheck y lint pasan.

## Volver a un SDK moderno

Cuando ya no queden equipos con Android 6: revertir `package.json` al SDK vigente, volver a
`expo-file-system` de clases (o dejar `archivos.ts`, que sigue funcionando con `expo-file-system/legacy`),
React Navigation 7, reincorporar `apps/mobile` a `pnpm-workspace.yaml` y borrar el `.npmrc` y el
lockfile propios.
