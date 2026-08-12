# SQLite Persistence — Design

Date: 2026-08-11
Status: Approved (brainstorm)

## Goal

Persist todos server-side, scoped per user by a plain username string (no
authentication), using SQLite, deployed within the existing Railway service.
Additionally migrate the todos currently in localStorage at `localhost:5273`
to production under the username `cooper`.

## Decisions

- Sync model: whole-blob, last-write-wins. One row per username holding the
  full `AppData` JSON the client already produces.
- Offline role: localStorage stays as a cache with write-through; saves queue
  and retry when the network is down.
- Username UX: first-run prompt, remembered in localStorage; a command
  switches users later.
- Topology: existing Caddy container gains a Node API sidecar process;
  Caddy reverse-proxies `/api/*` to it. One Railway service, one volume.

## Server & API

- Stack: Node + Hono + better-sqlite3, TypeScript, in a new `server/`
  directory with its own build.
- Database file: `/data/todo.db` in production (Railway volume mounted at
  `/data`); `./tmp/todo.db` in local dev. WAL mode, `busy_timeout` set.
- Schema:

  ```sql
  CREATE TABLE IF NOT EXISTS users (
    username   TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ```

- Endpoints:
  - `GET /api/users/:username/data` → `200 { data, updatedAt }`, or `404`
    if the user has never saved.
  - `PUT /api/users/:username/data` → validates the body is well-formed
    `AppData` (same validation shape as `src/lib/persistence.ts`), upserts,
    returns `{ updatedAt }`. Last write wins.
- Username rules: lowercased, trimmed, must match `[a-z0-9-_]{1,32}`;
  otherwise `400`.
- Request body capped at ~1 MB. No auth; the username is the entire scope.

## Client sync behavior

- Username gate: on first load, a minimal screen (styled per
  `DESIGN-SYSTEM.md`) asks for a username, stored as
  `todo-quantum.username`. A `:user` command switches users later.
- Per-user local cache key: `todo-quantum.v1.<username>`. Existing
  single-key data (`todo-quantum.v1`) is migrated to the per-user key on
  first username entry.
- Load: render immediately from the local cache, then fetch the server copy
  in the background. Newer `updatedAt` wins (the client tracks the last
  synced `updatedAt`). A background load that changes state reuses the
  existing `externalReload` action with a toast ("List updated from
  server").
- Save: debounced save writes localStorage first (unchanged), then `PUT`s
  the same blob. A failed PUT sets a new `SaveFailure` value `'offline'`,
  keeps the payload pending, and retries on the existing 5 s loop —
  mirroring the current quota-error handling in `usePersistence`.
- First sync for a fresh username: server empty + local data → push local
  up; server data + local empty → server wins.

## Deployment (Railway)

- Dockerfile: add a server build stage; final stage contains Caddy, Node,
  and a small `start.sh` that launches the API on an internal port (3000)
  then runs Caddy in the foreground.
- Caddyfile: add `handle /api/*` → `reverse_proxy localhost:3000` above the
  static handlers. Existing cache/security-header behavior untouched
  (`connect-src 'self'` already permits the API).
- Railway: attach a volume mounted at `/data`. Healthcheck stays `/`.

## Migration (one-off, after deploy)

1. Open `localhost:5273`, copy `localStorage['todo-quantum.v1']`.
2. `curl -X PUT https://<prod-domain>/api/users/cooper/data` with that JSON.
3. Visit production, enter username `cooper`; the client pulls the data.

No throwaway code — this uses the normal endpoint.

## Testing

- Server unit tests (vitest): validation, upsert/LWW, username rules,
  404/400 paths — better-sqlite3 with an in-memory database.
- Client unit tests for the remote-sync layer with mocked `fetch`,
  mirroring `usePersistence.test.tsx` style (generator-function setup).
- Visual gate for the username screen (new UI): baseline + axe per the
  Pixel Law.

## Out of scope

- Authentication, passwords, or any access control beyond the username.
- Per-task rows / partial sync / CRDTs.
- Multi-device conflict resolution beyond last-write-wins.
