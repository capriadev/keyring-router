import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { SecretKeySource } from '../../config/secret-key-source.js';
import { CatalogRepository } from '../../dal/repositories/catalog.repository.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { CREDENTIAL_SECRET_SALT_ID, InstallKeysRepository } from '../../dal/repositories/install-keys.repository.js';
import { PoliciesRepository } from '../../dal/repositories/policies.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import { randomSecret, testKeySource } from '../../dal/testing/secret-fixtures.js';
import type { DiscoveredModelRecord, ProviderAdapter } from '../../types/provider.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { CredentialService } from './credential.service.js';

/** A provider that requires the header, built on the same contract the real adapters implement. */
function createStubAdapter(origin: string): ProviderAdapter {
  async function request(path: string, secret: string | undefined): Promise<Response> {
    return fetch(`${origin}${path}`, {
      headers: secret === undefined ? {} : { authorization: `Bearer ${secret}` },
    });
  }

  return {
    id: 'ollama',
    authKinds: ['none', 'api_key'],

    async validateCredential(target) {
      const response = await request('/version', target.secret);

      return {
        ok: response.status === 200,
        detail: response.status === 200 ? 'stub accepted the credential' : `stub answered ${response.status}`,
        validatedAt: Date.now(),
      };
    },

    async discoverCatalog(target) {
      const response = await request('/models', target.secret);

      if (response.status !== 200) {
        throw new Error(`stub answered ${response.status}`);
      }

      const payload = (await response.json()) as { data: { id: string; display_name: string }[] };

      return payload.data.map(
        (model): DiscoveredModelRecord => ({
          providerModelId: model.id,
          displayName: model.display_name,
          sizeBytes: null,
          family: null,
          providerModifiedAt: null,
        }),
      );
    },
  };
}

/**
 * End to end proof of the wiring, without touching a real API: a stub provider that refuses every
 * request whose Authorization header does not carry the credential secret. It runs on loopback and
 * dies with the test.
 */
describe('credential secret wiring', () => {
  let database: TestDatabase;
  let credentials: CredentialsRepository;
  let keySource: SecretKeySource;
  let service: CredentialService;
  let catalog: CatalogService;
  let server: Server;
  let baseUrl: string;
  let authorized: string[] = [];

  beforeEach(async () => {
    database = createTestDatabase();
    credentials = new CredentialsRepository(database.db);
    const installKeys = new InstallKeysRepository(database.db);
    keySource = testKeySource(() => installKeys.readOrCreate(CREDENTIAL_SECRET_SALT_ID));
    authorized = [];

    server = createServer((request, response) => {
      const header = request.headers.authorization ?? '';

      if (!header.startsWith('Bearer ') || header.slice('Bearer '.length) === '') {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'missing credential' }));
        return;
      }

      authorized.push(header);

      if (request.url === '/models') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'stub-model', display_name: 'stub-model' }] }));
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ version: 'stub' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const registry = new ProviderRegistry([createStubAdapter(baseUrl)]);

    service = new CredentialService(credentials, registry, keySource);
    catalog = new CatalogService(
      credentials,
      new CatalogRepository(database.db),
      new PoliciesRepository(database.db),
      registry,
      keySource,
    );
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    database.dispose();
  });

  it('sends the stored secret as the authorization header of the provider request', async () => {
    const secret = randomSecret();
    const credential = service.create({
      namespace: 'cloud',
      providerId: 'ollama',
      baseUrl,
      authKind: 'api_key',
      secret,
    });

    const result = await service.validate(credential.id);

    assert.equal(result.ok, true);
    assert.deepEqual(authorized, [`Bearer ${secret}`]);
    assert.equal(JSON.stringify(result).includes(secret), false);
  });

  it('discovers the catalog of a credential that carries a secret', async () => {
    const secret = randomSecret();
    const credential = service.create({
      namespace: 'cloud',
      providerId: 'ollama',
      baseUrl,
      authKind: 'api_key',
      secret,
    });

    const refreshed = await catalog.refresh(credential.id);

    assert.equal(refreshed.discovered, 1);
    assert.deepEqual(authorized, [`Bearer ${secret}`]);
    assert.deepEqual(
      catalog.listCatalog().map((model) => model.namespacedId),
      ['cloud/stub-model'],
    );
    assert.equal(JSON.stringify(catalog.listCatalog()).includes(secret), false);
    assert.equal(JSON.stringify(service.list()).includes(secret), false);
  });

  it('sends the rotated secret, not the retired one', async () => {
    const first = randomSecret();
    const second = randomSecret();
    const credential = service.create({
      namespace: 'cloud',
      providerId: 'ollama',
      baseUrl,
      authKind: 'api_key',
      secret: first,
    });

    await service.validate(credential.id);
    service.rotateSecret(credential.id, second);
    await service.validate(credential.id);

    assert.deepEqual(authorized, [`Bearer ${first}`, `Bearer ${second}`]);
  });

  it('reports a credential the provider refuses instead of crashing', async () => {
    const credential = service.create({
      namespace: 'unauthenticated',
      providerId: 'ollama',
      baseUrl,
      authKind: 'none',
    });

    const result = await service.validate(credential.id);

    assert.equal(result.ok, false);
    assert.equal(result.detail, 'stub answered 401');
    assert.deepEqual(authorized, []);
  });
});
