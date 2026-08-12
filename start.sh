#!/bin/sh
set -e
DB_PATH="${DB_PATH:-/data/todo.db}" node /app/dist-server/index.cjs &
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
