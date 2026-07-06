FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
RUN pnpm install --frozen-lockfile

COPY . .

# Vite incrusta VITE_API_URL en el bundle en tiempo de BUILD, no de arranque —
# hay que pasarlo como build arg de Railway apuntando a la URL pública ya
# desplegada de la API, antes de construir esta imagen.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter web build

FROM node:20-slim
RUN npm install -g serve
WORKDIR /app
COPY --from=build /repo/apps/web/dist ./dist

ENV PORT=4173
EXPOSE 4173
CMD ["sh", "-c", "serve -s dist -l $PORT"]
