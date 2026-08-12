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
