#!/bin/sh
set -e
DB_PATH="${DB_PATH:-/data/todo.db}" node /app/dist-server/index.cjs &
NODE_PID=$!
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!
trap 'kill "$NODE_PID" "$CADDY_PID" 2>/dev/null; wait "$NODE_PID" 2>/dev/null; wait "$CADDY_PID" 2>/dev/null; exit 0' TERM INT
# Supervise both children. Caddy outliving a dead API would keep the static
# healthcheck green forever, so poll each PID (BusyBox sh has no `wait -n`) and
# tear the survivor down as soon as one exits, then fail so Railway restarts us.
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$CADDY_PID" 2>/dev/null; do
	sleep 1
done
kill "$NODE_PID" "$CADDY_PID" 2>/dev/null || true
wait "$NODE_PID" 2>/dev/null || true
wait "$CADDY_PID" 2>/dev/null || true
exit 1
