import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProviderFailure, type ProviderErrorKind } from '../../types/provider.js';
import { DEFAULT_TIMEOUT_MS, requestJson, type ProviderFetch } from './http.js';

const fail = (kind: ProviderErrorKind, message: string): ProviderFailure =>
  new ProviderFailure('probe' as never, kind, message);

/** One reading call, with the fetch the test injects and the budget it asks for. */
function call(fetch: ProviderFetch, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  return requestJson({
    label: 'Ollama',
    operation: 'GET /api/tags',
    url: 'http://127.0.0.1:11434/api/tags',
    ...(signal === undefined ? {} : { signal }),
    fetch,
    timeoutMs,
    fail,
  });
}

/** A provider that accepts the connection and then says nothing, so the signal is what ends the wait. */
const hanging: ProviderFetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('the wait ended')), { once: true });
  });

async function failureOf(work: Promise<unknown>): Promise<ProviderFailure> {
  const failure = await work.then(
    () => null,
    (error: unknown) => error,
  );

  assert.ok(failure instanceof ProviderFailure, 'se esperaba un ProviderFailure');

  return failure;
}

describe('a failed provider call', () => {
  it('reports the client that stopped the call as aborted, not as an unreachable provider', async () => {
    const controller = new AbortController();
    const pending = call(hanging, controller.signal);

    controller.abort();

    const failure = await failureOf(pending);

    assert.equal(failure.kind, 'aborted');
    assert.equal(failure.message, 'the client stopped GET /api/tags');
    assert.equal(failure.message.includes('did not answer'), false);
    assert.equal(failure.message.includes('127.0.0.1'), false);
  });

  it('keeps saying the provider did not answer when the provider is what failed', async () => {
    const refused: ProviderFetch = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    const failure = await failureOf(call(refused));

    assert.equal(failure.kind, 'unreachable');
    assert.equal(failure.message, 'Ollama did not answer GET /api/tags');
    assert.equal(failure.message.includes('ECONNREFUSED'), false);
  });

  it('does not turn a budget that ran out into a client abort', async () => {
    const failure = await failureOf(call(hanging, undefined, 20));

    assert.equal(failure.kind, 'unreachable');
    assert.equal(failure.message, 'Ollama did not answer GET /api/tags');
  });
});
