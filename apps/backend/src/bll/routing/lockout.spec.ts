import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_LOCKOUT_POLICY,
  IN_SERVICE,
  countsAsFailure,
  recordFailure,
  recordSuccess,
  type LockoutState,
} from './lockout.js';

const POLICY = { threshold: 3, cooldownMs: 1000 };
const NOW = 10_000;

/** Applies N failures in a row and answers the state that results. */
function afterFailures(count: number, kind: Parameters<typeof countsAsFailure>[0] = 'unreachable'): LockoutState {
  let state: LockoutState = IN_SERVICE;

  for (let index = 0; index < count; index += 1) {
    state = recordFailure(state, POLICY, NOW, kind);
  }

  return state;
}

describe('what counts as a failure', () => {
  it('does not count the client abort, or a user would lock out their own account', () => {
    assert.equal(countsAsFailure('aborted'), false);
    assert.equal(countsAsFailure('unreachable'), true);
    assert.equal(countsAsFailure('unauthorized'), true);
    assert.equal(countsAsFailure('invalid_response'), true);
    assert.equal(countsAsFailure('unknown'), true);
  });

  it('leaves the state untouched on an abort, however many arrive', () => {
    const state = recordFailure(IN_SERVICE, POLICY, NOW, 'aborted');

    assert.deepEqual(state, IN_SERVICE);
  });
});

describe('the cooldown', () => {
  it('does not lock below the threshold', () => {
    const state = afterFailures(2);

    assert.equal(state.consecutiveFailures, 2);
    assert.equal(state.lockedUntil, null);
  });

  it('locks for the cooldown on the failure that reaches the threshold', () => {
    const state = afterFailures(3);

    assert.equal(state.consecutiveFailures, 3);
    assert.equal(state.lockedUntil, NOW + POLICY.cooldownMs);
  });

  it('is measured from the failure, and a later one never shortens a lock already in the future', () => {
    const locked = afterFailures(3);
    const later = recordFailure(locked, POLICY, NOW + 500, 'unreachable');

    assert.equal(later.lockedUntil, NOW + 500 + POLICY.cooldownMs);
  });

  it('defaults to a conservative threshold and window', () => {
    assert.equal(DEFAULT_LOCKOUT_POLICY.threshold >= 3, true);
    assert.equal(DEFAULT_LOCKOUT_POLICY.cooldownMs >= 30_000, true);
  });
});

describe('recovery', () => {
  it('returns to service, count and lock together, on the first success', () => {
    const locked = afterFailures(3);

    assert.deepEqual(recordSuccess(), IN_SERVICE);
    assert.equal(locked.lockedUntil !== null, true);
  });

  it('re-locks on the next failure after a cooldown that expired', () => {
    const locked = afterFailures(3);
    const afterWindow = recordFailure(locked, POLICY, NOW + POLICY.cooldownMs + 1, 'unreachable');

    assert.equal(afterWindow.lockedUntil, NOW + POLICY.cooldownMs + 1 + POLICY.cooldownMs);
  });

  it('forgets a lock whose window already passed instead of carrying a stale bound', () => {
    const stale: LockoutState = { consecutiveFailures: 1, lockedUntil: NOW - 1 };

    assert.equal(recordFailure(stale, POLICY, NOW, 'unreachable').lockedUntil, null);
  });
});