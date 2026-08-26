# syntax=docker/dockerfile:1
#
# Imagenes del monorepo (T-004). Un solo fichero con varias etapas para que la
# instalacion de dependencias —lo unico verdaderamente lento— se haga UNA vez y
# la compartan el backend y el frontend.
#
# Base Debian (bookworm-slim) y no Alpine a proposito: `sharp` y
# `@node-rs/argon2` son modulos nativos y sus binarios precompilados para musl
# son un camino conocido de fallos en tiempo de arranque. La diferencia de
# tamano no compensa el riesgo en un entorno de desarrollo.

# ---------------------------------------------------------------------------
# deps — dependencias del workspace completo, cacheable
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Solo los manifiestos: mientras no cambien, Docker reutiliza el `npm ci`.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

# `npm ci` respeta el lockfile al pie de la letra. El lockfile se genero en
# Windows pero incluye los binarios opcionales de linux-x64 (sharp, argon2,
# rolldown), asi que instala correctamente aqui.
RUN npm ci

# ---------------------------------------------------------------------------
# api-build — compila @tcg/shared + @tcg/api
# ---------------------------------------------------------------------------
FROM deps AS api-build
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# `tsc --build apps/api` arrastra @tcg/shared por project references, y evita
# compilar @tcg/web, que esta imagen no necesita.
RUN npx tsc --build apps/api \
    && npm prune --omit=dev

# ---------------------------------------------------------------------------
# api — backend y CLI de ingesta
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production

COPY --from=api-build /app/node_modules node_modules
COPY --from=api-build /app/package.json package.json
COPY --from=api-build /app/packages/shared packages/shared
COPY --from=api-build /app/apps/api apps/api

# Las migraciones se aplican solas al arrancar (ver apps/api/src/index.ts), asi
# que el fichero SQL tiene que viajar dentro de la imagen.
COPY db/migrations db/migrations

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]

# ---------------------------------------------------------------------------
# web — servidor de desarrollo de Vite
# ---------------------------------------------------------------------------
FROM deps AS web
WORKDIR /app
# El tsconfig.json RAIZ no viaja a proposito (P-025): referencia ./apps/api,
# cuyo tsconfig no esta en esta imagen, y Vite lo sigue al transformar
# @tcg/shared. Aqui solo hace falta la base, que es de la que hereda el paquete.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

# Vite resuelve `@tcg/shared` por el enlace de workspaces hacia
# packages/shared/dist: si no esta compilado, el import falla en el navegador.
RUN npx tsc --build packages/shared

EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "@tcg/web", "--", "--host", "0.0.0.0"]
