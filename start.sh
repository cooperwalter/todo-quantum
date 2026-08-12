#!/bin/sh
set -e
DB_PATH="${DB_PATH:-/data/todo.db}" node /app/dist-server/index.cjs &
NODE_PID=$!
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!
trap 'kill "$NODE_PID" "$CADDY_PID" 2>/dev/null; wait "$NODE_PID" 2>/dev/null; wait "$CADDY_PID" 2>/dev/null; exit 0' TERM INT
wait "$CADDY_PID"
