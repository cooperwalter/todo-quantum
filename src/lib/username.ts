import { STORAGE_KEY } from './persistence';
import { normalizeUsername } from './validate';
import type { StorageLike } from './types';

export const USERNAME_KEY = 'todo-quantum.username';

export { normalizeUsername };

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

// Set while a push is outstanding and cleared once it lands, so a tab closed
// mid-upload still knows on its next mount that local is the newer copy.
export function dirtyKeyFor(username: string): string {
  return `todo-quantum.dirty.${username}`;
}

export function migrateLegacyData(storage: StorageLike, username: string): void {
  const legacy = storage.getItem(STORAGE_KEY);
  if (legacy === null) return;
  if (storage.getItem(storageKeyFor(username)) === null) {
    storage.setItem(storageKeyFor(username), legacy);
  }
  storage.removeItem(STORAGE_KEY);
}
