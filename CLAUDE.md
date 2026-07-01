# ADN — Auditoría de activos fijos

Monorepo TypeScript. Apps: mobile (RN+Expo), web (React+Vite), api (NestJS).
Paquetes: shared (tipos/enums/Zod de dominio), ui-tokens (tokens ADN).

## Reglas
- Todo en TypeScript. Compartir tipos y validaciones vía packages/shared (nunca duplicar).
- Aislar SIEMPRE por organizacionId en el backend (multi-tenant).
- Offline-first en móvil: mutaciones idempotentes por clientId (uuid), cola local, sync con backoff.
- Fotos: subida directa a S3 con URLs prefirmadas; recomprimir en el móvil antes de subir.
- Idioma de la UI: español (Colombia), término "pyme". Sin emojis.

## Diseño (ADN)
- Color único de marca #0073CF; negro #101114; blanco. Neutros y estados: ver packages/ui-tokens.
- Tipografía: Poppins (display), Jost (texto). Radios 4/8/14/20. Sombras frías. Motion 120–320ms sin rebote.
- Iconos: Lucide, 1.8px, currentColor. El símbolo/logo ADN solo desde asset oficial.

## Comandos
- pnpm dev                     # levanta api + web (turbo)
- pnpm --filter mobile start   # Metro; escanear con Expo Go
- pnpm db:migrate / pnpm db:seed
- pnpm lint && pnpm typecheck && pnpm test
- pnpm --filter web test:e2e   # Playwright (requiere api+web+DB seedeada)

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

> **Nota M4:** el handoff original proponía WatermelonDB. Se usó expo-sqlite + Drizzle (alternativa
> explícitamente autorizada en 01-ARQUITECTURA-FULLSTACK.md) porque WatermelonDB requiere un dev-client
> nativo compilado (EAS/prebuild) que no corre en Expo Go plano.
