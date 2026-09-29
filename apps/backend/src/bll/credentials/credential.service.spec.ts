import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { SecretKeySource } from '../../config/secret-key-source.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { CREDENTIAL_SECRET_SALT_ID, InstallKeysRepository } from '../../dal/repositories/install-keys.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import { OTHER_PEPPER, randomSalt, randomSecret, testKeySource } from '../../dal/testing/secret-fixtures.js';
import type { CredentialInput, StoredSecret } from '../../types/credential.js';
import { ProviderFailure, type ProviderAdapter, type ProviderId } from '../../types/provider.js';
import {
  AuthKindUnsupportedError,
  CredentialNotFoundError,
  InvalidInputError,
  NamespaceTakenError,
  SecretKeyUnavailableError,
  SecretNotFoundError,
  SecretUndecryptableError,
  UnsupportedProviderError,
} from '../errors.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { createFakeAdapter } from '../testing/fake-adapter.js';
import { CredentialService } from './credential.service.js';
import { openSecret } from './secrets.js';

function buildInput(overrides: Partial<CredentialInput> = {}): CredentialInput {
  return {
    namespace: 'local',
    providerId: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    authKind: 'none',
    ...overrides,
  };
}

/** An adapter that only accepts a credential carrying a secret, like every cloud provider. */
function createApiKeyAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return createFakeAdapter({ authKinds: ['none', 'api_key'], ...overrides });
}

describe('CredentialService', () => {
  let database: TestDatabase;
  let credentials: CredentialsRepository;
  let installKeys: InstallKeysRepository;
  let keySource: SecretKeySource;

  function buildService(
    adapterOverrides: Partial<ProviderAdapter> = {},
    adapter: ProviderAdapter = createFakeAdapter(adapterOverrides),
    source: SecretKeySource = keySource,
  ): CredentialService {
    return new CredentialService(credentials, new ProviderRegistry([adapter]), source);
  }

  function readDatabaseFile(): string {
    return readFileSync(database.path).toString('latin1');
  }

  function secretKey(): Buffer {
    return keySource.key() ?? Buffer.alloc(0);
  }

  beforeEach(() => {
    database = createTestDatabase();
    credentials = new CredentialsRepository(database.db);
    installKeys = new InstallKeysRepository(database.db);
    keySource = testKeySource(() => installKeys.readOrCreate(CREDENTIAL_SECRET_SALT_ID));
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

  it('rejects api_key when the provider does not accept it, without writing anything', () => {
    const service = buildService({}, createApiKeyAdapter({ authKinds: ['none'] }));

    assert.throws(
      () => service.create(buildInput({ authKind: 'api_key', secret: randomSecret() })),
      AuthKindUnsupportedError,
    );
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

  it('stores an api_key credential encrypted, and never as plaintext', () => {
    const secret = randomSecret();
    const service = buildService({}, createApiKeyAdapter());

    const credential = service.create(buildInput({ authKind: 'api_key', secret }));

    assert.equal(credential.authKind, 'api_key');
    assert.equal(credential.secretHint, secret.slice(-4));
    assert.equal(JSON.stringify(credential).includes(secret), false);

    const stored: StoredSecret | null = credentials.readStoredSecret(credential.id);

    assert.notEqual(stored, null);
    assert.equal(JSON.stringify(stored).includes(secret), false);
    assert.equal(stored?.secretVersion, 1);
    assert.equal(openSecret(secretKey(), stored as StoredSecret), secret);

    // The plaintext secret is nowhere in the database file.
    assert.equal(readDatabaseFile().includes(secret), false);
  });

  it('lists credentials with the hint only, never with a secret', () => {
    const secret = randomSecret();
    const service = buildService({}, createApiKeyAdapter());
    service.create(buildInput({ authKind: 'api_key', secret }));

    const listed = service.list();

    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.secretHint, secret.slice(-4));
    assert.equal(JSON.stringify(listed).includes(secret), false);
    assert.equal('secretCiphertext' in (listed[0] ?? {}), false);
  });

  it('refuses api_key without a secret and a secret without api_key', () => {
    const service = buildService({}, createApiKeyAdapter());

    assert.throws(() => service.create(buildInput({ authKind: 'api_key' })), InvalidInputError);
    assert.throws(() => service.create(buildInput({ secret: randomSecret() })), InvalidInputError);
    assert.deepEqual(service.list(), []);
  });

  it('refuses a secret outside its length bounds', () => {
    const service = buildService({}, createApiKeyAdapter());

    for (const secret of ['short', 'x'.repeat(4097), ` ${randomSecret()}`, `${randomSecret()} `]) {
      assert.throws(() => service.create(buildInput({ authKind: 'api_key', secret })), InvalidInputError);
    }
  });

  it('rotates the secret transactionally, keeps the hint stable and retires the old ciphertext', () => {
    const service = buildService({}, createApiKeyAdapter());
    const suffix = randomSecret().slice(-4);
    const first = `${randomSecret()}${suffix}`;
    const second = `${randomSecret()}${suffix}`;
    const credential = service.create(buildInput({ authKind: 'api_key', secret: first }));
    const before = credentials.readStoredSecret(credential.id) as StoredSecret;

    const rotated = service.rotateSecret(credential.id, second);
    const after = credentials.readStoredSecret(credential.id) as StoredSecret;

    assert.equal(rotated.secretHint, first.slice(-4));
    assert.equal(after.secretHint, before.secretHint);
    assert.notEqual(after.secretCiphertext, before.secretCiphertext);
    assert.notEqual(after.secretIv, before.secretIv);
    assert.notEqual(after.secretTag, before.secretTag);
    assert.equal(after.secretVersion, before.secretVersion + 1);
    assert.equal(openSecret(secretKey(), after), second);

    // The retired ciphertext no longer opens as the current secret of the credential: the version it
    // was sealed with is not the one the row now carries.
    assert.throws(
      () => openSecret(secretKey(), { ...before, secretVersion: after.secretVersion }),
      SecretUndecryptableError,
    );
  });

  it('reports an unknown credential on rotation', () => {
    const service = buildService({}, createApiKeyAdapter());

    assert.throws(() => service.rotateSecret('missing', randomSecret()), CredentialNotFoundError);
  });

  it('refuses to rotate a credential that stores no secret', () => {
    const service = buildService();
    const credential = service.create(buildInput());

    assert.throws(() => service.rotateSecret(credential.id, randomSecret()), InvalidInputError);
  });

  it('hands the decrypted secret to the adapter on validate', async () => {
    const secret = randomSecret();
    const seen: (string | undefined)[] = [];
    const service = buildService(
      {},
      createApiKeyAdapter({
        validateCredential: async (target) => {
          seen.push(target.secret);

          return { ok: true, detail: 'authorized', validatedAt: 1700 };
        },
      }),
    );
    const credential = service.create(buildInput({ authKind: 'api_key', secret }));

    const result = await service.validate(credential.id);

    assert.deepEqual(seen, [secret]);
    assert.equal(result.ok, true);
    assert.equal(credentials.findById(credential.id)?.lastValidatedAt, 1700);
  });

  it('surfaces a wrong pepper as a credential problem and not as a crash', async () => {
    const service = buildService({}, createApiKeyAdapter());
    const credential = service.create(buildInput({ authKind: 'api_key', secret: randomSecret() }));
    const wrongPepper = buildService({}, createApiKeyAdapter(), testKeySource(() => randomSalt(), OTHER_PEPPER));

    await assert.rejects(async () => wrongPepper.validate(credential.id), SecretUndecryptableError);
  });

  it('surfaces a missing pepper as a credential problem, and stores nothing', async () => {
    const withoutPepper = buildService({}, createApiKeyAdapter(), testKeySource(randomSalt, null));

    assert.throws(
      () => withoutPepper.create(buildInput({ authKind: 'api_key', secret: randomSecret() })),
      SecretKeyUnavailableError,
    );

    const service = buildService({}, createApiKeyAdapter());
    const credential = service.create(buildInput({ authKind: 'api_key', secret: randomSecret() }));

    await assert.rejects(
      async () => buildService({}, createApiKeyAdapter(), testKeySource(randomSalt, null)).validate(credential.id),
      SecretKeyUnavailableError,
    );
  });

  it('reports a credential that declares api_key but holds no secret', async () => {
    const service = buildService({}, createApiKeyAdapter());
    const credential = service.create(buildInput({ authKind: 'api_key', secret: randomSecret() }));

    // Only reachable through a hand edited row: it is what an inconsistent database looks like.
    database.db.$client
      .prepare(
        'update credentials set secret_ciphertext = null, secret_iv = null, secret_tag = null, secret_version = null, secret_hint = null where id = ?',
      )
      .run(credential.id);

    await assert.rejects(async () => service.validate(credential.id), SecretNotFoundError);
  });
});
