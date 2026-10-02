import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RoutingRepository } from '../../dal/repositories/routing.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import { RoutingStateService } from './state.service.js';

/** One credential row, so the foreign keys of the routing tables are satisfied. */
function seedCredential(database: TestDatabase, id: string): void {
  database.db.$client
    .prepare(
      "insert into credentials (id, namespace, provider_id, base_url, auth_kind, created_at) values (?, ?, 'ollama', 'http://127.0.0.1:11434', 'none', 1)",
    )
    .run(id, `ns-${id}`);
}

describe('RoutingStateService', () => {
  let database: TestDatabase;
  let routing: RoutingRepository;
  let service: RoutingStateService;

  beforeEach(() => {
    database = createTestDatabase();
    routing = new RoutingRepository(database.db);
    service = new RoutingStateService(routing);
    seedCredential(database, 'cred-1');
  });

  afterEach(() => {
    database.dispose();
  });

  it('locks a credential on the fifth consecutive failure, held for the cooldown', () => {
    for (let failure = 0; failure < 5; failure += 1) {
      service.recordFailed('cred-1', 'unreachable', 1_000);
    }

    assert.deepEqual(routing.listLockouts(), [
      { credentialId: 'cred-1', consecutiveFailures: 5, lockedUntil: 1_000 + 60_000 },
    ]);
  });

  it('never counts a client abort, so cancelling own requests cannot lock an account', () => {
    for (let failure = 0; failure < 10; failure += 1) {
      service.recordFailed('cred-1', 'aborted', 1_000);
    }

    assert.deepEqual(routing.listLockouts(), [
      { credentialId: 'cred-1', consecutiveFailures: 0, lockedUntil: null },
    ]);
  });

  it('recovers immediately and totally on a success', () => {
    for (let failure = 0; failure < 3; failure += 1) {
      service.recordFailed('cred-1', 'unauthorized', 1_000);
    }

    service.recordServed('cred-1', 2_000);

    assert.deepEqual(routing.listLockouts(), [
      { credentialId: 'cred-1', consecutiveFailures: 0, lockedUntil: null },
    ]);
  });

  it('records the last outcome of each credential for the report', () => {
    service.recordFailed('cred-1', 'unreachable', 1_000);

    assert.deepEqual(routing.findOutcome('cred-1'), {
      credentialId: 'cred-1',
      lastOutcome: 'failed',
      lastReason: 'unreachable',
      updatedAt: 1_000,
    });

    service.recordServed('cred-1', 2_000);

    assert.deepEqual(routing.findOutcome('cred-1'), {
      credentialId: 'cred-1',
      lastOutcome: 'served',
      lastReason: null,
      updatedAt: 2_000,
    });
  });
});