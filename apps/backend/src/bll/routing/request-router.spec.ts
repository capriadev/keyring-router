import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { SecretKeySource } from '../../config/secret-key-source.js';
import { CatalogRepository } from '../../dal/repositories/catalog.repository.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { PoliciesRepository } from '../../dal/repositories/policies.repository.js';
import { RoutingRepository } from '../../dal/repositories/routing.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import type { ChatTranslator } from '../../types/chat.js';
import type { Credential } from '../../types/credential.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { ModelNotFoundError } from './errors.js';
import { RequestRouter, type RoutePlanInput } from './request-router.js';
import type { ChatTranslationPort } from './translation.js';

interface PlannedAttempt {
  readonly namespace: string;
  readonly providerModelId: string;
  readonly credentialId: string;
  readonly origin: string;
  readonly cascadeIndex: number | null;
}

/** The position of every attempt, in the shape the decision is about: who serves what, and why. */
function trail(plan: { readonly attempts: readonly PlannedAttempt[] }): string[] {
  return plan.attempts.map(
    (attempt) =>
      `${attempt.namespace}/${attempt.providerModelId}@${attempt.credentialId} ${attempt.origin}` +
      `${attempt.cascadeIndex === null ? '' : `#${attempt.cascadeIndex}`}`,
  );
}

function credential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 'cred-a',
    namespace: 'alpha',
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

/** A chat-capable adapter, so an attempt can be resolved without a provider. */
function adapterStub(): unknown {
  return {
    chat: () => Promise.resolve({}),
    chatStream: () => (async function* empty(): AsyncGenerator<unknown> {})(),
  };
}

/**
 * The router over real repositories and a private database, with only the collaborators the plan does
 * not touch (the registry, the key source and the translators) stubbed. The decision under test reads
 * credentials, catalog, policy and state, and all four are the real ones.
 */
describe('RequestRouter plan and per-attempt resolution', () => {
  let database: TestDatabase;
  let credentials: CredentialsRepository;
  let catalog: CatalogRepository;
  let policies: PoliciesRepository;
  let routing: RoutingRepository;
  let router: RequestRouter;

  beforeEach(() => {
    database = createTestDatabase();
    credentials = new CredentialsRepository(database.db);
    catalog = new CatalogRepository(database.db);
    policies = new PoliciesRepository(database.db);
    routing = new RoutingRepository(database.db);

    router = new RequestRouter(
      credentials,
      catalog,
      policies,
      routing,
      { resolveFormat: () => adapterStub() } as unknown as ProviderRegistry,
      { hasPepper: false, key: () => null } as unknown as SecretKeySource,
      { get: () => ({}) as ChatTranslator, has: () => true } as unknown as ChatTranslationPort,
    );

    credentials.insert(credential({ id: 'cred-a', namespace: 'alpha' }));
    credentials.insert(credential({ id: 'cred-b', namespace: 'beta', createdAt: 2 }));
    catalog.replaceForCredential('cred-a', [
      { providerModelId: 'luna', displayName: 'luna', sizeBytes: null, family: null, providerModifiedAt: null, discoveredAt: 1 },
      { providerModelId: 'gpt-6-luna', displayName: 'gpt-6-luna', sizeBytes: null, family: null, providerModifiedAt: null, discoveredAt: 2 },
    ]);
    catalog.replaceForCredential('cred-b', [
      { providerModelId: 'gpt-6-luna', displayName: 'gpt-6-luna', sizeBytes: null, family: null, providerModifiedAt: null, discoveredAt: 1 },
      { providerModelId: 'extra', displayName: 'extra', sizeBytes: null, family: null, providerModifiedAt: null, discoveredAt: 2 },
    ]);
    policies.insert({ id: 'allow-all', credentialId: null, pattern: '*', effect: 'allow', createdAt: 1 });
  });

  afterEach(() => {
    database.dispose();
  });

  function planInput(overrides: Partial<RoutePlanInput> = {}): RoutePlanInput {
    return { model: 'alpha/luna', clientFormat: 'openai', stream: false, mode: 'normal', cascade: [], ...overrides };
  }

  it('normal mode tries only the named model, so it behaves like a direct API', () => {
    const plan = router.plan(planInput());

    assert.equal(plan.namespace, 'alpha');
    assert.deepEqual(trail(plan), ['alpha/luna@cred-a requested']);
    assert.deepEqual(plan.skipped, []);
  });

  it('auto_model walks the cascade in the order the user wrote it', () => {
    const plan = router.plan(planInput({ mode: 'auto_model', cascade: ['gpt-6-luna'] }));

    assert.deepEqual(trail(plan), [
      'alpha/luna@cred-a requested',
      'alpha/gpt-6-luna@cred-a cascade#0',
      'beta/gpt-6-luna@cred-b cascade#0',
    ]);
  });

  it('auto_general reaches beyond the list, after it, never before', () => {
    const plan = router.plan(planInput({ mode: 'auto_general', cascade: ['gpt-6-luna'] }));

    assert.deepEqual(trail(plan), [
      'alpha/luna@cred-a requested',
      'alpha/gpt-6-luna@cred-a cascade#0',
      'beta/gpt-6-luna@cred-b cascade#0',
      'beta/extra@cred-b beyond',
    ]);
  });

  it('removes a credential out of service and names why, without reordering the rest', () => {
    routing.saveLockout(
      { credentialId: 'cred-b', consecutiveFailures: 5, lockedUntil: Date.now() + 60_000 },
      Date.now(),
    );

    const plan = router.plan(planInput({ mode: 'auto_model', cascade: ['gpt-6-luna'] }));

    assert.deepEqual(trail(plan), ['alpha/luna@cred-a requested', 'alpha/gpt-6-luna@cred-a cascade#0']);
    assert.deepEqual(
      plan.skipped.map((entry) => `${entry.attempt.namespace}/${entry.attempt.providerModelId} ${entry.reason}`),
      ['beta/gpt-6-luna locked_out'],
    );
  });

  it('a hidden requested model stays hidden, in every mode', () => {
    policies.insert({ id: 'deny-luna', credentialId: null, pattern: 'alpha/luna', effect: 'deny', createdAt: 2 });

    assert.throws(() => router.plan(planInput({ mode: 'auto_general', cascade: ['gpt-6-luna'] })), ModelNotFoundError);
  });

  it('a hidden model never enters the plan as a cascade or beyond target', () => {
    policies.insert({ id: 'deny-extra', credentialId: null, pattern: 'beta/extra', effect: 'deny', createdAt: 2 });

    const plan = router.plan(planInput({ mode: 'auto_general', cascade: ['gpt-6-luna'] }));

    assert.deepEqual(trail(plan), [
      'alpha/luna@cred-a requested',
      'alpha/gpt-6-luna@cred-a cascade#0',
      'beta/gpt-6-luna@cred-b cascade#0',
    ]);
  });

  it('resolves an attempt by its credential, so a cascade entry reaches another account', () => {
    const input = planInput({ mode: 'auto_model', cascade: ['gpt-6-luna'] });
    const plan = router.plan(input);
    const attempt = plan.attempts[2];

    const route = router.resolveAttempt(plan.requestId, attempt, input);

    assert.equal(route.requestId, plan.requestId);
    assert.equal(route.credentialId, 'cred-b');
    assert.equal(route.namespace, 'beta');
    assert.equal(route.providerModelId, 'gpt-6-luna');
  });

  it('refuses a model that names no credential, the same as an unknown one', () => {
    assert.throws(() => router.plan(planInput({ model: 'ghost/luna' })), ModelNotFoundError);
    assert.throws(() => router.plan(planInput({ model: 'alpha/ghost' })), ModelNotFoundError);
  });
});