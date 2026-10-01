import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CredentialServiceState, RoutingAttempt, RoutingState } from '../../types/routing.js';
import { applyServiceState, emptyRoutingState } from './verdict.js';

function attempt(namespace: string, providerModelId: string): RoutingAttempt {
  return {
    credentialId: `id-${namespace}`,
    namespace,
    providerId: 'openai',
    providerModelId,
    namespacedId: `${namespace}/${providerModelId}`,
    origin: 'cascade',
    cascadeIndex: 0,
  };
}

function service(state: Partial<CredentialServiceState>): CredentialServiceState {
  return { lockedUntil: null, quotaExhaustedUntil: null, ...state };
}

const NOW = 1_000_000;

function decide(attempts: readonly RoutingAttempt[], state: RoutingState) {
  return applyServiceState({ attempts, state, now: NOW });
}

describe('the state a credential is in', () => {
  it('keeps a credential the gateway knows nothing about, because an unknown quota is unknown', () => {
    const verdict = decide([attempt('raul', 'gpt-6-luna')], emptyRoutingState());

    assert.equal(verdict.attempts.length, 1);
    assert.deepEqual(verdict.skipped, []);
  });

  it('skips a locked credential with its reason and keeps the rest in order', () => {
    const state: RoutingState = {
      services: new Map([['id-raul', service({ lockedUntil: NOW + 60_000 })]]),
    };

    const verdict = decide(
      [attempt('raul', 'gpt-6-luna'), attempt('openai-b', 'gpt-5.6-terra')],
      state,
    );

    assert.deepEqual(
      verdict.attempts.map((value) => value.namespace),
      ['openai-b'],
    );
    assert.deepEqual(
      verdict.skipped.map((value) => [value.attempt.namespace, value.reason]),
      [['raul', 'locked_out']],
    );
  });

  it('skips a credential whose quota window is exhausted', () => {
    const state: RoutingState = {
      services: new Map([['id-raul', service({ quotaExhaustedUntil: NOW + 1 })]]),
    };

    const verdict = decide([attempt('raul', 'gpt-6-luna')], state);

    assert.deepEqual(verdict.attempts, []);
    assert.deepEqual(
      verdict.skipped.map((value) => value.reason),
      ['quota_exhausted'],
    );
  });

  it('puts a credential back in service the moment its bounds pass', () => {
    const state: RoutingState = {
      services: new Map([
        ['id-raul', service({ lockedUntil: NOW - 1, quotaExhaustedUntil: NOW })],
      ]),
    };

    const verdict = decide([attempt('raul', 'gpt-6-luna')], state);

    assert.equal(verdict.attempts.length, 1);
    assert.deepEqual(verdict.skipped, []);
  });

  it('reports a lockout as the reason when a credential is in both states', () => {
    const state: RoutingState = {
      services: new Map([
        ['id-raul', service({ lockedUntil: NOW + 1, quotaExhaustedUntil: NOW + 1 })],
      ]),
    };

    const verdict = decide([attempt('raul', 'gpt-6-luna')], state);

    assert.deepEqual(
      verdict.skipped.map((value) => value.reason),
      ['locked_out'],
    );
  });

  it('never reorders: what it keeps, it keeps in the order it received', () => {
    const state: RoutingState = {
      services: new Map([['id-anthropic-1', service({ lockedUntil: NOW + 1 })]]),
    };

    const verdict = decide(
      [
        attempt('raul', 'gpt-6-luna'),
        attempt('anthropic-1', 'claude-sonnet-5.5'),
        attempt('openai-b', 'gpt-5.6-terra'),
      ],
      state,
    );

    assert.deepEqual(
      verdict.attempts.map((value) => value.namespace),
      ['raul', 'openai-b'],
    );
  });
});