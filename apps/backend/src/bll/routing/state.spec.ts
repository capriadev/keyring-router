import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LockoutRecord, QuotaRecord } from '../../dal/repositories/routing.repository.js';
import { toRoutingState } from './state.js';

const NOW = 1_000_000;

function lockout(credentialId: string, lockedUntil: number | null): LockoutRecord {
  return { credentialId, consecutiveFailures: lockedUntil === null ? 0 : 3, lockedUntil };
}

function quota(
  credentialId: string,
  remainingRequests: number | null,
  resetAt: number | null,
  observedAt: number = NOW,
): QuotaRecord {
  return { credentialId, remainingRequests, remainingTokens: null, resetAt, observedAt };
}

describe('the state the verdict reads', () => {
  it('knows nothing about a credential that appears in neither table', () => {
    const state = toRoutingState({ lockouts: [], quotas: [] });

    assert.equal(state.services.size, 0);
    assert.equal(state.services.get('unknown'), undefined);
  });

  it('carries a lockout with no quota bound when only the lockout table has the credential', () => {
    const state = toRoutingState({ lockouts: [lockout('cred-1', NOW + 500)], quotas: [] });

    assert.deepEqual(state.services.get('cred-1'), {
      lockedUntil: NOW + 500,
      quotaExhaustedUntil: null,
    });
  });

  it('carries a quota bound with no lockout when only the quota table has it', () => {
    const state = toRoutingState({ lockouts: [], quotas: [quota('cred-1', 0, NOW + 900)] });

    assert.deepEqual(state.services.get('cred-1'), {
      lockedUntil: null,
      quotaExhaustedUntil: NOW + 900,
    });
  });

  it('merges the two tables into one state per credential', () => {
    const state = toRoutingState({
      lockouts: [lockout('cred-1', NOW + 500)],
      quotas: [quota('cred-1', 0, NOW + 900)],
    });

    assert.deepEqual(state.services.get('cred-1'), {
      lockedUntil: NOW + 500,
      quotaExhaustedUntil: NOW + 900,
    });
  });

  it('leaves a quota unknown rather than exhausted when the provider reported no number', () => {
    const state = toRoutingState({ lockouts: [], quotas: [quota('cred-1', null, null)] });

    assert.deepEqual(state.services.get('cred-1'), {
      lockedUntil: null,
      quotaExhaustedUntil: null,
    });
  });

  it('measures a hold of unknown length from when the window was observed, so it expires instead of sliding', () => {
    // Observed long before any read: the bound is observedAt + hold, a fixed instant. A bound computed
    // from the read time would move forward on every request and never let the credential back in.
    const state = toRoutingState({ lockouts: [], quotas: [quota('cred-1', 0, null, 1_000)] });

    assert.deepEqual(state.services.get('cred-1'), {
      lockedUntil: null,
      quotaExhaustedUntil: 1_000 + 60_000,
    });
  });

  it('keeps one credential per id, so a second row never overwrites the first silently', () => {
    const state = toRoutingState({
      lockouts: [lockout('cred-1', NOW + 100), lockout('cred-2', NOW + 200)],
      quotas: [],
    });

    assert.deepEqual([...state.services.keys()], ['cred-1', 'cred-2']);
  });
});