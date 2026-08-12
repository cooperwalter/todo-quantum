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
