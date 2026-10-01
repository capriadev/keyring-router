import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createDatabase, type KrDatabase } from './client.js';
import { runMigrations } from './migrate.js';

function tableNames(db: KrDatabase): string[] {
  return db.$client
    .prepare("select name from sqlite_master where type = 'table' order by name")
    .all()
    .map((row) => (row as { name: string }).name);
}

function appliedMigrations(db: KrDatabase): number {
  const row = db.$client.prepare('select count(*) as applied from __drizzle_migrations').get();
  return (row as { applied: number }).applied;
}

describe('runMigrations', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'keyring-router-migrate-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates the schema on a fresh database', () => {
    const path = join(directory, 'fresh.db');
    const empty = createDatabase(path);

    assert.deepEqual(tableNames(empty), []);
    empty.$client.close();

    runMigrations(path);

    const migrated = createDatabase(path);

    assert.deepEqual(tableNames(migrated), [
      '__drizzle_migrations',
      'catalog_models',
      'credential_lockouts',
      'credentials',
      'install_keys',
      'policies',
      'quota_usage',
      'routing_state',
    ]);
    migrated.$client.close();
  });

  it('creates the routing tables with the columns their rules read', () => {
    const path = join(directory, 'routing.db');

    runMigrations(path);

    const migrated = createDatabase(path);
    const columns = (table: string): string[] =>
      migrated.$client
        .prepare(`pragma table_info(${table})`)
        .all()
        .map((row) => (row as { name: string }).name);

    assert.deepEqual(columns('credential_lockouts'), [
      'credential_id',
      'consecutive_failures',
      'locked_until',
      'updated_at',
    ]);
    assert.deepEqual(columns('quota_usage'), [
      'credential_id',
      'remaining_requests',
      'remaining_tokens',
      'reset_at',
      'observed_at',
    ]);
    assert.deepEqual(columns('routing_state'), [
      'credential_id',
      'last_outcome',
      'last_reason',
      'updated_at',
    ]);
    migrated.$client.close();
  });

  it('is a no-op on a second run', () => {
    const path = join(directory, 'twice.db');

    runMigrations(path);
    runMigrations(path);

    const migrated = createDatabase(path);

    assert.equal(appliedMigrations(migrated), 3);
    migrated.$client.close();
  });
});
