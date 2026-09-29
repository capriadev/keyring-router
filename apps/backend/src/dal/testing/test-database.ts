import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type KrDatabase } from '../client.js';
import { runMigrations } from '../migrate.js';

export interface TestDatabase {
  readonly db: KrDatabase;
  readonly path: string;
  dispose(): void;
}

/**
 * Migrated SQLite file inside a private temp folder. Never the gateway database, so a test can
 * rewrite derived rows freely.
 */
export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'keyring-router-test-'));
  const path = join(directory, 'test.db');

  runMigrations(path);

  const db = createDatabase(path);

  return {
    db,
    path,
    dispose(): void {
      db.$client.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
