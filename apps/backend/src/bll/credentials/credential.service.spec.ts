import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import type { CredentialInput } from '../../types/credential.js';
import { ProviderFailure, type ProviderAdapter, type ProviderId } from '../../types/provider.js';
import { AuthKindUnsupportedError, CredentialNotFoundError, InvalidInputError, NamespaceTakenError, UnsupportedProviderError } from '../errors.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { createFakeAdapter } from '../testing/fake-adapter.js';
import { CredentialService } from './credential.service.js';

function buildInput(overrides: Partial<CredentialInput> = {}): CredentialInput {
  return {
    namespace: 'local',
    providerId: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    authKind: 'none',
    ...overrides,
  };
}

describe('CredentialService', () => {
  let database: TestDatabase;
  let credentials: CredentialsRepository;

  function buildService(adapterOverrides: Partial<ProviderAdapter> = {}): CredentialService {
    return new CredentialService(credentials, new ProviderRegistry([createFakeAdapter(adapterOverrides)]));
  }

  beforeEach(() => {
    database = createTestDatabase();
    credentials = new CredentialsRepository(database.db);
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores a credential with no validation or refresh yet', () => {
    const service = buildService();

    const credential = service.create(buildInput());

    assert.match(credential.id, /^[0-9a-f-]{36}$/);
    assert.equal(credential.namespace, 'local');
    assert.equal(credential.providerId, 'ollama');
    assert.equal(credential.authKind, 'none');
    assert.equal(credential.lastValidatedAt, null);
    assert.equal(credential.lastRefreshAt, null);
    assert.equal(credential.lastRefreshError, null);
    assert.deepEqual(service.list(), [credential]);
  });

  it('normalizes the base URL', () => {
    const service = buildService();

    assert.equal(service.create(buildInput({ namespace: 'bare' })).baseUrl, 'http://127.0.0.1:11434');
    assert.equal(service.create(buildInput({ namespace: 'slash', baseUrl: 'http://127.0.0.1:11434/' })).baseUrl, 'http://127.0.0.1:11434');
    assert.equal(service.create(buildInput({ namespace: 'spaces', baseUrl: '  https://proxy.test/ollama/  ' })).baseUrl, 'https://proxy.test/ollama');
  });

  it('rejects a namespace that is not a lowercase slug', () => {
    const service = buildService();

    for (const namespace of ['Local', 'l', 'local_1', '-local', 'local space', 'a'.repeat(33)]) {
      assert.throws(() => service.create(buildInput({ namespace })), InvalidInputError);
    }

    assert.deepEqual(service.list(), []);
  });

  it('rejects a namespace already taken', () => {
    const service = buildService();
    service.create(buildInput());

    assert.throws(() => service.create(buildInput({ baseUrl: 'http://127.0.0.1:11435' })), NamespaceTakenError);
    assert.equal(service.list().length, 1);
  });

  it('rejects api_key without writing anything', () => {
    const service = buildService();

    assert.throws(() => service.create(buildInput({ authKind: 'api_key' })), AuthKindUnsupportedError);
    assert.deepEqual(service.list(), []);
  });

  it('rejects a secret instead of dropping it', () => {
    const service = buildService();

    assert.throws(() => service.create(buildInput({ secret: 'plain-text-value' })), InvalidInputError);
    assert.deepEqual(service.list(), []);
  });

  it('rejects a base URL that is not http or https', () => {
    const service = buildService();

    for (const baseUrl of ['127.0.0.1:11434', 'ftp://127.0.0.1:11434', 'http://127.0.0.1:11434?token=1', 'http://127.0.0.1:11434#frag']) {
      assert.throws(() => service.create(buildInput({ baseUrl })), InvalidInputError);
    }
  });

  it('rejects a provider without a registered adapter', () => {
    const service = buildService();

    assert.throws(() => service.create(buildInput({ providerId: 'gemini' as ProviderId })), UnsupportedProviderError);
  });

  it('records the validation of a reachable credential', async () => {
    const service = buildService({ validateCredential: async () => ({ ok: true, detail: 'reachable', validatedAt: 1700 }) });
    const credential = service.create(buildInput());

    const result = await service.validate(credential.id);

    assert.deepEqual(result, { ok: true, detail: 'reachable', validatedAt: 1700 });
    assert.equal(credentials.findById(credential.id)?.lastValidatedAt, 1700);
  });

  it('reports an unknown credential', async () => {
    const service = buildService();

    await assert.rejects(service.validate('missing'), CredentialNotFoundError);
  });

  it('propagates a provider failure without touching the stored credential', async () => {
    const failure = new ProviderFailure('ollama', 'unreachable', 'Ollama did not answer GET /api/version');
    const service = buildService({
      validateCredential: async () => {
        throw failure;
      },
    });
    const credential = service.create(buildInput());

    await assert.rejects(service.validate(credential.id), (error: unknown) => error === failure);
    assert.equal(credentials.findById(credential.id)?.lastValidatedAt, null);
  });
});
