import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_QUOTA_HOLD_MS, quotaExhaustedUntil } from './quota.js';

const NOW = 5_000_000;

describe('what a provider reported about a quota window', () => {
  it('treats a missing number as unknown, not as zero: nothing reported never marks its own credential out', () => {
    assert.equal(
      quotaExhaustedUntil({ remainingRequests: null, remainingTokens: null, resetAt: null }, NOW),
      null,
    );
  });

  it('keeps a credential in service while the window still has room', () => {
    assert.equal(
      quotaExhaustedUntil({ remainingRequests: 3, remainingTokens: 900, resetAt: NOW + 60_000 }, NOW),
      null,
    );
  });
});

describe('an exhausted window', () => {
  it('holds the credential until the reset the provider reported', () => {
    const until = quotaExhaustedUntil(
      { remainingRequests: 0, remainingTokens: 12, resetAt: NOW + 30_000 },
      NOW,
    );

    assert.equal(until, NOW + 30_000);
  });

  it('treats zero tokens the same as zero requests', () => {
    const until = quotaExhaustedUntil(
      { remainingRequests: 4, remainingTokens: 0, resetAt: NOW + 30_000 },
      NOW,
    );

    assert.equal(until, NOW + 30_000);
  });

  it('returns to service when the reset the provider named already passed', () => {
    const until = quotaExhaustedUntil(
      { remainingRequests: 0, remainingTokens: null, resetAt: NOW - 1 },
      NOW,
    );

    assert.equal(until, null);
  });

  it('holds for the conservative default when the provider says it is out but not until when', () => {
    const until = quotaExhaustedUntil(
      { remainingRequests: 0, remainingTokens: null, resetAt: null },
      NOW,
    );

    assert.equal(until, NOW + DEFAULT_QUOTA_HOLD_MS);
    assert.equal(DEFAULT_QUOTA_HOLD_MS <= 120_000, true, 'the default must stay short');
  });
});