import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { RoutingProfilesRepository, type RoutingProfileRecord } from './routing-profiles.repository.js';

function profile(overrides: Partial<RoutingProfileRecord> = {}): RoutingProfileRecord {
  return {
    id: 'profile-1',
    providerModelId: 'gpt-6-luna',
    mode: 'auto_model',
    cascade: ['claude-sonnet-5.5', 'gpt-5.6-terra'],
    createdAt: 1,
    ...overrides,
  };
}

describe('RoutingProfilesRepository', () => {
  let database: TestDatabase;
  let repository: RoutingProfilesRepository;

  beforeEach(() => {
    database = createTestDatabase();
    repository = new RoutingProfilesRepository(database.db);
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores a profile and reads it back, with the cascade as a list', () => {
    repository.insert(profile());

    assert.deepEqual(repository.findByModel('gpt-6-luna'), profile());
  });

  it('lists profiles by model id, so the order is deterministic', () => {
    repository.insert(profile({ id: 'p2', providerModelId: 'zeta' }));
    repository.insert(profile({ id: 'p1', providerModelId: 'alpha' }));

    assert.deepEqual(
      repository.list().map((row) => row.providerModelId),
      ['alpha', 'zeta'],
    );
  });

  it('keeps one profile per model, refusing a second for the same model', () => {
    repository.insert(profile());

    assert.throws(() => repository.insert(profile({ id: 'profile-2' })));
  });

  it('reports a model it has no profile for as absent', () => {
    assert.equal(repository.findByModel('unknown'), undefined);
  });

  it('removes a profile by id, and says so only when one was removed', () => {
    repository.insert(profile());

    assert.equal(repository.deleteById('profile-1'), true);
    assert.equal(repository.deleteById('profile-1'), false);
    assert.equal(repository.findByModel('gpt-6-luna'), undefined);
  });

  it('starts empty on a database that has no profiles', () => {
    assert.deepEqual(repository.list(), []);
  });
});