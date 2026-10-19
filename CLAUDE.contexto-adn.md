# ADN — Auditoría de activos fijos (APP Activos)

> Fuente: 1 sesión larga de Claude Code (12-ago → ~oct-2026, 101 turnos, carpeta `~/Public`) + el `CLAUDE.md` del repo (`_CLAUDE existente (adn-auditoria-fix)`). Lo que no consta allí va como «por confirmar». Sin claves.
> Ojo: el CLAUDE.md del repo quedó **desactualizado** respecto a lo que hizo la sesión (ver «Por confirmar»): dice Expo SDK 54 y `pnpm --filter mobile`, pero la rama activa usa SDK 51 y `apps/mobile` sale del workspace.

## Qué es y para quién
- Plataforma para auditar activos fijos en campo: auditores ADN escanean QR, validan/editan la ficha del activo y toman hasta 4 fotos. Coordinadores y admin ven todo desde el portal web y descargan Excel y zip de fotos.
- Usuarios: personal de ADN (`ADN_ADMIN`, `COORDINADOR`, `AUDITOR`), no empleados del cliente. Un auditor ve solo el proyecto asignado.
- Clientes vistos en las sesiones: Decameron (~9.000 activos; ya eliminado al 1-oct), Terpel Occidente (3.435), QBCO Buga, Escuela de Ingeniería de Antioquia, AIM Ingenieros, uaralac, pqp jamundi (estos dos tal vez de prueba).
- Equipos: celulares personales de los auditores y **10 PDAs Chainway C71 con Android 6.0** (no actualizables, confirmado con el fabricante).

## Stack
- Monorepo TypeScript con pnpm + Turbo: `apps/mobile` (React Native + Expo), `apps/web` (React + Vite), `apps/api` (NestJS + Prisma), `packages/shared` (tipos/Zod), `packages/ui-tokens`.
- Móvil: **Expo SDK 51 / RN 0.74** en la rama de compatibilidad Android 6 (minSdk 23; el mismo APK sirve en teléfonos modernos). Antes SDK 54 (RN 0.81). expo-sqlite + Drizzle (espejo local), react-query, zustand, expo-secure-store, Sentry (inerte sin DSN).
- Datos: Postgres 18 (Railway). **Una control DB** (usuarios, clientes, asignaciones, configuración de campos) y **una base tenant por cliente** (activos, ubicaciones, registros, fotos). Fotos en MinIO (S3 compatible) en Railway.
- Infra: Railway (servicios `api`, `web`, `Postgres`, `minio`). APK por GitHub Actions; repo `nicolasbojanini/Activos`.
- Diseño: azul `#0073CF`, Poppins/Jost, UI en español (Colombia), sin emojis, término «pyme».

## Estructura (resumen)
- `apps/api/prisma/{control,tenant}/schema.prisma` y migraciones; `TenantGuard` resuelve el tenant por request (`/clientes/:clienteId/...`); `UserThrottlerGuard`; `provision-tenant.ts` crea la base de un cliente.
- `apps/mobile/src`: `lib/` (`api.ts`, `registro-offline.ts` cola offline, `fotos.ts`, `borrador-auditoria.ts`, `actualizacion.ts`, `carpeta-publica.ts`), `db/` (schema, `client.ts`, `sync.ts`), `screens/` (`InicioScreen`, `ActualizarScreen`, `DetalleScreen`, `NoRegistradoScreen`), `components/FotosGrid.tsx`.
- `apps/web/src/pages/Auditores.tsx` (columna de último build por auditor). `apps/mobile/ANDROID6.md` y `docs/android6/` documentan la compatibilidad.
- `.github/workflows/build-android-apk.yml`.

## Cómo se corre, prueba y despliega
- Dev: `pnpm dev` (api+web), Metro para el móvil. En la rama Android 6 el móvil se instala con `pnpm install --ignore-workspace` y `pnpm --filter mobile` ya no aplica. `pnpm lint && pnpm typecheck && pnpm test`; e2e con Playwright.
- **APK:** push a `main` compila en Actions (~12 min) y publica release `apk-<hash>`; otras ramas → pre-release (no avisan a los auditores). La app compara por **hash de commit**, no por número. Versión visible en Inicio: `1.<build>` (EXPO_PUBLIC_BUILD_NUMBER).
- **API/web:** despliegue **manual** con `railway up --service api --environment production --detach`, siempre desde `~/Documents/adn-auditoria`. Desde `~/Public/adn-android6` falló 4 veces (paquete de 20 MB sin Dockerfile; desde Documents pesa 1,3 MB y funciona). Causa exacta por confirmar.
- Migraciones: aditivas a mano; no borrar ni modificar registros de producción (instrucción explícita de Nicolás).
- Prueba en emuladores: Android 6 (API 23) y Android 14 creados en el Mac de Nicolás. Pruebas de carga en C71 hechas con v1.56/v1.57 y cliente Terpel.

## Integraciones y datos
- Auditor → API (HTTPS 443) para login/sync; **las fotos suben directo del teléfono a MinIO con URL prefirmada** y luego `POST /fotos/confirmar` (HeadObject) pone `bytes`. Reportes solo cuentan fotos con `bytes` no nulo.
- Dominios que el firewall del cliente debe permitir (documento Word ya entregado): el dominio público de `api` y el de `minio` en `up.railway.app`, por **dominio (SNI), no por IP**, y revisar inspección TLS. Opcionales: `api.github.com`, `github.com`, `objects.githubusercontent.com`.
- Actualización: la app consulta `api.github.com/.../releases/latest` sin credenciales (60 consultas/h por IP).
- `GET /usuarios/me/asignacion` resuelve cliente/proyecto tras el login (a lo más un proyecto por auditor). Se envía el build al backend y se guarda `ultimoBuildApp` por usuario.
- Campos del activo configurables por cliente; `codigoNuevo` es el identificador técnico único.

## Decisiones tomadas y por qué
- Una base Postgres por cliente (aislamiento físico) y tenant por request.
- Offline-first con cola idempotente por `clientId`; expo-sqlite+Drizzle en vez de WatermelonDB (Expo Go/sin dev-client).
- Una sola app para PDAs viejas y teléfonos nuevos: bajar a SDK 51 y sacar `mobile` del workspace (React 18 vs 19 de web); instalar el certificado ISRG Root X1 en cada C71 (Android < 7.1.1 no lo trae) en vez de tocar código o cambiar de dominio.
- Volver a la **cámara nativa** (ImagePicker): `expo-camera` no daba flash ni enfoque fiable; foto reducida a **1024 px** (menos peso, ANR y volumen MinIO).
- Persistir **borrador** de la auditoría en SQLite (se guarda antes de abrir la cámara, cada 15 s, al pasar a segundo plano) para que un cierre no cueste el trabajo.
- Enfriamiento de la sync automática al volver a primer plano: **20 minutos** (seguridad, no tiempo real).
- Al eliminar un cliente desde el panel, se borran su base y sus fotos de MinIO; los coordinadores descargan datos y fotos antes.
- Fotos y zips se nombran con **código nuevo**.

## Problemas encontrados y cómo se resolvieron
- **Fotos faltantes (260 activos, 82 fotos):** el registro se marcaba sincronizado tras el paso 1 y la subida/confirmación fallaba con mala señal; además daba por subida una foto cuyo archivo local ya no existía. Se aplicaron 3 arreglos y guardado local de fotos (antes de eso se perdieron las del primer día). Verificación de huérfanas en S3 pendiente de la mano de Nicolás.
- **Cierres y bloqueo al fotografiar:** primero se pensó en muerte del proceso por memoria; era además un **ANR** (diálogo «no responde»). Hallazgo: el driver Drizzle/expo-sqlite es síncrono, bloquea el hilo JS. Se movió el trabajo pesado (sugerencias, respaldo de fotos) fuera del camino crítico, se corrigió un `reset()` del formulario por refetch de react-query y se redujeron miniaturas. Sentry sin DSN: sigue sin telemetría real.
- **Fotos con código viejo:** `ActualizarScreen` nombraba con el código previo; corregido (v1.46). Unas 1.671 fotos de Decameron quedaron mal nombradas; renombrado masivo previsto al final con carpeta de fotos.
- **Sesión que se cerraba (v1.57):** `/auth/refresh` limitaba por IP (10/min) y 9 PDAs en el mismo wifi lo agotaban; la app borraba la sesión ante cualquier error. Ahora solo ante 401 y el límite es por usuario.
- **Caída de Postgres ~1 h (24-25 ago):** reinicio de Railway, recuperación limpia, sin pérdida de datos. Parche 18.4→18.6 aplicado a mano por un CVE.
- **MinIO al 96 %:** 9.550 carpetas huérfanas de clientes borrados (2,4 GB). Se borraron 17.071 objetos (manifiesto en `~/Documents/minio_huerfanos_borrados_2026-10-01.tsv`); el volumen pasó de 4,82 a 2,11 GB.
- **Android 6:** sin certificado raíz no conecta; con ISRG instalado funciona. PDA #10 tenía fecha 1/20/2018 y se resolvió al final.
- **Banner de actualización no sale** en el wifi compartido por el límite de GitHub; workaround: enlace directo del APK por WhatsApp.

## Convenciones y preferencias de Nicolás
- Español de Colombia; explicaciones directas con causa, evidencia y qué falta verificar. No declarar victoria sin prueba.
- Quiere soluciones definitivas, no parches repetidos («no nos desgastemos con el rollback, solucionemos»).
- Agrupa cambios en **un solo build**. Los despliegues y acciones sobre producción los confirma o corre él.
- Datos de producción: nunca borrar sin confirmación explícita y verificación previa (comparación real de conjuntos).
- Pide opciones claras antes de cambios de arquitectura (repo público/privado, proxy de actualización).

## Pendientes y riesgos
- Rama `feat/android-6-compat`: el cierre dice «fusionar a main»; el estado final de `main` y del APK instalado en las 10 PDAs es v1.57+ (`apk-286d762`). Por confirmar versión vigente.
- **Repo GitHub público:** cualquiera puede ver el código y las releases. Pasarlo a privado rompe el aviso de actualización y la descarga. Se recomendó repo privado + repo público solo con APKs (opción 3), o proxy por API. **No se decidió.**
- Hallazgo de la auditoría del 25-sep: credenciales dentro del APK; rotar. Revisar historial de git en busca de secretos.
- Proxy de actualización a través de la API (cacheada) pendiente: Nicolás dijo «dejémoslo así por ahora».
- Sentry sin DSN; `NoRegistradoScreen` sin borrador persistente; lint de CI roto desde antes (no bloquea).
- Fotos aún perdidas el primer día, no recuperables; renombrado masivo de fotos al terminar el proyecto.
- Duplicados en el import de Decameron (`DMA 00886` vs `DMA00886`).
- Cupo de 5 GB de MinIO y 500 MB de Postgres en Railway; vigilar.
- La IP LAN del Mac cambia: si móvil o fotos fallan en dev, revisar `.env` (api, web, mobile).

## Por confirmar
- Qué carpeta es el repo vigente: `~/Documents/adn-auditoria` (despliegues), `~/Public/adn-android6` (rama Android 6) o `~/Public/adn-auditoria-fix` (origen de este encargo); no pude abrirlas.
- Si el CLAUDE.md del repo se actualizó con SDK 51, el ciclo de borrador y las reglas de despliegue.
- Estado actual de `main` y de la release más reciente tras el 1-oct-2026.
- Qué clientes siguen vigentes (Decameron y supermercados super boom ya no están en la tabla de clientes).
- Dónde viven las credenciales actuales y si ya se rotaron.
