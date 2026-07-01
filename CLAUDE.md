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
- pnpm dev            # levanta api + web (turbo)
- pnpm --filter mobile start
- pnpm db:migrate / pnpm db:seed
- pnpm lint && pnpm typecheck && pnpm test

## Definición de "hecho"
Lint + typecheck + tests en verde; validación Zod en cliente y servidor; estados de carga/error/vacío;
funciona offline donde aplica.

## Roadmap por hitos
- M0 — Scaffolding. ✅ (este commit)
- M1 — Datos + Auth (API): Prisma schema, migraciones, seed, /auth/*, guards por rol, Swagger.
- M2 — Web: importar + tabla.
- M3 — Móvil: escanear + ficha + editar.
- M4 — Offline-first (WatermelonDB + cola de mutaciones).
- M5 — Fotos (captura, recompresión, URLs prefirmadas).
- M6 — Reportes.
- M7 — Endurecimiento (rate limiting, Sentry, e2e, EAS Build).
