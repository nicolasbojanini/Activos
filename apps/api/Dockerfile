# Un solo stage a propósito: apps/api/webpack.config.js resuelve los clientes
# Prisma generados (apps/api/generated/control-client y tenant-client) a una
# ruta ABSOLUTA calculada en tiempo de build (ver el comentario en ese
# archivo). Si se copiara solo dist/ a una imagen final con un WORKDIR
# distinto, esa ruta quedaría rota en runtime — por eso este Dockerfile nunca
# cambia de WORKDIR entre build y ejecución.
FROM node:20-slim

# openssl: el motor de consultas de Prisma lo necesita en Debian/slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# Copiar solo los package.json primero (todo el workspace, porque apps/api
# depende de @adn/shared) para que la capa de `pnpm install` se cachee salvo
# que cambien las dependencias.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter api build

ENV NODE_ENV=production
EXPOSE 3000

# migrate deploy es seguro de repetir en cada arranque (no-op si ya está al día).
# Las bases tenant (una por cliente) NO se migran acá — eso lo dispara
# provisionTenant() al crear un cliente nuevo, o `pnpm prisma:migrate:tenants`
# manualmente para propagar una migración nueva a clientes ya existentes.
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy --schema prisma/control/schema.prisma && node dist/main.js"]
