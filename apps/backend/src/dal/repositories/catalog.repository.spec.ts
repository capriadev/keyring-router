import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Credential } from '../../types/credential.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { CatalogRepository, type CatalogModelInput } from './catalog.repository.js';
import { CredentialsRepository } from './credentials.repository.js';

function buildCredential(id: string, namespace: string): Credential {
  return {
    id,
    namespace,
    providerId: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    authKind: 'none',
    lastValidatedAt: null,
    lastRefreshAt: null,
    lastRefreshError: null,
    createdAt: 1,
  };
}

function buildModel(providerModelId: string, overrides: Partial<CatalogModelInput> = {}): CatalogModelInput {
  return {
    providerModelId,
    displayName: providerModelId,
    sizeBytes: null,
    family: null,
    providerModifiedAt: null,
    discoveredAt: 10,
    ...overrides,
  };
}

describe('CatalogRepository', () => {
  let database: TestDatabase;
  let catalog: CatalogRepository;
  let credentials: CredentialsRepository;

  beforeEach(() => {
    database = createTestDatabase();
    catalog = new CatalogRepository(database.db);
    credentials = new CredentialsRepository(database.db);
    credentials.insert(buildCredential('credential-1', 'local'));
    credentials.insert(buildCredential('credential-2', 'work'));
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores discovered models with the id of the data model', () => {
    catalog.replaceForCredential('credential-1', [buildModel('qwen2.5:7b', { sizeBytes: 4096, family: 'qwen2' })]);

    const rows = catalog.listByCredential('credential-1');

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, 'credential-1:qwen2.5:7b');
    assert.equal(rows[0]?.credentialId, 'credential-1');
    assert.equal(rows[0]?.sizeBytes, 4096);
    assert.equal(rows[0]?.family, 'qwen2');
  });

  it('replaces the derived rows of one credential and drops the stale ones', () => {
    catalog.replaceForCredential('credential-1', [buildModel('one'), buildModel('two')]);
    catalog.replaceForCredential('credential-1', [buildModel('two')]);

    assert.deepEqual(
      catalog.listByCredential('credential-1').map((row) => row.providerModelId),
      ['two'],
    );
  });

  it('never touches the rows of another credential', () => {
    catalog.replaceForCredential('credential-1', [buildModel('one')]);
    catalog.replaceForCredential('credential-2', [buildModel('two')]);
    catalog.replaceForCredential('credential-1', []);

    assert.deepEqual(catalog.listByCredential('credential-1'), []);
    assert.deepEqual(
      catalog.listByCredential('credential-2').map((row) => row.providerModelId),
      ['two'],
    );
  });

  it('refuses the same provider model twice inside one credential', () => {
    assert.throws(() => catalog.replaceForCredential('credential-1', [buildModel('one'), buildModel('one')]));
  });

  it('lists every credential in a stable order', () => {
    catalog.replaceForCredential('credential-2', [buildModel('beta')]);
    catalog.replaceForCredential('credential-1', [buildModel('alpha')]);

    assert.deepEqual(
      catalog.list().map((row) => row.id),
      ['credential-1:alpha', 'credential-2:beta'],
    );
  });
});
