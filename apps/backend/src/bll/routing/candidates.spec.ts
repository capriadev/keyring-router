import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RoutingCandidate, RoutingMode } from '../../types/routing.js';
import { buildAttempts } from './candidates.js';

/** One exposed (credential, model) pair, named by the namespace so a failure reads clearly. */
function exposed(namespace: string, providerModelId: string, providerId = 'openai'): RoutingCandidate {
  return {
    credentialId: `id-${namespace}`,
    namespace,
    providerId,
    providerModelId,
    namespacedId: `${namespace}/${providerModelId}`,
  };
}

const EXPOSED: readonly RoutingCandidate[] = [
  exposed('raul', 'gpt-6-luna'),
  exposed('openai-b', 'gpt-5.6-terra'),
  exposed('anthropic-1', 'claude-sonnet-5.5', 'anthropic'),
  exposed('openai-c', 'gpt-5.6-terra'),
];

function order(mode: RoutingMode, cascade: readonly string[]): readonly string[] {
  return buildAttempts({
    mode,
    requested: { namespace: 'raul', providerModelId: 'gpt-6-luna' },
    cascade,
    exposed: EXPOSED,
  }).map((attempt) => `${attempt.namespace}/${attempt.providerModelId}`);
}

describe('the order of attempts for one request', () => {
  it('normal tries the named account and nothing else, whatever the cascade says', () => {
    assert.deepEqual(order('normal', ['claude-sonnet-5.5', 'gpt-5.6-terra']), ['raul/gpt-6-luna']);
  });

  it('auto_model follows the cascade in the order it was written', () => {
    // B is listed before C, so both credentials that expose B come before the one that exposes C.
    assert.deepEqual(order('auto_model', ['claude-sonnet-5.5', 'gpt-5.6-terra']), [
      'raul/gpt-6-luna',
      'anthropic-1/claude-sonnet-5.5',
      'openai-b/gpt-5.6-terra',
      'openai-c/gpt-5.6-terra',
    ]);
  });

  it("auto_model uses the owner's example: luna fails, there is no other luna, so it goes straight to C", () => {
    // Only C is listed, which is the case where the first fallback is what everything else falls to.
    assert.deepEqual(order('auto_model', ['gpt-5.6-terra']), [
      'raul/gpt-6-luna',
      'openai-b/gpt-5.6-terra',
      'openai-c/gpt-5.6-terra',
    ]);
  });

  it('auto_model never invents a target, so a credential outside the list is not tried', () => {
    const attempts = order('auto_model', ['claude-sonnet-5.5']);

    assert.equal(attempts.includes('openai-b/gpt-5.6-terra'), false);
    assert.equal(attempts.includes('openai-c/gpt-5.6-terra'), false);
  });

  it('auto_general reaches beyond the list once the list is exhausted', () => {
    const attempts = order('auto_general', ['claude-sonnet-5.5']);

    assert.deepEqual(attempts.slice(0, 2), ['raul/gpt-6-luna', 'anthropic-1/claude-sonnet-5.5']);
    assert.deepEqual([...attempts].sort(), [
      'anthropic-1/claude-sonnet-5.5',
      'openai-b/gpt-5.6-terra',
      'openai-c/gpt-5.6-terra',
      'raul/gpt-6-luna',
    ]);
  });

  it('documents who produced each attempt, so the order can be explained', () => {
    const attempts = buildAttempts({
      mode: 'auto_model',
      requested: { namespace: 'raul', providerModelId: 'gpt-6-luna' },
      cascade: ['claude-sonnet-5.5'],
      exposed: EXPOSED,
    });

    assert.deepEqual(
      attempts.map((attempt) => [attempt.namespace, attempt.origin, attempt.cascadeIndex]),
      [
        ['raul', 'requested', null],
        ['anthropic-1', 'cascade', 0],
      ],
    );
  });
});

describe('an entry of the cascade', () => {
  it('is matched as a provider model id, never split on a slash', () => {
    const slashy = exposed('openrouter-1', 'meta/llama-3');

    const attempts = buildAttempts({
      mode: 'auto_model',
      requested: { namespace: 'raul', providerModelId: 'gpt-6-luna' },
      // `meta` is not a namespace here, it is the first half of a provider model id.
      cascade: ['meta/llama-3'],
      exposed: [slashy],
    });

    assert.deepEqual(
      attempts.map((attempt) => attempt.namespacedId),
      ['openrouter-1/meta/llama-3'],
    );
  });

  it('never makes the same credential and model be tried twice', () => {
    const attempts = buildAttempts({
      mode: 'auto_model',
      requested: { namespace: 'raul', providerModelId: 'gpt-6-luna' },
      // The requested model repeated in the cascade must not duplicate the first attempt.
      cascade: ['gpt-6-luna'],
      exposed: EXPOSED,
    });

    assert.deepEqual(
      attempts.map((attempt) => `${attempt.namespace}/${attempt.providerModelId}`),
      ['raul/gpt-6-luna'],
    );
  });
});