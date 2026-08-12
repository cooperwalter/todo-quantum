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
