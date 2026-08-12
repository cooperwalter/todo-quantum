# syntax=docker/dockerfile:1

FROM node:26-alpine AS build
WORKDIR /app
# Node 26 images no longer bundle corepack. Installing it above the manifest
# COPY keeps this layer cached across dependency edits, and pinning it keeps the
# toolchain reproducible.
RUN npm install -g corepack@0.35.0
COPY package.json pnpm-lock.yaml ./
# `corepack install` with no arguments resolves pnpm from package.json's
# packageManager field, so the version lives in exactly one place.
RUN corepack install
# better-sqlite3 is a regular dependency (used by the server bundle), so this
# full install compiles its native binding too; alpine/musl has no prebuild.
RUN apk add --no-cache python3 make g++
# Railway's builder requires cache-mount ids to carry a service-scoped prefix
# (s/<service-id>-...); Docker itself treats the id as an opaque cache key, so
# the same value works locally.
RUN --mount=type=cache,id=s/65a5f3ba-b162-4f56-8b82-abd736ba928a-pnpm,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
RUN pnpm run server:build

# better-sqlite3 is external to the server bundle and needs its native binding
# plus its runtime dependency subtree. alpine/musl isn't covered by
# better-sqlite3's prebuilds, so this stage compiles from source.
FROM node:26-alpine AS server-deps
WORKDIR /app
RUN npm install -g corepack@0.35.0
COPY package.json pnpm-lock.yaml ./
RUN corepack install
RUN apk add --no-cache python3 make g++
RUN --mount=type=cache,id=s/65a5f3ba-b162-4f56-8b82-abd736ba928a-pnpm-prod,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile --prod

FROM node:26-alpine
RUN apk add --no-cache caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY --from=build /app/dist-server /app/dist-server
COPY --from=server-deps /app/node_modules /app/node_modules
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
