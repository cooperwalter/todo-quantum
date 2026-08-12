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
