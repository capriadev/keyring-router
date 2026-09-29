import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { SALT_BYTES } from '../../config/secrets.env.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { CREDENTIAL_SECRET_SALT_ID, InstallKeysRepository } from './install-keys.repository.js';

describe('InstallKeysRepository', () => {
  let database: TestDatabase;
  let repository: InstallKeysRepository;

  beforeEach(() => {
    database = createTestDatabase();
    repository = new InstallKeysRepository(database.db);
  });

  afterEach(() => {
    database.dispose();
  });

  it('creates the salt of an installation on first use', () => {
    const salt = repository.readOrCreate(CREDENTIAL_SECRET_SALT_ID);

    assert.equal(Buffer.from(salt, 'base64').length, SALT_BYTES);
  });

  it('returns the same salt on every later read', () => {
    const first = repository.readOrCreate(CREDENTIAL_SECRET_SALT_ID);
    const second = repository.readOrCreate(CREDENTIAL_SECRET_SALT_ID);

    assert.equal(second, first);
    assert.equal(new InstallKeysRepository(database.db).readOrCreate(CREDENTIAL_SECRET_SALT_ID), first);
  });

  it('keeps one row per key and one salt per database', () => {
    repository.readOrCreate(CREDENTIAL_SECRET_SALT_ID);
    repository.readOrCreate(CREDENTIAL_SECRET_SALT_ID);
    repository.readOrCreate('another-key');

    const rows = database.db.$client.prepare('select count(*) as total from install_keys').get() as {
      total: number;
    };

    assert.equal(rows.total, 2);
  });
});
