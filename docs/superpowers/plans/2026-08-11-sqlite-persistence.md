# SQLite Username-Scoped Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist todos server-side in SQLite, scoped by a plain username string, with the existing localStorage flow kept as an offline cache (write-through, last-write-wins), deployed inside the existing Caddy container on Railway.

**Architecture:** A Node sidecar (Hono + better-sqlite3) exposes `GET/PUT /api/users/:username/data` storing the whole `AppData` blob per username; Caddy reverse-proxies `/api/*` to it. The client gains a username gate, per-user localStorage keys, and a write-through sync layer inside the existing `usePersistence` hook. Spec: `docs/superpowers/specs/2026-08-11-sqlite-persistence-design.md`.

**Tech Stack:** TypeScript, Hono, @hono/node-server, better-sqlite3, esbuild (server bundle), React 19, vitest, Playwright.

## Global Constraints

- Never use `any` in TypeScript; use real types or `unknown` (user CLAUDE.md).
- No new code comments when editing existing code (user CLAUDE.md).
- Unit-test descriptions must state the exact behavior ("should reject usernames longer than 32 characters", not "should validate input").
- Prefer generator/factory functions (`makeX()`) over `beforeEach` setup in tests.
- Typecheck after every TypeScript change: `pnpm run build` (note: `pnpm run typecheck` does NOT cover new files reliably; the lens gate uses `pnpm run build`).
- Iron Law: no completion claim without fresh command output. Pixel Law: new UI (the username gate) requires the visual gate.
- Visual decisions for the username gate derive from `DESIGN-SYSTEM.md` token names exactly.
- Coverage thresholds are 80% on `src/**` — every new `src/` module needs real tests.
- Commit after each task (we are on `feat/sqlite-persistence`; committing without asking is allowed on this branch).
- Username rules (spec, verbatim): lowercased, trimmed, must match `[a-z0-9-_]{1,32}`.
- localStorage keys (spec, verbatim): username under `todo-quantum.username`, per-user data under `todo-quantum.v1.<username>`, legacy key `todo-quantum.v1` migrates to the per-user key on first username entry.
- Server DB path: `/data/todo.db` in production (env `DB_PATH`), `./tmp/todo.db` in dev. API listens on port 3000 internally.

---

### Task 1: Extract shared AppData validation into `src/lib/validate.ts`

The server must validate PUT bodies with the exact same rules the client uses. Today `isAppData`/`isTask`/`isRecurrence` are private to `src/lib/persistence.ts`. Move them to a new DOM-free module both sides import.

**Files:**
- Create: `src/lib/validate.ts`
- Create: `src/lib/validate.test.ts`
- Modify: `src/lib/persistence.ts` (delete the moved functions + `DATE_RE`/`TIME_RE`/`FREQS`, import `isAppData` instead)

**Interfaces:**
- Consumes: `AppData`, `Task`, `Recurrence` from `src/lib/types.ts`.
- Produces: `export function isAppData(value: unknown): value is AppData` (later tasks: server Task 3 imports it; `persistence.ts` keeps working unchanged externally).

- [ ] **Step 1: Write the failing test**

`src/lib/validate.test.ts` — port the validation-relevant cases. Existing coverage of these rules lives in `src/lib/persistence.test.ts` via `load()`; this file tests `isAppData` directly:

```typescript
import { describe, expect, it } from 'vitest';
import { isAppData } from './validate';
import type { AppData, Task } from './types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Water the pine',
    status: 'open',
    dueDate: null,
    dueTime: null,
    list: null,
    priority: null,
    recurrence: null,
    createdAt: '2026-08-11T00:00:00.000Z',
    completedAt: null,
    order: 1,
    ...overrides,
  };
}

function makeData(tasks: Task[] = []): AppData {
  return { schemaVersion: 1, tasks };
}

describe('isAppData', () => {
  it('should accept an empty task list at schemaVersion 1', () => {
    expect(isAppData(makeData())).toBe(true);
  });
  it('should accept a fully populated task', () => {
    expect(
      isAppData(
        makeData([
          makeTask({
            dueDate: '2026-08-12',
            dueTime: '09:30',
            list: 'garden',
            priority: 2,
            recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3], byMonthDay: null },
            completedAt: '2026-08-11T01:00:00.000Z',
          }),
        ]),
      ),
    ).toBe(true);
  });
  it('should reject a schemaVersion other than 1', () => {
    expect(isAppData({ schemaVersion: 2, tasks: [] })).toBe(false);
  });
  it('should reject non-object values', () => {
    expect(isAppData(null)).toBe(false);
    expect(isAppData('[]')).toBe(false);
  });
  it('should reject a task whose dueDate is not YYYY-MM-DD', () => {
    expect(isAppData(makeData([makeTask({ dueDate: '12/08/2026' })]))).toBe(false);
  });
  it('should reject a task whose status is neither open nor done', () => {
    expect(isAppData(makeData([{ ...makeTask(), status: 'archived' } as unknown as Task]))).toBe(false);
  });
  it('should reject a recurrence with an empty byWeekday array', () => {
    expect(
      isAppData(
        makeData([
          makeTask({
            recurrence: { freq: 'weekly', interval: 1, byWeekday: [], byMonthDay: null },
          }),
        ]),
      ),
    ).toBe(false);
  });
  it('should reject a task with a non-finite order', () => {
    expect(isAppData(makeData([makeTask({ order: Number.NaN })]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Create `src/lib/validate.ts`**

Move `DATE_RE`, `TIME_RE`, `FREQS`, `isRecurrence`, `isTask`, `isAppData` verbatim from `src/lib/persistence.ts` (lines 8–54). Export only `isAppData`; keep the rest module-private. Imports: `import type { AppData, Recurrence, Task } from './types';`. No DOM references belong in this file.

- [ ] **Step 4: Update `src/lib/persistence.ts`**

Delete the moved code; add `import { isAppData } from './validate';`. Everything else (`load`, `save`, `getLocalStorage`, `memoryStorage`, keys) stays byte-identical.

- [ ] **Step 5: Run the full unit suite and typecheck**

Run: `pnpm exec vitest run && pnpm run build`
Expected: all tests pass (persistence tests prove the move preserved behavior), build clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validate.ts src/lib/validate.test.ts src/lib/persistence.ts
git commit -m "refactor: extract AppData validation into shared validate module"
```

---

### Task 2: Server database module (`server/db.ts`)

**Files:**
- Create: `server/db.ts`
- Create: `server/db.test.ts`
- Modify: `package.json` (deps), `vite.config.ts` (test include), `tsconfig.json` / `tsconfig.node.json` (see Step 0), `.gitignore` (add `tmp/`, `dist-server/` if absent)

**Interfaces:**
- Consumes: nothing from the app.
- Produces (Task 3 consumes):
  - `export function openDb(path: string): Database` — opens better-sqlite3 at `path` (`':memory:'` allowed), sets `journal_mode = WAL` (skipped automatically by SQLite for `:memory:`), `busy_timeout = 5000`, creates the `users` table if absent.
  - `export function getUserData(db: Database, username: string): { data: string; updatedAt: string } | null`
  - `export function putUserData(db: Database, username: string, data: string, updatedAt: string): void` — upsert; last write wins.
  - `Database` is the default-export type of `better-sqlite3`.

- [ ] **Step 0: Install dependencies and wire config**

```bash
pnpm add hono @hono/node-server better-sqlite3
pnpm add -D @types/better-sqlite3 esbuild
```

In `vite.config.ts`, change `test.include` to `['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts']`. Leave `coverage.include` as `src/**` only (server files are tested but not part of the 80% src gate).

TypeScript wiring: `tsconfig.json` is a solution file referencing `tsconfig.app.json` and `tsconfig.node.json`. Add `server/**/*.ts` to `tsconfig.node.json`'s `include` (it already compiles node-context TS like `vite.config.ts`) so `pnpm run build` typechecks the server. If `tsconfig.node.json` sets `noEmit: false` or emits, mirror how `vite.config.ts` is handled — the goal is typecheck coverage, not emit (esbuild does the emit in Task 3). Verify with `pnpm run build` at the end of this task.

- [ ] **Step 1: Write the failing test**

`server/db.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getUserData, openDb, putUserData } from './db';

function makeDb() {
  return openDb(':memory:');
}

describe('openDb', () => {
  it('should create the users table so a first read returns null instead of throwing', () => {
    const db = makeDb();
    expect(getUserData(db, 'cooper')).toBeNull();
  });
  it('should set busy_timeout to 5000ms', () => {
    const db = makeDb();
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
  });
});

describe('putUserData / getUserData', () => {
  it('should return the stored blob and updatedAt for an existing username', () => {
    const db = makeDb();
    putUserData(db, 'cooper', '{"schemaVersion":1,"tasks":[]}', '2026-08-11T00:00:00.000Z');
    expect(getUserData(db, 'cooper')).toEqual({
      data: '{"schemaVersion":1,"tasks":[]}',
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
  });
  it('should overwrite an existing row so the later write wins', () => {
    const db = makeDb();
    putUserData(db, 'cooper', '{"schemaVersion":1,"tasks":[]}', '2026-08-11T00:00:00.000Z');
    putUserData(db, 'cooper', '{"schemaVersion":1,"tasks":[{"id":"x"}]}', '2026-08-11T01:00:00.000Z');
    expect(getUserData(db, 'cooper')?.updatedAt).toBe('2026-08-11T01:00:00.000Z');
  });
  it('should keep data for different usernames isolated', () => {
    const db = makeDb();
    putUserData(db, 'cooper', '{"schemaVersion":1,"tasks":[]}', '2026-08-11T00:00:00.000Z');
    expect(getUserData(db, 'daisy')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run server/db.test.ts`
Expected: FAIL — cannot resolve `./db`.

- [ ] **Step 3: Implement `server/db.ts`**

```typescript
import Database from 'better-sqlite3';

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username   TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

export function getUserData(
  db: Database.Database,
  username: string,
): { data: string; updatedAt: string } | null {
  const row = db
    .prepare<[string], { data: string; updated_at: string }>(
      'SELECT data, updated_at FROM users WHERE username = ?',
    )
    .get(username);
  if (row === undefined) return null;
  return { data: row.data, updatedAt: row.updated_at };
}

export function putUserData(
  db: Database.Database,
  username: string,
  data: string,
  updatedAt: string,
): void {
  db.prepare(
    `INSERT INTO users (username, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(username, data, updatedAt);
}
```

- [ ] **Step 4: Run test to verify it passes, then typecheck**

Run: `pnpm exec vitest run server/db.test.ts && pnpm run build`
Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/db.test.ts package.json pnpm-lock.yaml vite.config.ts tsconfig.node.json .gitignore
git commit -m "feat(server): SQLite user-blob storage module"
```

---

### Task 3: Server HTTP app and entry point

**Files:**
- Create: `server/app.ts`, `server/app.test.ts`, `server/index.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `openDb`, `getUserData`, `putUserData` from `server/db.ts` (Task 2); `isAppData` from `../src/lib/validate` (Task 1).
- Produces:
  - `export function normalizeUsername(raw: string): string | null` — trim + lowercase; returns null unless it matches `/^[a-z0-9_-]{1,32}$/`. (Task 5's client-side `src/lib/username.ts` defines an identical function; they must agree.)
  - `export function createApp(db: Database.Database, now?: () => string): Hono` — routes `GET /api/users/:username/data` and `PUT /api/users/:username/data`. `now` defaults to `() => new Date().toISOString()`.
  - HTTP contract (Task 4's client consumes): GET → `200 {"data": <AppData>, "updatedAt": string}` | `404 {"error":"not_found"}` | `400 {"error":"bad_username"}`. PUT with `AppData` body → `200 {"updatedAt": string}` | `400 {"error":"bad_username"|"bad_data"}` | `413 {"error":"too_large"}`.
  - Body cap: 1,000,000 bytes.

- [ ] **Step 1: Write the failing test**

`server/app.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createApp, normalizeUsername } from './app';
import { openDb } from './db';

const VALID_BODY = { schemaVersion: 1, tasks: [] };

function makeApp() {
  return createApp(openDb(':memory:'), () => '2026-08-11T00:00:00.000Z');
}

function put(app: ReturnType<typeof makeApp>, username: string, body: unknown) {
  return app.request(`/api/users/${username}/data`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('normalizeUsername', () => {
  it('should lowercase and trim the input', () => {
    expect(normalizeUsername('  Cooper ')).toBe('cooper');
  });
  it('should return null for characters outside a-z 0-9 dash underscore', () => {
    expect(normalizeUsername('coo per')).toBeNull();
    expect(normalizeUsername('coöper')).toBeNull();
  });
  it('should return null for the empty string', () => {
    expect(normalizeUsername('  ')).toBeNull();
  });
  it('should return null for names longer than 32 characters', () => {
    expect(normalizeUsername('a'.repeat(33))).toBeNull();
  });
});

describe('GET /api/users/:username/data', () => {
  it('should return 404 with error not_found for a username that never saved', async () => {
    const res = await makeApp().request('/api/users/cooper/data');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
  it('should return 400 for an invalid username', async () => {
    const res = await makeApp().request('/api/users/no%20spaces/data');
    expect(res.status).toBe(400);
  });
  it('should return the stored data and updatedAt after a PUT', async () => {
    const app = makeApp();
    await put(app, 'cooper', VALID_BODY);
    const res = await app.request('/api/users/cooper/data');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: VALID_BODY,
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
  });
  it('should treat mixed-case URL usernames as their lowercase form', async () => {
    const app = makeApp();
    await put(app, 'cooper', VALID_BODY);
    const res = await app.request('/api/users/Cooper/data');
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/users/:username/data', () => {
  it('should return 200 with the server updatedAt for a valid AppData body', async () => {
    const res = await put(makeApp(), 'cooper', VALID_BODY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updatedAt: '2026-08-11T00:00:00.000Z' });
  });
  it('should return 400 with error bad_data for a body failing AppData validation', async () => {
    const res = await put(makeApp(), 'cooper', { schemaVersion: 2, tasks: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_data' });
  });
  it('should return 400 with error bad_data for a non-JSON body', async () => {
    const res = await makeApp().request('/api/users/cooper/data', {
      method: 'PUT',
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
  it('should return 413 for a body larger than one megabyte', async () => {
    const huge = {
      schemaVersion: 1,
      tasks: [],
      padding: 'x'.repeat(1_000_001),
    };
    const res = await put(makeApp(), 'cooper', huge);
    expect(res.status).toBe(413);
  });
  it('should overwrite the previous blob so the last write wins', async () => {
    const app = makeApp();
    await put(app, 'cooper', VALID_BODY);
    const second = {
      schemaVersion: 1,
      tasks: [
        {
          id: 't1', title: 'later write', status: 'open', dueDate: null, dueTime: null,
          list: null, priority: null, recurrence: null,
          createdAt: '2026-08-11T00:00:00.000Z', completedAt: null, order: 1,
        },
      ],
    };
    await put(app, 'cooper', second);
    const res = await app.request('/api/users/cooper/data');
    const body = (await res.json()) as { data: { tasks: Array<{ title: string }> } };
    expect(body.data.tasks[0].title).toBe('later write');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run server/app.test.ts`
Expected: FAIL — cannot resolve `./app`.

- [ ] **Step 3: Implement `server/app.ts`**

```typescript
import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { isAppData } from '../src/lib/validate';
import { getUserData, putUserData } from './db';

const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;
const MAX_BODY_BYTES = 1_000_000;

export function normalizeUsername(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return USERNAME_RE.test(name) ? name : null;
}

export function createApp(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Hono {
  const app = new Hono();

  app.get('/api/users/:username/data', (c) => {
    const username = normalizeUsername(decodeURIComponent(c.req.param('username')));
    if (username === null) return c.json({ error: 'bad_username' }, 400);
    const row = getUserData(db, username);
    if (row === null) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: JSON.parse(row.data) as unknown, updatedAt: row.updatedAt });
  });

  app.put('/api/users/:username/data', async (c) => {
    const username = normalizeUsername(decodeURIComponent(c.req.param('username')));
    if (username === null) return c.json({ error: 'bad_username' }, 400);
    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return c.json({ error: 'too_large' }, 413);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json({ error: 'bad_data' }, 400);
    }
    if (!isAppData(parsed)) return c.json({ error: 'bad_data' }, 400);
    const updatedAt = now();
    putUserData(db, username, JSON.stringify(parsed), updatedAt);
    return c.json({ updatedAt });
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run server/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `server/index.ts` and build scripts**

`server/index.ts`:

```typescript
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { openDb } from './db';

const dbPath = process.env.DB_PATH ?? './tmp/todo.db';
mkdirSync(dirname(dbPath), { recursive: true });
const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: createApp(openDb(dbPath)).fetch, port, hostname: '127.0.0.1' });
console.log(`todo-quantum api listening on ${port}, db at ${dbPath}`);
```

`package.json` scripts (add):

```json
"server:build": "esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist-server/index.cjs --external:better-sqlite3",
"server:start": "node dist-server/index.cjs",
"server:dev": "pnpm run server:build && node dist-server/index.cjs"
```

(The esbuild CJS bundle sidesteps the repo's extensionless-ESM imports under `"type": "module"`; `better-sqlite3` stays external for its native binding. `dist-server/index.cjs` loads as CommonJS regardless of the root `"type"` because of the `.cjs` extension. `hostname: '127.0.0.1'` — only Caddy talks to it.)

- [ ] **Step 6: Smoke-test the built server end-to-end**

```bash
pnpm run server:build
DB_PATH=./tmp/smoke.db node dist-server/index.cjs &
sleep 1
curl -s -X PUT localhost:3000/api/users/cooper/data \
  -H 'content-type: application/json' \
  -d '{"schemaVersion":1,"tasks":[]}'
curl -s localhost:3000/api/users/cooper/data
kill %1 && rm -f ./tmp/smoke.db*
```

Expected: PUT prints `{"updatedAt":"..."}"`, GET prints the stored blob.

- [ ] **Step 7: Full suite + typecheck, then commit**

Run: `pnpm exec vitest run && pnpm run build`
Expected: PASS / clean.

```bash
git add server/ package.json
git commit -m "feat(server): Hono API with GET/PUT user data endpoints"
```

---

### Task 4: Client remote API module (`src/lib/remote.ts`)

**Files:**
- Create: `src/lib/remote.ts`
- Create: `src/lib/remote.test.ts`

**Interfaces:**
- Consumes: HTTP contract from Task 3; `AppData` from `./types`; `isAppData` from `./validate`.
- Produces (Task 7 consumes):
  - `export type RemoteFetchResult = { status: 'found'; data: AppData; updatedAt: string } | { status: 'missing' } | { status: 'error' };`
  - `export type RemotePushResult = { ok: true; updatedAt: string } | { ok: false };`
  - `export function fetchRemote(username: string, fetchFn?: typeof fetch): Promise<RemoteFetchResult>`
  - `export function pushRemote(username: string, data: AppData, fetchFn?: typeof fetch): Promise<RemotePushResult>`
  - `fetchFn` defaults to the global `fetch` (bound to `globalThis`); tests inject a fake.

- [ ] **Step 1: Write the failing test**

`src/lib/remote.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { fetchRemote, pushRemote } from './remote';
import type { AppData } from './types';

const EMPTY: AppData = { schemaVersion: 1, tasks: [] };

function makeFetch(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
}

function makeFailingFetch(): typeof fetch {
  return () => Promise.reject(new TypeError('network down'));
}

describe('fetchRemote', () => {
  it("should return status found with the server's data and updatedAt on 200", async () => {
    const fetchFn = makeFetch(200, { data: EMPTY, updatedAt: '2026-08-11T00:00:00.000Z' });
    expect(await fetchRemote('cooper', fetchFn)).toEqual({
      status: 'found',
      data: EMPTY,
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
  });
  it('should return status missing on 404', async () => {
    expect(await fetchRemote('cooper', makeFetch(404, { error: 'not_found' }))).toEqual({
      status: 'missing',
    });
  });
  it('should return status error when the network request rejects', async () => {
    expect(await fetchRemote('cooper', makeFailingFetch())).toEqual({ status: 'error' });
  });
  it('should return status error when the 200 body fails AppData validation', async () => {
    const fetchFn = makeFetch(200, { data: { schemaVersion: 9 }, updatedAt: 'x' });
    expect(await fetchRemote('cooper', fetchFn)).toEqual({ status: 'error' });
  });
  it('should return status error on a 500 response', async () => {
    expect(await fetchRemote('cooper', makeFetch(500, {}))).toEqual({ status: 'error' });
  });
});

describe('pushRemote', () => {
  it('should PUT the blob to the username-scoped endpoint and return the server updatedAt', async () => {
    let captured: { url: string; method: string | undefined; body: unknown } | null = null;
    const fetchFn: typeof fetch = (input, init) => {
      captured = {
        url: String(input),
        method: init?.method,
        body: JSON.parse(String(init?.body)),
      };
      return Promise.resolve(
        new Response(JSON.stringify({ updatedAt: '2026-08-11T00:00:00.000Z' }), { status: 200 }),
      );
    };
    const result = await pushRemote('cooper', EMPTY, fetchFn);
    expect(result).toEqual({ ok: true, updatedAt: '2026-08-11T00:00:00.000Z' });
    expect(captured).toEqual({
      url: '/api/users/cooper/data',
      method: 'PUT',
      body: EMPTY,
    });
  });
  it('should return ok false when the network request rejects', async () => {
    expect(await pushRemote('cooper', EMPTY, makeFailingFetch())).toEqual({ ok: false });
  });
  it('should return ok false on a non-200 response', async () => {
    expect(await pushRemote('cooper', EMPTY, makeFetch(400, { error: 'bad_data' }))).toEqual({
      ok: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/remote.test.ts`
Expected: FAIL — cannot resolve `./remote`.

- [ ] **Step 3: Implement `src/lib/remote.ts`**

```typescript
import type { AppData } from './types';
import { isAppData } from './validate';

export type RemoteFetchResult =
  | { status: 'found'; data: AppData; updatedAt: string }
  | { status: 'missing' }
  | { status: 'error' };

export type RemotePushResult = { ok: true; updatedAt: string } | { ok: false };

function defaultFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}

export async function fetchRemote(
  username: string,
  fetchFn: typeof fetch = defaultFetch(),
): Promise<RemoteFetchResult> {
  try {
    const res = await fetchFn(`/api/users/${encodeURIComponent(username)}/data`);
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error' };
    const body = (await res.json()) as { data?: unknown; updatedAt?: unknown };
    if (!isAppData(body.data) || typeof body.updatedAt !== 'string') {
      return { status: 'error' };
    }
    return { status: 'found', data: body.data, updatedAt: body.updatedAt };
  } catch {
    return { status: 'error' };
  }
}

export async function pushRemote(
  username: string,
  data: AppData,
  fetchFn: typeof fetch = defaultFetch(),
): Promise<RemotePushResult> {
  try {
    const res = await fetchFn(`/api/users/${encodeURIComponent(username)}/data`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { updatedAt?: unknown };
    if (typeof body.updatedAt !== 'string') return { ok: false };
    return { ok: true, updatedAt: body.updatedAt };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes, typecheck, commit**

Run: `pnpm exec vitest run src/lib/remote.test.ts && pnpm run build`
Expected: PASS / clean.

```bash
git add src/lib/remote.ts src/lib/remote.test.ts
git commit -m "feat(client): remote fetch/push API module"
```

---

### Task 5: Username storage, per-user keys, and legacy migration (`src/lib/username.ts`)

**Files:**
- Create: `src/lib/username.ts`
- Create: `src/lib/username.test.ts`
- Modify: `src/lib/persistence.ts` (`load`/`save` gain an optional key parameter)

**Interfaces:**
- Consumes: `StorageLike` from `./types`; `STORAGE_KEY`, `load`, `save` from `./persistence`.
- Produces (Tasks 6–7 consume):
  - `export const USERNAME_KEY = 'todo-quantum.username';`
  - `export function normalizeUsername(raw: string): string | null` — same rules as the server's (Task 3): trim, lowercase, `/^[a-z0-9_-]{1,32}$/`.
  - `export function getStoredUsername(storage: StorageLike): string | null` — reads and re-validates; a corrupt value returns null.
  - `export function storeUsername(storage: StorageLike, username: string): void`
  - `export function clearUsername(storage: StorageLike): void`
  - `export function storageKeyFor(username: string): string` — returns `` `todo-quantum.v1.${username}` ``.
  - `export function syncKeyFor(username: string): string` — returns `` `todo-quantum.sync.${username}` `` (holds the last-synced server `updatedAt`).
  - `export function migrateLegacyData(storage: StorageLike, username: string): void` — if the legacy `todo-quantum.v1` key holds a value and the per-user key does not, copy it to the per-user key and remove the legacy key; all other cases are no-ops.
  - Modified persistence signatures: `load(storage, now?, key?: string)` and `save(storage, data, key?: string)` with `key` defaulting to `STORAGE_KEY` (existing callers/tests unaffected).

- [ ] **Step 1: Write the failing test**

`src/lib/username.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { memoryStorage } from './persistence';
import {
  USERNAME_KEY,
  clearUsername,
  getStoredUsername,
  migrateLegacyData,
  normalizeUsername,
  storageKeyFor,
  storeUsername,
  syncKeyFor,
} from './username';

function makeStorage() {
  return memoryStorage();
}

describe('normalizeUsername', () => {
  it('should lowercase and trim the input', () => {
    expect(normalizeUsername('  Cooper ')).toBe('cooper');
  });
  it('should return null for characters outside a-z 0-9 dash underscore', () => {
    expect(normalizeUsername('coo per')).toBeNull();
  });
  it('should return null for names longer than 32 characters', () => {
    expect(normalizeUsername('a'.repeat(33))).toBeNull();
  });
});

describe('stored username round-trip', () => {
  it('should return the stored username after storeUsername', () => {
    const storage = makeStorage();
    storeUsername(storage, 'cooper');
    expect(getStoredUsername(storage)).toBe('cooper');
  });
  it('should return null when nothing is stored', () => {
    expect(getStoredUsername(makeStorage())).toBeNull();
  });
  it('should return null when the stored value is not a valid username', () => {
    const storage = makeStorage();
    storage.setItem(USERNAME_KEY, 'not a name!!');
    expect(getStoredUsername(storage)).toBeNull();
  });
  it('should return null after clearUsername', () => {
    const storage = makeStorage();
    storeUsername(storage, 'cooper');
    clearUsername(storage);
    expect(getStoredUsername(storage)).toBeNull();
  });
});

describe('key derivation', () => {
  it('should derive the per-user data key todo-quantum.v1.<username>', () => {
    expect(storageKeyFor('cooper')).toBe('todo-quantum.v1.cooper');
  });
  it('should derive the per-user sync key todo-quantum.sync.<username>', () => {
    expect(syncKeyFor('cooper')).toBe('todo-quantum.sync.cooper');
  });
});

describe('migrateLegacyData', () => {
  it('should move the legacy todo-quantum.v1 blob to the per-user key', () => {
    const storage = makeStorage();
    storage.setItem('todo-quantum.v1', '{"schemaVersion":1,"tasks":[]}');
    migrateLegacyData(storage, 'cooper');
    expect(storage.getItem('todo-quantum.v1.cooper')).toBe('{"schemaVersion":1,"tasks":[]}');
    expect(storage.getItem('todo-quantum.v1')).toBeNull();
  });
  it('should leave an existing per-user blob untouched when both keys exist', () => {
    const storage = makeStorage();
    storage.setItem('todo-quantum.v1', 'legacy');
    storage.setItem('todo-quantum.v1.cooper', 'current');
    migrateLegacyData(storage, 'cooper');
    expect(storage.getItem('todo-quantum.v1.cooper')).toBe('current');
  });
  it('should do nothing when no legacy blob exists', () => {
    const storage = makeStorage();
    migrateLegacyData(storage, 'cooper');
    expect(storage.getItem('todo-quantum.v1.cooper')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/username.test.ts`
Expected: FAIL — cannot resolve `./username`.

- [ ] **Step 3: Implement `src/lib/username.ts`**

```typescript
import { STORAGE_KEY } from './persistence';
import type { StorageLike } from './types';

export const USERNAME_KEY = 'todo-quantum.username';

const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;

export function normalizeUsername(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return USERNAME_RE.test(name) ? name : null;
}

export function getStoredUsername(storage: StorageLike): string | null {
  const raw = storage.getItem(USERNAME_KEY);
  if (raw === null) return null;
  return normalizeUsername(raw);
}

export function storeUsername(storage: StorageLike, username: string): void {
  storage.setItem(USERNAME_KEY, username);
}

export function clearUsername(storage: StorageLike): void {
  storage.removeItem(USERNAME_KEY);
}

export function storageKeyFor(username: string): string {
  return `${STORAGE_KEY}.${username}`;
}

export function syncKeyFor(username: string): string {
  return `todo-quantum.sync.${username}`;
}

export function migrateLegacyData(storage: StorageLike, username: string): void {
  const legacy = storage.getItem(STORAGE_KEY);
  if (legacy === null) return;
  if (storage.getItem(storageKeyFor(username)) === null) {
    storage.setItem(storageKeyFor(username), legacy);
  }
  storage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Add the optional key parameter to `load`/`save` in `src/lib/persistence.ts`**

Change signatures only; behavior at the default key is untouched:

```typescript
export function load(storage: StorageLike, now: Date = new Date(), key: string = STORAGE_KEY): LoadResult {
```
Replace both `storage.getItem(STORAGE_KEY)` calls inside `load` with `storage.getItem(key)`.

```typescript
export function save(storage: StorageLike, data: AppData, key: string = STORAGE_KEY): SaveResult {
```
Replace `storage.setItem(STORAGE_KEY, serialized)` and `storage.getItem(STORAGE_KEY)` inside `save` with the `key` parameter.

Add two tests to `src/lib/username.test.ts` (they exercise the new parameter through the public API):

```typescript
import { load, save } from './persistence';
import type { AppData } from './types';

describe('per-user load/save keys', () => {
  it('should save under the provided key and load it back from the same key', () => {
    const storage = makeStorage();
    const data: AppData = { schemaVersion: 1, tasks: [] };
    save(storage, data, storageKeyFor('cooper'));
    expect(load(storage, new Date(), storageKeyFor('cooper')).data).toEqual(data);
  });
  it('should not see data saved under a different username key', () => {
    const storage = makeStorage();
    save(storage, { schemaVersion: 1, tasks: [] }, storageKeyFor('cooper'));
    expect(load(storage, new Date(), storageKeyFor('daisy')).data.tasks).toEqual([]);
  });
});
```

- [ ] **Step 5: Run full suite + typecheck, commit**

Run: `pnpm exec vitest run && pnpm run build`
Expected: PASS / clean (existing persistence tests prove default-key behavior unchanged).

```bash
git add src/lib/username.ts src/lib/username.test.ts src/lib/persistence.ts
git commit -m "feat(client): username storage, per-user data keys, legacy migration"
```

---

### Task 6: Username gate UI and app wiring

**Files:**
- Create: `src/components/UsernameGate.tsx`, `src/components/UsernameGate.css`, `src/components/UsernameGate.test.tsx`
- Modify: `src/App.tsx` (gate before `AppProvider`), `src/state/AppContext.tsx` (accept `username` prop, per-user storage key in context), `src/lib/commands.ts` (`user` command), `src/hooks/usePersistence.ts` (use per-user key for saves and external reloads)

**Interfaces:**
- Consumes: `normalizeUsername`, `getStoredUsername`, `storeUsername`, `clearUsername`, `migrateLegacyData`, `storageKeyFor` from `src/lib/username.ts` (Task 5); `load`/`save` key parameter (Task 5).
- Produces:
  - `UsernameGate` props: `{ onSubmit: (username: string) => void }`. Renders a form with a labeled text input and submit button; calls `onSubmit` with the normalized username; shows inline error copy `Use letters, numbers, - or _ (max 32)` for invalid input and does not call `onSubmit`.
  - `AppProvider` gains a required `username: string` prop. `AppContextValue` gains `username: string` and `storageKey: string` (the per-user key). `AppProvider` calls `migrateLegacyData(storage, username)` before the initial `load`, and loads with the per-user key.
  - `CommandContext` gains `switchUser: () => void`; a new command `{ id: 'user', label: 'user' }` invokes it. Its implementation (in `CommandBar`'s context construction — find where `CommandContext` is built) calls `clearUsername(storage)` then `window.location.reload()`.
  - `usePersistence` passes `storageKey` from context to every `save(...)` and `load(...)` call, and its `onStorage` handler compares `event.key` against `storageKey` instead of `STORAGE_KEY`.

- [ ] **Step 1: Read `DESIGN-SYSTEM.md` in full**

The gate is new UI. Use the exact token names for font, ink/paper colors, spacing, and focus treatment. Match the app's existing empty-state voice for the prompt copy (one quiet line, e.g. label "Who's at the desk?" with the input). Deviating from a token is a halt-and-propose event.

- [ ] **Step 2: Write the failing component test**

`src/components/UsernameGate.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UsernameGate } from './UsernameGate';

function makeGate() {
  const onSubmit = vi.fn();
  render(<UsernameGate onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('UsernameGate', () => {
  it('should submit the trimmed lowercase username when the form is submitted', async () => {
    const { onSubmit, user } = makeGate();
    await user.type(screen.getByRole('textbox'), '  Cooper ');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('cooper');
  });
  it('should show validation copy and not submit for a username with spaces', async () => {
    const { onSubmit, user } = makeGate();
    await user.type(screen.getByRole('textbox'), 'coo per');
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Use letters, numbers, - or _ (max 32)')).toBeInTheDocument();
  });
  it('should not submit an empty username', async () => {
    const { onSubmit, user } = makeGate();
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('should focus the username input on mount', () => {
    makeGate();
    expect(screen.getByRole('textbox')).toHaveFocus();
  });
  it('should associate the visible label with the input for screen readers', () => {
    makeGate();
    expect(screen.getByLabelText(/who/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/UsernameGate.test.tsx`
Expected: FAIL — cannot resolve `./UsernameGate`.

- [ ] **Step 4: Implement `UsernameGate.tsx` + CSS**

Functional shape (style per DESIGN-SYSTEM.md, centered single-column, masthead-adjacent typography):

```tsx
import { useEffect, useRef, useState } from 'react';
import './UsernameGate.css';
import { normalizeUsername } from '../lib/username';

export interface UsernameGateProps {
  onSubmit: (username: string) => void;
}

export function UsernameGate({ onSubmit }: UsernameGateProps) {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const username = normalizeUsername(value);
    if (username === null) {
      setInvalid(true);
      return;
    }
    onSubmit(username);
  }

  return (
    <main className="username-gate">
      <form onSubmit={handleSubmit}>
        <label htmlFor="username-input">Who's at the desk?</label>
        <input
          id="username-input"
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          autoComplete="username"
          spellCheck={false}
        />
        {invalid && <p role="alert">Use letters, numbers, - or _ (max 32)</p>}
        <button type="submit">Begin</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/UsernameGate.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the gate into `App.tsx` and `AppContext.tsx`**

`AppContext.tsx` changes:
- `AppProvider({ username, children }: { username: string; children: ReactNode })`.
- After `storageHandle` is created: `useMemo` that runs `migrateLegacyData(storageHandle.storage, username)` before `load` (fold it into the existing `loadResult` memo so ordering is guaranteed), and `load(storageHandle.storage, new Date(), storageKeyFor(username))`.
- Add `username` and `storageKey: storageKeyFor(username)` to the context value.

`App.tsx` changes — the default export currently wraps `Shell` in `AppProvider`. Replace with a small root component:

```tsx
function Root() {
  const storage = getLocalStorage() ?? memoryStorage();
  const [username, setUsername] = useState<string | null>(() => getStoredUsername(storage));
  if (username === null) {
    return (
      <UsernameGate
        onSubmit={(name) => {
          storeUsername(storage, name);
          setUsername(name);
        }}
      />
    );
  }
  return (
    <AppProvider username={username} key={username}>
      <Shell />
    </AppProvider>
  );
}
```

(Note: `AppProvider` acquires its own storage handle as today; the gate's handle is only for reading/writing the username. `key={username}` guarantees a full remount on user switch.)

`usePersistence.ts` changes: pull `storageKey` from `useApp()`; pass it to every `save(storageRef.current, ..., storageKey)` and `load(storageRef.current, new Date(), storageKey)` call; in `onStorage`, replace the `STORAGE_KEY` comparison with `storageKey`.

`commands.ts` changes: add `switchUser: () => void` to `CommandContext`; append `{ id: 'user', label: 'user', run: (ctx) => ctx.switchUser() }` to `COMMANDS`. Find where `CommandBar.tsx` builds the `CommandContext` object and supply `switchUser: () => { clearUsername(storage); window.location.reload(); }` using `storage` from `useApp()`.

- [ ] **Step 7: Update tests broken by the new `AppProvider` prop**

Run `pnpm exec vitest run` first to enumerate failures. Expected breakages: any test rendering `AppProvider` (e.g. `usePersistence.test.tsx`, view/component tests that mount the provider) now needs `username="testuser"` — plus seeding `todo-quantum.username` where a test renders the full `App`. Add the prop; where a test's storage fixture pre-loads data under `todo-quantum.v1`, either move it to `todo-quantum.v1.testuser` or rely on `migrateLegacyData` (moving it is clearer). `commands.test.ts` needs `switchUser: vi.fn()` in its context fixtures and a test: "should include a user command that invokes switchUser".

- [ ] **Step 8: Full suite + typecheck, commit**

Run: `pnpm exec vitest run && pnpm run build`
Expected: PASS / clean.

```bash
git add src/components/UsernameGate.* src/App.tsx src/state/AppContext.tsx src/lib/commands.ts src/lib/commands.test.ts src/hooks/usePersistence.ts src/hooks/usePersistence.test.tsx
git commit -m "feat(client): username gate, per-user storage wiring, :user command"
```

(Include any other test files updated in Step 7.)

---

### Task 7: Write-through remote sync in `usePersistence`

**Files:**
- Modify: `src/hooks/usePersistence.ts`, `src/hooks/usePersistence.test.tsx`, `src/components/StorageBanner.tsx`, `src/App.tsx` (banner already renders from `saveFailed`; only types change)

**Interfaces:**
- Consumes: `fetchRemote`, `pushRemote` from `src/lib/remote.ts` (Task 4); `syncKeyFor` from `src/lib/username.ts` (Task 5); `username`/`storageKey` from context (Task 6); `externalReload` action (exists).
- Produces:
  - `SaveFailure` type becomes `false | 'quota' | 'unavailable' | 'offline'`.
  - `usePersistence` gains an optional second parameter `fetchOverride?: typeof fetch` (after the existing `storageOverride`) so tests inject a fake fetch.
  - `StorageBannerProps['reason']` widens to `'quota' | 'unavailable' | 'offline'` with copy: `"Offline — changes are saved on this device and will sync when the connection returns."`
  - Sync protocol (behavior contract):
    1. On mount: `fetchRemote(username)`. If `found` and `updatedAt` differs from the value stored under `syncKeyFor(username)`: dispatch `externalReload` with the server data, save it locally, store the new `updatedAt`, toast `List updated from server`. If `found` and `updatedAt` equals the stored value: no-op. If `missing` and the local list has tasks: `pushRemote` (first-sync upload; on success store `updatedAt`). If `missing` and local is empty: no-op. If `error`: set `saveFailed('offline')`.
    2. On every successful local flush: `pushRemote(username, data)`. Success stores `updatedAt` under the sync key and clears an `'offline'` failure. Failure sets `saveFailed('offline')` and schedules a retry through the existing `SAVE_RETRY_MS` timer (the pending payload is retained exactly as the quota path does).
    3. Local storage failures (`quota`/`unavailable`) take precedence over `'offline'` in `saveFailed`.

- [ ] **Step 1: Write the failing tests**

Add to `src/hooks/usePersistence.test.tsx`, following its existing harness style (it already renders the hook inside `AppProvider` with a storage override — reuse that; add a `fetchOverride`). New tests, each description explicit:

```typescript
describe('remote sync', () => {
  it('should PUT the saved blob to /api/users/<username>/data after a local save', async () => { /* type a task, advance debounce timers, assert fake fetch got PUT with the saved AppData */ });
  it('should set saveFailed to offline when the PUT rejects', async () => { /* fake fetch rejects; flush; expect saveFailed === 'offline' */ });
  it('should clear the offline failure once a retried PUT succeeds', async () => { /* fail once, then succeed on retry timer; expect saveFailed === false */ });
  it('should reload state from the server when the server updatedAt differs from the last-synced value', async () => { /* fake fetch GET returns found with 1 task; expect task rendered and toast "List updated from server" */ });
  it('should not reload state when the server updatedAt matches the last-synced value', async () => { /* pre-store syncKey value equal to server updatedAt; expect no externalReload */ });
  it('should push local data up when the server has none for a fresh username', async () => { /* local storage seeded with 1 task, GET returns 404; expect PUT with that task */ });
  it('should keep quota precedence over offline in saveFailed', async () => { /* storage that throws quota + failing fetch; expect 'quota' */ });
});
```

Write these as real tests (the existing file shows the harness pattern: fake timers, `storageOverride`, provider wrapper). The stubs above name the required behaviors; each must assert concretely as sketched in its comment.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/hooks/usePersistence.test.tsx`
Expected: new tests FAIL (no sync layer yet); pre-existing tests still pass.

- [ ] **Step 3: Implement the sync layer in `usePersistence.ts`**

Implementation guide (keep the existing structure; extend, don't rewrite):
- `usePersistence(storageOverride?: StorageLike, fetchOverride?: typeof fetch)`.
- Keep a `fetchRef` mirroring `storageRef`.
- Extend `flush()`: after a successful local `save`, call an async `pushCurrent(data)` helper: `pushRemote(username, data, fetchRef.current)`; on `ok` → `storageRef.current.setItem(syncKeyFor(username), result.updatedAt)` and `setSaveFailed((prev) => (prev === 'offline' ? false : prev))`; on failure → `setSaveFailed((prev) => (prev === false ? 'offline' : prev))` and schedule the retry timer with the payload retained (mirror the quota path; the retry re-runs `flush`, whose local save is a cheap no-op rewrite, then re-pushes).
- Mount effect: run protocol step 1 exactly as specified in Interfaces. Guard with a `useRef` so StrictMode double-invoke doesn't double-fetch (`const syncedOnce = useRef(false)`).
- On `externalReload` from the server: also `save(storage, serverData, storageKey)` so the local cache matches.
- `'offline'` must never overwrite `'quota'`/`'unavailable'` (functional `setSaveFailed` updates as sketched above handle this).

- [ ] **Step 4: Widen `StorageBanner`**

Add to `COPY`: `offline: 'Offline — changes are saved on this device and will sync when the connection returns.'` and widen the `reason` prop type. Add a `StorageBanner` test asserting the offline copy renders for `reason="offline"`.

- [ ] **Step 5: Run the full unit suite + typecheck, commit**

Run: `pnpm exec vitest run && pnpm run build`
Expected: PASS / clean.

```bash
git add src/hooks/usePersistence.ts src/hooks/usePersistence.test.tsx src/components/StorageBanner.tsx src/components/StorageBanner.test.tsx src/App.tsx
git commit -m "feat(client): write-through remote sync with offline retry"
```

---

### Task 8: Dev proxy, Dockerfile, Caddyfile, start script

**Files:**
- Modify: `vite.config.ts` (dev proxy), `Dockerfile`, `Caddyfile`
- Create: `start.sh`

**Interfaces:**
- Consumes: `pnpm run server:build` and `dist-server/index.cjs` (Task 3).
- Produces: a container where Caddy serves the SPA on `$PORT` and proxies `/api/*` to the Node API on 127.0.0.1:3000, with the SQLite file on `/data`.

- [ ] **Step 1: Vite dev proxy**

In `vite.config.ts` `server` block, add:

```typescript
proxy: {
  '/api': 'http://localhost:3000',
},
```

(Local dev flow: `pnpm run server:dev` in one terminal, `pnpm run dev` in another.)

- [ ] **Step 2: Caddyfile — API route**

Add ABOVE the `handle /assets/*` block (Caddy `handle` blocks are mutually exclusive; order among them doesn't matter for distinct prefixes, but keep it first for readability):

```caddyfile
	handle /api/* {
		reverse_proxy 127.0.0.1:3000
	}
```

Do not touch the existing header/caching directives.

- [ ] **Step 3: Dockerfile — build server bundle, final image with node + caddy**

In the build stage, after `RUN pnpm run build`, add `RUN pnpm run server:build`.

`better-sqlite3` is external to the bundle and needs its native binding plus its runtime dependency subtree, so add a dedicated prod-deps stage:

```dockerfile
FROM node:26-alpine AS server-deps
WORKDIR /app
RUN npm install -g corepack@0.35.0
COPY package.json pnpm-lock.yaml ./
RUN corepack install
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile --prod
```

Replace the final stage:

```dockerfile
FROM node:26-alpine
RUN apk add --no-cache caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY --from=build /app/dist-server /app/dist-server
COPY --from=server-deps /app/node_modules /app/node_modules
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
```

Note `pnpm install --prod` in the server-deps stage brings only runtime deps (`hono`, `@hono/node-server`, `better-sqlite3` with its compiled binding — alpine needs build tools if no prebuilt musl binary exists; better-sqlite3 ships prebuilds for common platforms, but alpine/musl is NOT covered by prebuilds, so the stage must compile: add `RUN apk add --no-cache python3 make g++` before `pnpm install` in the server-deps stage).

- [ ] **Step 4: Create `start.sh`**

```bash
#!/bin/sh
set -e
DB_PATH="${DB_PATH:-/data/todo.db}" node /app/dist-server/index.cjs &
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
```

- [ ] **Step 5: Build and smoke-test the container locally**

```bash
docker build -t todo-quantum-test .
docker run --rm -d -p 8080:8080 -e PORT=8080 -v todo-quantum-data:/data --name tq todo-quantum-test
sleep 2
curl -s localhost:8080/ | head -c 200
curl -s -X PUT localhost:8080/api/users/cooper/data -H 'content-type: application/json' -d '{"schemaVersion":1,"tasks":[]}'
curl -s localhost:8080/api/users/cooper/data
docker rm -f tq
```

Expected: HTML shell from `/`, `{"updatedAt":...}` from PUT, stored blob from GET. If Docker isn't running locally, note it and verify on Railway after deploy instead — but say so explicitly; do not claim the smoke test passed.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts Dockerfile Caddyfile start.sh
git commit -m "feat(deploy): API sidecar behind Caddy, SQLite volume path"
```

---

### Task 9: E2E and visual-gate updates for the username gate

Existing Playwright specs load `/` expecting the todo UI; they will now hit the gate. Seed the username in shared setup, and add gate coverage.

**Files:**
- Modify: `playwright.config.ts` or `e2e/*` shared fixtures (inspect `e2e/` first — seed wherever the specs get their page), `verification/visual.spec.ts`
- Create: `e2e/username-gate.spec.ts`

**Interfaces:**
- Consumes: `todo-quantum.username` localStorage key (Task 5); `UsernameGate` copy (Task 6).
- Produces: green `pnpm exec playwright test e2e/` and a passing visual gate including a new `username-gate` baseline.

- [ ] **Step 1: Seed the username for existing specs**

Inspect `e2e/` and `verification/visual.spec.ts` for how pages are created. Add an `addInitScript` in the shared fixture/beforeEach (or `test.use({ storageState })` if that pattern exists):

```typescript
await page.addInitScript(() => {
  window.localStorage.setItem('todo-quantum.username', 'e2e');
});
```

Any spec that seeds task data into `todo-quantum.v1` must switch to `todo-quantum.v1.e2e`.

Note: with no API server running during e2e, the app must still work — the sync layer treats fetch failure as `'offline'` and the offline banner may appear in screenshots. Decide explicitly: either run the API during e2e (add a `webServer` entry to `playwright.config.ts` launching `pnpm run server:dev` with a throwaway `DB_PATH`), or assert the banner as part of baselines. Running the API is the honest option — do that.

- [ ] **Step 2: Write `e2e/username-gate.spec.ts`**

```typescript
import { expect, test } from '@playwright/test';

test.describe('username gate', () => {
  test('should ask for a username on first visit and open the app after submit', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel(/who/i)).toBeVisible();
    await page.getByLabel(/who/i).fill('cooper');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
  test('should remember the username across a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/who/i).fill('cooper');
    await page.keyboard.press('Enter');
    await page.reload();
    await expect(page.getByLabel(/who/i)).not.toBeVisible();
  });
});
```

(This spec must NOT get the seeded username — scope the seeding fixture so this file opts out, or clear the key at the top of each test before `goto`.)

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm exec playwright test e2e/`
Expected: PASS, all specs.

- [ ] **Step 4: Visual gate (Pixel Law)**

Add the gate screen to `verification/visual.spec.ts` (a state with no stored username). Generate the baseline, **open and look at the screenshot**, confirm it matches `DESIGN-SYSTEM.md` (fonts from §2, token colors, focus treatment), then bless it. Run:

Run: `bash verification/run-visual-gate.sh /`
Expected: visual regression PASS, axe 0 violations at every breakpoint, Lighthouse ≥ thresholds.

- [ ] **Step 5: Commit**

```bash
git add e2e/ verification/ playwright.config.ts
git commit -m "test(e2e): username gate coverage; seed username for existing specs"
```

---

### Task 10: Deploy to Railway and migrate cooper's local todos

Manual/operational task — run each step and paste real output before checking it off.

**Files:** none (operations only).

- [ ] **Step 1: Attach the Railway volume**

Via Railway dashboard or CLI (`railway volume add --mount-path /data` on the service). Confirm the volume shows mount path `/data`.

- [ ] **Step 2: Merge/push per user instruction and deploy**

Push `feat/sqlite-persistence` and open a PR, or merge per Cooper's instruction at the time (do not push without being asked — user's git rules). Railway builds from the Dockerfile on the tracked branch.

- [ ] **Step 3: Verify the API in production**

```bash
curl -s https://<prod-domain>/api/users/smoketest/data
```

Expected: `{"error":"not_found"}` with HTTP 404 (proves Caddy → Node → SQLite path works). `<prod-domain>` is the service's Railway domain — read it from the Railway dashboard.

- [ ] **Step 4: Extract cooper's local blob**

With the dev server running (`pnpm run dev`), open `http://localhost:5273` in the browser, then in devtools console:

```javascript
copy(localStorage.getItem('todo-quantum.v1') ?? localStorage.getItem('todo-quantum.v1.cooper'))
```

(First expression if the legacy key still exists; per-user key if the app already migrated it.) Paste the JSON into `/private/tmp/.../scratchpad/cooper-todos.json` (scratchpad dir). Alternatively use browser automation to read the key.

- [ ] **Step 5: Push the blob to production**

```bash
curl -s -X PUT "https://<prod-domain>/api/users/cooper/data" \
  -H 'content-type: application/json' \
  --data-binary @cooper-todos.json
```

Expected: `{"updatedAt":"..."}`.

- [ ] **Step 6: Verify round-trip**

```bash
curl -s "https://<prod-domain>/api/users/cooper/data" | head -c 300
```

Expected: the blob back. Then visit production, enter username `cooper`, and confirm the todos render.

---

## Execution order & dependencies

Tasks 1 → 2 → 3 are sequential (server stack). Task 4 depends on 3's contract; 5 is independent of 2–4; 6 depends on 5; 7 depends on 4+6; 8 depends on 3; 9 depends on 6+7+8; 10 is last. Practical order: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.
