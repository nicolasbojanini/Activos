# ADN — Auditoría de activos fijos

Monorepo TypeScript. Apps: mobile (RN+Expo), web (React+Vite), api (NestJS).
Paquetes: shared (tipos/enums/Zod de dominio), ui-tokens (tokens ADN).

## Arquitectura multi-cliente (control DB + tenant DB por cliente)

Desde julio 2026 el backend es multi-tenant con **bases de datos físicamente separadas por
cliente**, no solo aisladas lógicamente. Dos bases de datos Postgres distintas:

- **Control DB** (`apps/api/prisma/control/schema.prisma`) — compartida, una sola. Contiene
  `Usuario` (personal de ADN: `ADN_ADMIN`/`COORDINADOR`/`AUDITOR` — NO son empleados de los
  clientes, un mismo usuario puede trabajar en proyectos de varios clientes), `Cliente`
  (registro de cada cliente + su `dbName`), y `AsignacionProyecto` (qué auditor puede ver qué
  proyecto de qué cliente — `proyectoId` es un string plano sin FK real, porque apunta a otra
  base de datos física).
- **Tenant DB** (`apps/api/prisma/tenant/schema.prisma`) — una por `Cliente`, aprovisionada
  dinámicamente (`CREATE DATABASE` + migración, ver `apps/api/scripts/provision-tenant.ts`).
  Contiene `ProyectoAuditoria`, `Activo`, `Ubicacion`, `RegistroAuditoria`, `Foto`,
  `LoteImportacion` — sin `organizacionId` (ya no aplica: toda la base de datos ES el límite
  del tenant). `RegistroAuditoria.auditorId` es un string plano (Usuario vive en la control DB);
  para mostrar el nombre del auditor hay que resolverlo aparte vía
  `apps/api/src/common/resolver-nombres-auditores.ts`.

Generan dos clientes Prisma independientes a `apps/api/generated/{control,tenant}-client`
(esa carpeta ya está en `.gitignore`). El tenant se resuelve **por request** (ruta
`/clientes/:clienteId/...`), nunca por sesión — un mismo usuario puede trabajar en varios
clientes. `TenantGuard` (`apps/api/src/auth/guards/tenant.guard.ts`) valida el acceso y deja
el `TenantPrismaClient` correcto en `request.tenantPrisma`, expuesto a los controllers vía el
decorator `@TenantPrisma()`. Los servicios ya NO reciben `organizacionId`; reciben el
`tenantPrisma` como primer parámetro de cada método.

Reglas de acceso: `ADN_ADMIN` da de alta clientes nuevos; `COORDINADOR` ve/gestiona todos los
clientes; `AUDITOR` solo ve los proyectos a los que fue asignado explícitamente.

## Reglas
- Todo en TypeScript. Compartir tipos y validaciones vía packages/shared (nunca duplicar).
- Offline-first en móvil: mutaciones idempotentes por clientId (uuid), cola local, sync con backoff.
- Fotos: subida directa a S3 con URLs prefirmadas; recomprimir en el móvil antes de subir.
- Idioma de la UI: español (Colombia), término "pyme". Sin emojis.

## Diseño (ADN)
- Color único de marca #0073CF; negro #101114; blanco. Neutros y estados: ver packages/ui-tokens.
- Tipografía: Poppins (display), Jost (texto). Radios 4/8/14/20. Sombras frías. Motion 120–320ms sin rebote.
- Iconos: Lucide, 1.8px, currentColor. El símbolo/logo ADN solo desde asset oficial.

## Variables de entorno (`apps/api/.env`)
- `CONTROL_DATABASE_URL` — la única control DB.
- `TENANT_DATABASE_URL` — placeholder, solo usado por `prisma generate`/`migrate dev` del
  schema tenant; en runtime cada tenant se conecta con su propia URL resuelta desde
  `Cliente.dbName` + `TENANT_DB_USER`/`TENANT_DB_PASSWORD` (un solo rol de Postgres compartido
  para todas las bases tenant, no una contraseña por cliente).
- `POSTGRES_ADMIN_URL` — conexión de mantenimiento (a la base `postgres` por defecto) usada
  para `CREATE DATABASE` al aprovisionar un cliente nuevo.
- Resto igual que antes (JWT, S3/MinIO, Sentry).

## Comandos
- pnpm dev                               # levanta api + web (turbo)
- pnpm --filter mobile start              # Metro; escanear con Expo Go
- pnpm --filter api prisma:generate       # genera ambos clientes Prisma (control + tenant)
- pnpm --filter api prisma:migrate:control  # migración de la control DB
- pnpm --filter api prisma:migrate:tenant:dev  # migración del schema tenant (contra TENANT_DATABASE_URL)
- pnpm --filter api prisma:migrate:tenants   # aplica migraciones pendientes a TODAS las bases tenant existentes
- pnpm db:seed                            # corre prisma/control/seed.ts (siembra control + un cliente demo + su tenant)
- pnpm lint && pnpm typecheck && pnpm test
- pnpm --filter web test:e2e              # Playwright (requiere api+web+DB seedeada)

## Observabilidad y seguridad
- Sentry en las 3 apps: no-op mientras SENTRY_DSN / VITE_SENTRY_DSN / EXPO_PUBLIC_SENTRY_DSN
  estén vacíos. Se activa solo con la variable de entorno, sin tocar código.
- Rate limiting en /auth/login (5/min) y /auth/refresh (10/min) vía @nestjs/throttler.

## EAS Build (móvil) — pasos manuales, requieren cuenta Expo
```bash
npm i -g eas-cli
eas login
cd apps/mobile
eas build --profile development --platform ios      # o android
eas build --profile production --platform all
eas submit --platform ios                            # TestFlight
eas submit --platform android                        # Play Console
```
Perfiles en `apps/mobile/eas.json`. Bundle id / package: `com.adn.auditoria`.

## Definición de "hecho"
Lint + typecheck + tests en verde; validación Zod en cliente y servidor; estados de carga/error/vacío;
funciona offline donde aplica.

## Roadmap por hitos
- M0 — Scaffolding. ✅
- M1 — Datos + Auth (API). ✅
- M2 — Web: importar + tabla. ✅
- M3 — Móvil: escanear + ficha + editar. ✅
- M4 — Offline-first: espejo local (expo-sqlite + Drizzle, no WatermelonDB — ver nota abajo)
  + cola de mutaciones idempotente. ✅
- M5 — Fotos (captura, recompresión, URLs prefirmadas). ✅
- M6 — Reportes (xlsx/pdf/csv). ✅
- M7 — Endurecimiento (rate limiting, Sentry, e2e, EAS Build). ✅
- M8 — Multi-cliente (bases de datos separadas), módulo de auditores/asignaciones,
  descarga masiva de fotos en .zip. ✅ backend + web + móvil (reconectado en M11, ver nota).
- M9 — Campos de activo configurables por cliente (ver nota abajo). ✅ backend + web + móvil
  (reconectado en M11).
- M10 — Escanear ubicación + reubicación automática de activos (ver nota abajo). ✅ backend +
  shared + móvil.
- M11 — Reconexión de móvil al backend multi-cliente (ver nota abajo). ✅ código completo y
  probado contra la API real vía curl. **Pendiente: confirmación visual en Expo Go** (no se
  puede hacer desde acá — requiere el teléfono del usuario).

> **Nota M4:** el handoff original proponía WatermelonDB. Se usó expo-sqlite + Drizzle (alternativa
> explícitamente autorizada en 01-ARQUITECTURA-FULLSTACK.md) porque WatermelonDB requiere un dev-client
> nativo compilado (EAS/prebuild) que no corre en Expo Go plano.

> **Nota móvil (2026-07, SDK):** el proyecto se bajó de Expo SDK 57 a **SDK 54** (`npx expo install --fix`
> resolvió react-native 0.81.5, react 19.1.0 y el resto de paquetes `expo-*` acordes). Motivo: desde
> mayo de 2026 Apple tiene pendiente de aprobación Expo Go SDK 55+ en el App Store, así que tanto
> App Store como Play Store solo distribuyen Expo Go para SDK 54. Sin cuenta de Apple Developer (para
> `eas go`/TestFlight) ni Xcode local, SDK 54 es la única forma de probar con el Expo Go público en
> iOS y Android. Verificar antes de volver a subir de SDK: https://expo.dev/changelog (buscar el
> changelog de "Expo Go and the App Store").

> **Nota M11 (2026-07, reconexión móvil):** móvil ya llama todas las rutas tenant-scoped con
> `/clientes/:clienteId/...` en vez de las rutas viejas de M8. El `clienteId`/`proyectoId` NO se
> eligen a mano — se resuelven automáticamente tras el login vía el nuevo endpoint
> `GET /usuarios/me/asignacion` (`usuarios.controller.ts`, con `@Roles()` a nivel de método que
> sobrescribe la restricción de la clase, así un `AUDITOR` puede consultar su propia asignación
> aunque `GET /usuarios/:id/asignaciones` siga restringido a `ADN_ADMIN`/`COORDINADOR`), aprovechando
> que cada auditor tiene a lo sumo un proyecto asignado a la vez (ver M8). El resultado se guarda en
> `lib/auth-store.ts` (persistido en SecureStore, igual que `usuario` — a diferencia de
> `ubicacion-activa-store.ts`, que es efímero a propósito). Si el auditor no tiene asignación,
> `InicioScreen` muestra un estado vacío con botón "Reintentar" en vez de fallar. De paso se completó
> el rename `placa`/`codigoQR` → `codigoNuevo` en todo mobile (SQLite local, pantallas, snapshots de
> la cola offline) que había quedado pendiente desde M9. `pnpm --filter mobile typecheck`/`lint` en
> cero. Verificado con curl end-to-end contra la API real usando `auditor@adn.demo`. **No verificado
> visualmente en Expo Go** — eso requiere el teléfono del usuario.

> **Nota M9 (2026-07, campos configurables):** `codigoNuevo` reemplazó `placa`/`codigoQR` como único
> identificador técnico del activo (`@@unique` en la tenant DB). El catálogo completo de campos vive en
> `packages/shared/src/campos-catalogo.ts` (`CAMPOS_ACTIVO_CATALOGO`, fuente única para mapeo de
> importación, configuración por cliente y etiquetas de la ficha). Cada cliente tiene su propia
> configuración (`ConfiguracionCampo` + `CampoPersonalizado` en la control DB, gestionadas desde
> `/clientes/:clienteId/campos` en la web, solo `ADN_ADMIN`) que decide qué campos se muestran y cuáles
> son obligatorios — `codigoNuevo` no se puede ocultar ni volver opcional. `ImportsService` arma el
> mapeo sugerido y valida los campos requeridos dinámicamente contra esa configuración; `RegistrosService`
> aplica cualquier campo del catálogo presente en `cambios` (no un subconjunto fijo) y mergea
> `camposPersonalizados` en vez de sobreescribirlo. El rename `codigoNuevo` se completó también en
> móvil como parte de M11.

> **Nota M10 (2026-07, escanear ubicación):** `Ubicacion` ganó un campo `codigo` único
> (`UBI-XXXXXXXX`, generado automáticamente al crearse — ya sea por el backfill de la migración
> o por `resolverUbicacionId` en `imports.service.ts`), y un endpoint `GET
> /clientes/:clienteId/ubicaciones/buscar?codigo=` que mirror-ea exactamente el de activos. En
> mobile, el auditor tiene dos botones en Inicio ("Escanear ubicación" / "Escanear código QR");
> escanear una ubicación la deja "activa" en `lib/ubicacion-activa-store.ts` (zustand, **en
> memoria, sin persistir** — a propósito, para no arrastrar una ubicación vieja entre sesiones).
> Mientras haya una ubicación activa, escanear/auditar un activo con otra ubicación guardada lo
> reubica automáticamente (`lib/ubicacion-relocate.ts`, aplicado en `DetalleScreen` y
> `ActualizarScreen`, escalando `AUDITADO`→`DIFERENCIA` cuando el único cambio es la ubicación).
> `buscarUbicacionPorCodigo`/`getUbicaciones` en `lib/services.ts` ya usan el prefijo
> `/clientes/:clienteId/...` desde M11.

> **Nota IP LAN (mobile/web dev):** `apps/web/.env` (`VITE_API_URL`) y `apps/mobile/.env`
> (`EXPO_PUBLIC_API_URL`), además de `apps/api/.env` (`S3_ENDPOINT`), usan la IP LAN del Mac de
> desarrollo para que el teléfono (Expo Go) y las URLs de fotos S3 sean alcanzables desde fuera de
> `localhost`. Esa IP cambia con las renovaciones de DHCP — si el móvil o las fotos dejan de conectar,
> verificar `ipconfig getifaddr en0` contra esos tres archivos antes de asumir otra causa.
