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
