import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Credential } from '../../types/credential.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { CredentialsRepository } from './credentials.repository.js';

function buildCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 'credential-1',
    namespace: 'local',
    providerId: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    authKind: 'none',
    secretHint: null,
    lastValidatedAt: null,
    lastRefreshAt: null,
    lastRefreshError: null,
    createdAt: 1,
    ...overrides,
  };
}

describe('CredentialsRepository', () => {
  let database: TestDatabase;
  let repository: CredentialsRepository;

  beforeEach(() => {
    database = createTestDatabase();
    repository = new CredentialsRepository(database.db);
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores a credential and reads it back by id and by namespace', () => {
    const credential = buildCredential();

    repository.insert(credential);

    assert.deepEqual(repository.findById(credential.id), credential);
    assert.deepEqual(repository.findByNamespace(credential.namespace), credential);
  });

  it('returns undefined for an unknown id or namespace', () => {
    assert.equal(repository.findById('missing'), undefined);
    assert.equal(repository.findByNamespace('missing'), undefined);
  });

  it('refuses two credentials with the same namespace', () => {
    repository.insert(buildCredential({ id: 'credential-1' }));

    assert.throws(() => repository.insert(buildCredential({ id: 'credential-2' })));
  });

  it('lists credentials in creation order', () => {
    repository.insert(buildCredential({ id: 'second', namespace: 'zeta', createdAt: 2 }));
    repository.insert(buildCredential({ id: 'first', namespace: 'alpha', createdAt: 1 }));

    assert.deepEqual(
      repository.list().map((credential) => credential.id),
      ['first', 'second'],
    );
  });

  it('records a successful validation', () => {
    repository.insert(buildCredential());

    repository.markValidated('credential-1', 1700);

    assert.equal(repository.findById('credential-1')?.lastValidatedAt, 1700);
  });

  it('records a refresh and clears the error of the previous attempt', () => {
    repository.insert(buildCredential());

    repository.markRefreshFailed('credential-1', 'provider unreachable');
    assert.deepEqual(repository.findById('credential-1')?.lastRefreshError, 'provider unreachable');
    assert.equal(repository.findById('credential-1')?.lastRefreshAt, null);

    repository.markRefreshed('credential-1', 1900);
    assert.equal(repository.findById('credential-1')?.lastRefreshError, null);
    assert.equal(repository.findById('credential-1')?.lastRefreshAt, 1900);
  });
});
