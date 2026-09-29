import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export const DATABASE = Symbol('DATABASE');

/** Opens (and creates when missing) the SQLite file the gateway runs on. */
export function createDatabase(dbPath: string) {
  const absolutePath = resolve(dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const sqlite = new Database(absolutePath);
  // Without this pragma SQLite ignores the catalog cascade and the policies reference.
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite);
}

export type KrDatabase = ReturnType<typeof createDatabase>;

