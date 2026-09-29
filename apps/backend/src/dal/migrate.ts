import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MIGRATIONS_DIR } from '../config/paths.js';
import { createDatabase } from './client.js';

/**
 * The only apply path for schema changes. Runs the reviewed SQL of `apps/backend/drizzle` and is a
 * no-op when the journal is already up to date.
 */
export function runMigrations(dbPath: string): void {
  const db = createDatabase(dbPath);

  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    // The migrator is a one-shot process: leaving the handle open would lock the file on Windows.
    db.$client.close();
  }
}
