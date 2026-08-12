import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { isAppData, normalizeUsername } from '../src/lib/validate';
import { getUserData, putUserData } from './db';

const MAX_BODY_BYTES = 1_000_000;

export { normalizeUsername };

export function createApp(
  db: Database.Database,
  now: () => string = () => new Date().toISOString(),
): Hono {
  const app = new Hono();

  app.get('/api/users/:username/data', (c) => {
    const username = normalizeUsername(c.req.param('username'));
    if (username === null) return c.json({ error: 'bad_username' }, 400);
    const row = getUserData(db, username);
    if (row === null) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: JSON.parse(row.data) as unknown, updatedAt: row.updatedAt });
  });

  app.put('/api/users/:username/data', async (c) => {
    const username = normalizeUsername(c.req.param('username'));
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
