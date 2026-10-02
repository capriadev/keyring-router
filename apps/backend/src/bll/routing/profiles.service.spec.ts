import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RoutingProfilesRepository } from '../../dal/repositories/routing-profiles.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import { InvalidRoutingProfileError, RoutingProfileNotFoundError } from '../errors.js';
import { RoutingProfilesService } from './profiles.service.js';

describe('RoutingProfilesService', () => {
  let database: TestDatabase;
  let repository: RoutingProfilesRepository;
  let service: RoutingProfilesService;

  beforeEach(() => {
    database = createTestDatabase();
    repository = new RoutingProfilesRepository(database.db);
    service = new RoutingProfilesService(repository);
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores a valid profile and reads it back', () => {
    const created = service.create({ providerModelId: 'gpt-6-luna', mode: 'auto_model', cascade: ['gpt-5.6-terra'] });

    assert.equal(created.providerModelId, 'gpt-6-luna');
    assert.equal(created.mode, 'auto_model');
    assert.deepEqual(created.cascade, ['gpt-5.6-terra']);
    assert.deepEqual(service.list(), [created]);
  });

  it('keeps a cascade entry whole, so a model id with a slash is one entry', () => {
    const created = service.create({ providerModelId: 'luna', mode: 'auto_model', cascade: ['meta/llama-3'] });

    assert.deepEqual(created.cascade, ['meta/llama-3']);
  });

  it('refuses an unknown mode and stores nothing', () => {
    assert.throws(
      () => service.create({ providerModelId: 'luna', mode: 'auto_everything', cascade: [] }),
      InvalidRoutingProfileError,
    );
    assert.deepEqual(service.list(), []);
  });

  it('refuses an empty cascade entry and a repeated one', () => {
    assert.throws(
      () => service.create({ providerModelId: 'luna', mode: 'auto_model', cascade: ['a', '  '] }),
      InvalidRoutingProfileError,
    );
    assert.throws(
      () => service.create({ providerModelId: 'luna', mode: 'auto_model', cascade: ['a', 'a'] }),
      InvalidRoutingProfileError,
    );
    assert.deepEqual(service.list(), []);
  });

  it('refuses a second profile for the same model, so one model has one rule', () => {
    service.create({ providerModelId: 'luna', mode: 'auto_model', cascade: [] });

    assert.throws(
      () => service.create({ providerModelId: 'luna', mode: 'normal', cascade: [] }),
      InvalidRoutingProfileError,
    );
    assert.equal(service.list().length, 1);
  });

  it('removes a profile, and refuses an unknown id the same way a missing policy is refused', () => {
    const created = service.create({ providerModelId: 'luna', mode: 'normal', cascade: [] });

    service.delete(created.id);
    assert.deepEqual(service.list(), []);
    assert.throws(() => service.delete(created.id), RoutingProfileNotFoundError);
  });
});