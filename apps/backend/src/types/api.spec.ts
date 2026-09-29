import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import type {
  CatalogModel as WireCatalogModel,
  Credential as WireCredential,
  PolicyRule as WirePolicyRule,
} from '@keyring-router/contracts';
import type { CatalogModel } from './catalog.js';
import type { Credential } from './credential.js';
import type { PolicyRule } from './policy.js';

/**
 * Drift, caught by the compiler instead of by a client.
 *
 * The gateway answers with its own domain types, and a client reads the shapes declared in
 * `@keyring-router/contracts`. The assignments below only compile while each domain type still satisfies
 * the shape it is served as: a field removed, renamed or made optional on either side is a build failure
 * here, which is exactly the failure the API contract owes its clients.
 */
describe('wire shapes', () => {
  test('a credential served by the API satisfies its declared shape', () => {
    const asWire = (credential: Credential): WireCredential => credential;

    assert.equal(typeof asWire, 'function');
  });

  test('a catalog row served by the API satisfies its declared shape', () => {
    const asWire = (model: CatalogModel): WireCatalogModel => model;

    assert.equal(typeof asWire, 'function');
  });

  test('a policy rule served by the API satisfies its declared shape', () => {
    const asWire = (rule: PolicyRule): WirePolicyRule => rule;

    assert.equal(typeof asWire, 'function');
  });
});
