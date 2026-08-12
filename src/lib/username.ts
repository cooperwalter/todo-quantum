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
