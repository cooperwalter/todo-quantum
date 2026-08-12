import { describe, expect, it } from 'vitest';
import { load, save, memoryStorage } from './persistence';
import type { AppData } from './types';
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
