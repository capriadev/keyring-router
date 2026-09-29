import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MIGRATIONS_DIR } from '../config/paths.js';
import { createDatabase, type KrDatabase } from './client.js';
import { runMigrations } from './migrate.js';

/** The SQL every migration file adds up to, read in full before anything runs it. */
function readMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }));
}

function statementsOf(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

function columns(db: KrDatabase, table: string): string[] {
  return db.$client
    .prepare(`pragma table_info(${table})`)
    .all()
    .map((row) => (row as { name: string }).name);
}

/**
 * The schema update of the credential secrets has to be additive: a database created by the first
 * slice keeps its credentials, catalog rows and policies while gaining the new columns.
 */
describe('the credential secrets migration', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'keyring-router-additive-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('never drops, renames or rebuilds anything', () => {
    const statements = readMigrations().flatMap((migration) => statementsOf(migration.sql));

    assert.equal(statements.length > 0, true);

    for (const statement of statements) {
      assert.match(statement, /^(CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX|ALTER TABLE) /);
      assert.equal(statement.includes('DROP'), false);
      assert.equal(statement.includes('RENAME'), false);
      assert.equal(statement.includes('__new_'), false);
    }
  });

  it('adds the five secret columns and the install_keys table, and nothing else', () => {
    const file = readMigrations().find((migration) => migration.name.startsWith('0001'));
    const sql = file?.sql ?? '';

    assert.deepEqual(sql.match(/ADD `(\w+)`/g), [
      'ADD `secret_ciphertext`',
      'ADD `secret_iv`',
      'ADD `secret_tag`',
      'ADD `secret_version`',
      'ADD `secret_hint`',
    ]);
    assert.equal(sql.includes('CREATE TABLE `install_keys`'), true);
    assert.equal(sql.includes('DROP'), false);
  });

  it('upgrades a populated first slice database without losing a row', () => {
    const path = join(directory, 'upgrade.db');
    const firstSlice = join(directory, 'first-slice');

    mkdirSync(join(firstSlice, 'meta'), { recursive: true });

    const current = readMigrations();
    const files = readdirSync(MIGRATIONS_DIR);
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as {
      entries: { idx: number }[];
    };

    // A folder holding only the first migration: this is the database of spec 001.
    writeFileSync(join(firstSlice, current[0]?.name ?? ''), current[0]?.sql ?? '');
    writeFileSync(
      join(firstSlice, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx === 0) }),
    );

    assert.deepEqual(
      files.filter((name) => name.startsWith('0000')).length,
      1,
    );

    const before = createDatabase(path);
    migrate(before, { migrationsFolder: firstSlice });
    assert.deepEqual(columns(before, 'credentials'), [
      'id',
      'namespace',
      'provider_id',
      'base_url',
      'auth_kind',
      'last_validated_at',
      'last_refresh_at',
      'last_refresh_error',
      'created_at',
    ]);

    before.$client
      .prepare(
        "insert into credentials (id, namespace, provider_id, base_url, auth_kind, created_at) values ('cred-1', 'local', 'ollama', 'http://127.0.0.1:11434', 'none', 1)",
      )
      .run();
    before.$client
      .prepare(
        "insert into catalog_models (id, credential_id, provider_model_id, display_name, discovered_at) values ('model-1', 'cred-1', 'qwen2.5:7b', 'qwen2.5:7b', 2)",
      )
      .run();
    before.$client
      .prepare(
        "insert into policies (id, credential_id, pattern, effect, created_at) values ('policy-1', 'cred-1', 'local/*', 'allow', 3)",
      )
      .run();
    before.$client.close();

    runMigrations(path);

    const after = createDatabase(path);

    assert.deepEqual(columns(after, 'credentials').slice(-5), [
      'secret_ciphertext',
      'secret_iv',
      'secret_tag',
      'secret_version',
      'secret_hint',
    ]);
    assert.deepEqual(columns(after, 'install_keys'), ['id', 'value', 'created_at']);
    assert.deepEqual(after.$client.prepare('select id, namespace, secret_ciphertext from credentials').all(), [
      { id: 'cred-1', namespace: 'local', secret_ciphertext: null },
    ]);
    assert.equal(
      (after.$client.prepare('select count(*) as total from catalog_models').get() as { total: number }).total,
      1,
    );
    assert.equal(
      (after.$client.prepare('select count(*) as total from policies').get() as { total: number }).total,
      1,
    );
    after.$client.close();
  });
});
