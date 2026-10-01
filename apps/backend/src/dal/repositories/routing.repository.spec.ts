import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { RoutingRepository } from './routing.repository.js';

/** One credential row, so the foreign keys of the routing tables are satisfied. */
function seedCredential(database: TestDatabase, id: string): void {
  database.db.$client
    .prepare(
      "insert into credentials (id, namespace, provider_id, base_url, auth_kind, created_at) values (?, ?, 'ollama', 'http://127.0.0.1:11434', 'none', 1)",
    )
    .run(id, `ns-${id}`);
}

describe('RoutingRepository', () => {
  let database: TestDatabase;
  let repository: RoutingRepository;

  beforeEach(() => {
    database = createTestDatabase();
    repository = new RoutingRepository(database.db);
    seedCredential(database, 'cred-1');
    seedCredential(database, 'cred-2');
  });

  afterEach(() => {
    database.dispose();
  });

  it('stores a lockout and reads it back', () => {
    repository.saveLockout({ credentialId: 'cred-1', consecutiveFailures: 3, lockedUntil: 500 }, 100);

    assert.deepEqual(repository.listLockouts(), [
      { credentialId: 'cred-1', consecutiveFailures: 3, lockedUntil: 500 },
    ]);
  });

  it('keeps one row per credential when the same one fails again', () => {
    repository.saveLockout({ credentialId: 'cred-1', consecutiveFailures: 1, lockedUntil: null }, 100);
    repository.saveLockout({ credentialId: 'cred-1', consecutiveFailures: 2, lockedUntil: 900 }, 200);

    const rows = repository.listLockouts();

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { credentialId: 'cred-1', consecutiveFailures: 2, lockedUntil: 900 });
  });

  it('clears a lockout the same way it set it, so recovery is one write', () => {
    repository.saveLockout({ credentialId: 'cred-1', consecutiveFailures: 3, lockedUntil: 500 }, 100);
    repository.saveLockout({ credentialId: 'cred-1', consecutiveFailures: 0, lockedUntil: null }, 200);

    assert.deepEqual(repository.listLockouts(), [
      { credentialId: 'cred-1', consecutiveFailures: 0, lockedUntil: null },
    ]);
  });

  it('stores a quota window, keeping a missing number missing', () => {
    repository.saveQuota(
      { credentialId: 'cred-1', remainingRequests: 0, remainingTokens: null, resetAt: 1_000 },
      100,
    );

    assert.deepEqual(repository.listQuotas(), [
      { credentialId: 'cred-1', remainingRequests: 0, remainingTokens: null, resetAt: 1_000 },
    ]);
  });

  it('overwrites the quota window instead of appending a new one', () => {
    repository.saveQuota({ credentialId: 'cred-1', remainingRequests: 5, remainingTokens: 9, resetAt: null }, 100);
    repository.saveQuota({ credentialId: 'cred-1', remainingRequests: 0, remainingTokens: 0, resetAt: 900 }, 200);

    assert.deepEqual(repository.listQuotas(), [
      { credentialId: 'cred-1', remainingRequests: 0, remainingTokens: 0, resetAt: 900 },
    ]);
  });

  it('records the outcome of a credential and reads it by id', () => {
    repository.recordOutcome({ credentialId: 'cred-1', lastOutcome: 'served', lastReason: null, updatedAt: 100 });

    assert.deepEqual(repository.findOutcome('cred-1'), {
      credentialId: 'cred-1',
      lastOutcome: 'served',
      lastReason: null,
      updatedAt: 100,
    });
    assert.equal(repository.findOutcome('cred-2'), undefined);
  });

  it('keeps the latest outcome per credential and lists them in a stable order', () => {
    repository.recordOutcome({ credentialId: 'cred-2', lastOutcome: 'served', lastReason: null, updatedAt: 1 });
    repository.recordOutcome({ credentialId: 'cred-1', lastOutcome: 'skipped', lastReason: 'locked_out', updatedAt: 2 });
    repository.recordOutcome({ credentialId: 'cred-2', lastOutcome: 'failed', lastReason: 'unreachable', updatedAt: 3 });

    assert.deepEqual(
      repository.listOutcomes().map((row) => [row.credentialId, row.lastOutcome, row.lastReason]),
      [
        ['cred-1', 'skipped', 'locked_out'],
        ['cred-2', 'failed', 'unreachable'],
      ],
    );
  });

  it('starts empty on a database that has not routed anything', () => {
    assert.deepEqual(repository.listLockouts(), []);
    assert.deepEqual(repository.listQuotas(), []);
    assert.deepEqual(repository.listOutcomes(), []);
  });
});