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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
