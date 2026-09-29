import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Credential } from '../../types/credential.js';
import type { PolicyRule } from '../../types/policy.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { CredentialsRepository } from './credentials.repository.js';
import { PoliciesRepository } from './policies.repository.js';

function buildCredential(): Credential {
  return {
    id: 'credential-1',
    namespace: 'local',
    providerId: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    authKind: 'none',
    lastValidatedAt: null,
    lastRefreshAt: null,
    lastRefreshError: null,
    createdAt: 1,
  };
}

function buildRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: 'rule-1',
    credentialId: null,
    pattern: 'local/*',
    effect: 'allow',
    createdAt: 1,
    ...overrides,
  };
}

describe('PoliciesRepository', () => {
  let database: TestDatabase;
  let policies: PoliciesRepository;

  beforeEach(() => {
    database = createTestDatabase();
    policies = new PoliciesRepository(database.db);
    new CredentialsRepository(database.db).insert(buildCredential());
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores global and credential scoped rules', () => {
    policies.insert(buildRule({ id: 'global', pattern: '*', effect: 'deny' }));
    policies.insert(buildRule({ id: 'scoped', credentialId: 'credential-1', effect: 'allow' }));

    assert.deepEqual(policies.list(), [
      { id: 'global', credentialId: null, pattern: '*', effect: 'deny', createdAt: 1 },
      { id: 'scoped', credentialId: 'credential-1', pattern: 'local/*', effect: 'allow', createdAt: 1 },
    ]);
  });

  it('refuses a rule scoped to an unknown credential', () => {
    assert.throws(() => policies.insert(buildRule({ credentialId: 'missing' })));
  });

  it('reports whether a rule was removed', () => {
    policies.insert(buildRule());

    assert.equal(policies.deleteById('rule-1'), true);
    assert.equal(policies.deleteById('rule-1'), false);
    assert.deepEqual(policies.list(), []);
  });
});
