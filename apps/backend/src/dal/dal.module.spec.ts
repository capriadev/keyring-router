import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { BACKEND_ROOT } from '../config/paths.js';
import { SECRET_KEY_SOURCE, type SecretKeySource } from '../config/secret-key-source.js';
import { PEPPER_VARIABLE } from '../config/secrets.env.js';
import { createDatabase } from './client.js';
import { DalModule } from './dal.module.js';
import { runMigrations } from './migrate.js';
import { TEST_PEPPER } from './testing/secret-fixtures.js';

/**
 * The boot guard. A database that holds encrypted secrets cannot be served without the pepper that
 * opens them, so the gateway refuses to start instead of failing on every credential later.
 */
describe('DalModule boot', () => {
  let directory: string;
  let path: string;
  const before: Record<string, string | undefined> = {};

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'keyring-router-boot-'));
    path = join(directory, 'boot.db');
    before.KR_DB_PATH = process.env.KR_DB_PATH;
    before[PEPPER_VARIABLE] = process.env[PEPPER_VARIABLE];
    delete process.env[PEPPER_VARIABLE];
    process.env.KR_DB_PATH = path;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  function migrate(): void {
    runMigrations(path);
  }

  /** One credential carrying an encrypted secret, written without needing a key. */
  function storeSecret(): void {
    migrate();

    const db = createDatabase(path);

    db.$client
      .prepare(
        "insert into credentials (id, namespace, provider_id, base_url, auth_kind, secret_ciphertext, secret_iv, secret_tag, secret_version, secret_hint, created_at) values ('cred-1', 'cloud', 'ollama', 'https://api.example.test', 'api_key', 'ciphertext', 'iv', 'tag', 1, 'hint', 1)",
      )
      .run();
    db.$client.close();
  }

  async function boot(): Promise<INestApplicationContext> {
    // `abortOnError: false` keeps a factory failure inside the promise: without it Nest aborts the
    // process and the caller never sees the error.
    return NestFactory.createApplicationContext(DalModule, { abortOnError: false, logger: false });
  }

  it('starts without a pepper when the database holds no secret', async () => {
    migrate();

    const context = await boot();
    const source = context.get<SecretKeySource>(SECRET_KEY_SOURCE);

    assert.equal(source.hasPepper, false);
    assert.equal(source.key(), null);

    await context.close();
  });

  it('starts with a pepper and derives the key of the installation', async () => {
    storeSecret();
    process.env[PEPPER_VARIABLE] = TEST_PEPPER;

    const context = await boot();
    const source = context.get<SecretKeySource>(SECRET_KEY_SOURCE);

    assert.equal(source.hasPepper, true);
    assert.equal(source.key()?.length, 32);

    await context.close();
  });

  it('refuses to start when a secret exists and the pepper is missing', () => {
    storeSecret();

    // The real bootstrap path, in its own process: it is what an operator sees when they forget it.
    const result = spawnSync(process.execPath, ['--import', 'tsx', join(BACKEND_ROOT, 'src', 'dal', 'testing', 'boot-gateway.ts')], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, KR_DB_PATH: path },
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /KR_SECRET_PEPPER is missing/);
    assert.match(result.stderr, /1 encrypted credential secret/);
    assert.equal(result.stderr.includes('ciphertext'), false);
  });
});
