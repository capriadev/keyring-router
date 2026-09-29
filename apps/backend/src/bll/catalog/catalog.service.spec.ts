import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CatalogRepository } from '../../dal/repositories/catalog.repository.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { PoliciesRepository } from '../../dal/repositories/policies.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import type { Credential } from '../../types/credential.js';
import { ProviderFailure, type DiscoveredModelRecord } from '../../types/provider.js';
import { CredentialNotFoundError } from '../errors.js';
import { CredentialService } from '../credentials/credential.service.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { createFakeAdapter } from '../testing/fake-adapter.js';
import { CatalogService } from './catalog.service.js';
import { PolicyService } from './policy.service.js';

function model(providerModelId: string): DiscoveredModelRecord {
  return {
    providerModelId,
    displayName: providerModelId,
    sizeBytes: null,
    family: null,
    providerModifiedAt: null,
  };
}

describe('CatalogService', () => {
  let database: TestDatabase;
  let credentials: CredentialsRepository;
  let catalog: CatalogRepository;
  let policyService: PolicyService;
  let service: CatalogService;
  let credential: Credential;
  let discovered: DiscoveredModelRecord[];
  let failure: ProviderFailure | null;

  beforeEach(() => {
    database = createTestDatabase();
    credentials = new CredentialsRepository(database.db);
    catalog = new CatalogRepository(database.db);
    const policies = new PoliciesRepository(database.db);
    discovered = [];
    failure = null;

    const registry = new ProviderRegistry([
      createFakeAdapter({
        discoverCatalog: async () => {
          if (failure !== null) {
            throw failure;
          }

          return discovered;
        },
      }),
    ]);

    service = new CatalogService(credentials, catalog, policies, registry);
    policyService = new PolicyService(policies, credentials);
    credential = new CredentialService(credentials, registry).create({
      namespace: 'local',
      providerId: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      authKind: 'none',
    });
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores the discovered models, reports the counts and stamps the refresh', async () => {
    discovered = [model('qwen2.5:7b'), model('llama3.2:latest')];

    const result = await service.refresh(credential.id);

    assert.equal(result.credentialId, credential.id);
    assert.equal(result.discovered, 2);
    assert.equal(result.exposed, 0);
    assert.equal(typeof result.refreshedAt, 'number');
    assert.equal(catalog.listByCredential(credential.id).length, 2);
    assert.equal(credentials.findById(credential.id)?.lastRefreshAt, result.refreshedAt);
    assert.equal(credentials.findById(credential.id)?.lastRefreshError, null);
  });

  it('replaces the derived rows on a second refresh', async () => {
    discovered = [model('qwen2.5:7b'), model('llama3.2:latest')];
    await service.refresh(credential.id);

    discovered = [model('llama3.2:latest')];
    await service.refresh(credential.id);

    assert.deepEqual(
      service.listCatalog().map((entry) => entry.providerModelId),
      ['llama3.2:latest'],
    );
  });

  it('keeps catalog and policy separate: nothing is exposed until an allow rule matches', async () => {
    discovered = [model('qwen2.5:7b')];
    await service.refresh(credential.id);

    assert.deepEqual(
      service.listCatalog().map((entry) => [entry.namespacedId, entry.exposed]),
      [['local/qwen2.5:7b', false]],
    );
    assert.deepEqual(service.listExposed(), []);

    policyService.create({ pattern: 'local/*', effect: 'allow' });

    assert.equal(service.listCatalog()[0]?.exposed, true);
    assert.deepEqual(service.listExposed(), [
      {
        namespacedId: 'local/qwen2.5:7b',
        providerId: 'ollama',
        namespace: 'local',
        providerModelId: 'qwen2.5:7b',
        displayName: 'qwen2.5:7b',
      },
    ]);
  });

  it('lets a deny rule override an allow rule', async () => {
    discovered = [model('qwen2.5:7b')];
    policyService.create({ pattern: 'local/*', effect: 'allow' });
    policyService.create({ pattern: 'local/qwen*', effect: 'deny' });
    await service.refresh(credential.id);

    assert.equal(service.listCatalog()[0]?.exposed, false);
    assert.deepEqual(service.listExposed(), []);
  });

  it('counts only the exposed models of a refresh', async () => {
    discovered = [model('qwen2.5:7b'), model('llama3.2:latest')];
    policyService.create({ pattern: 'local/qwen*', effect: 'allow' });

    const result = await service.refresh(credential.id);

    assert.equal(result.discovered, 2);
    assert.equal(result.exposed, 1);
  });

  it('persists the normalized error and keeps the previous catalog when the provider fails', async () => {
    discovered = [model('qwen2.5:7b')];
    const first = await service.refresh(credential.id);

    failure = new ProviderFailure('ollama', 'unreachable', 'Ollama did not answer GET /api/tags');
    await assert.rejects(service.refresh(credential.id), ProviderFailure);

    const stored = credentials.findById(credential.id);

    assert.equal(stored?.lastRefreshError, 'Ollama did not answer GET /api/tags');
    assert.equal(stored?.lastRefreshAt, first.refreshedAt);
    assert.equal(service.listCatalog().length, 1);
  });

  it('filters the catalog by credential', async () => {
    const other = new CredentialService(credentials, new ProviderRegistry([createFakeAdapter()])).create({
      namespace: 'work',
      providerId: 'ollama',
      baseUrl: 'http://127.0.0.1:11435',
      authKind: 'none',
    });
    discovered = [model('qwen2.5:7b')];
    await service.refresh(credential.id);
    await service.refresh(other.id);

    assert.equal(service.listCatalog().length, 2);
    assert.deepEqual(
      service.listCatalog(credential.id).map((entry) => entry.credentialId),
      [credential.id],
    );
    assert.throws(() => service.listCatalog('missing'), CredentialNotFoundError);
  });

  it('reports an unknown credential on refresh', async () => {
    await assert.rejects(service.refresh('missing'), CredentialNotFoundError);
  });
});

