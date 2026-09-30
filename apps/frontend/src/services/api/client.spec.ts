import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { ApiError, describeApiError, requestJson } from './client';

/** The last URL and init the client issued, so a test can read what would have been sent. */
interface Captured {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

let captured: Captured[] = [];
const realFetch = globalThis.fetch;

/** Replaces the global fetch for one test: the client is the only module that reaches the network. */
function stubFetch(respond: () => Response | Promise<Response>): void {
  captured = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(input), init });

    return await respond();
  }) as typeof fetch;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('requestJson', () => {
  it('returns the parsed body of a successful answer', async () => {
    stubFetch(() => jsonResponse(200, { status: 'ok', version: '0.0.0', uptimeSeconds: 3 }));

    const body = await requestJson<{ status: string }>('/api/health');

    assert.equal(body.status, 'ok');
    assert.equal(captured.length, 1);
    assert.ok(captured[0].url.endsWith('/api/health'));
  });

  it('sends a POST body as JSON and reads nothing else from the caller', async () => {
    stubFetch(() => jsonResponse(201, { id: 'credential-1' }));

    await requestJson('/api/credentials', { method: 'POST', body: { namespace: 'local-main' } });

    assert.equal(captured[0].init?.method, 'POST');
    assert.deepEqual(captured[0].init?.headers, { 'content-type': 'application/json' });
    assert.equal(captured[0].init?.body, JSON.stringify({ namespace: 'local-main' }));
  });

  it('reports a transport failure as a network error with no status', async () => {
    stubFetch(() => {
      throw new Error('connection refused');
    });

    const failure = await requestJson('/api/health').then(
      () => null,
      (error: unknown) => error,
    );

    assert.ok(failure instanceof ApiError);
    assert.equal(failure.code, 'network_error');
    assert.equal(failure.status, 0);
  });

  it('keeps the stable code the gateway sent with the failure', async () => {
    stubFetch(() => jsonResponse(409, { error: { code: 'namespace_taken', message: 'taken' } }));

    const failure = await requestJson('/api/credentials').then(
      () => null,
      (error: unknown) => error,
    );

    assert.ok(failure instanceof ApiError);
    assert.equal(failure.code, 'namespace_taken');
    assert.equal(failure.status, 409);
    assert.equal(failure.detail, 'taken');
  });

  it('ignores a code the client does not know and maps the status instead', async () => {
    stubFetch(() => jsonResponse(404, { error: { code: 'invented_by_a_proxy', message: 'nope' } }));

    const failure = await requestJson('/api/health').then(
      () => null,
      (error: unknown) => error,
    );

    assert.ok(failure instanceof ApiError);
    assert.equal(failure.code, 'route_not_found');
  });

  it('maps a failure whose body is not JSON by its status', async () => {
    stubFetch(() => new Response('<html>bad gateway</html>', { status: 502 }));

    const failure = await requestJson('/api/health').then(
      () => null,
      (error: unknown) => error,
    );

    assert.ok(failure instanceof ApiError);
    assert.equal(failure.code, 'internal_error');
  });

  it('reports an answer it cannot parse as an unreadable response', async () => {
    stubFetch(() => new Response('not json', { status: 200 }));

    const failure = await requestJson('/api/health').then(
      () => null,
      (error: unknown) => error,
    );

    assert.ok(failure instanceof ApiError);
    assert.equal(failure.code, 'unreadable_response');
    assert.equal(failure.status, 200);
  });
});

describe('describeApiError', () => {
  it('translates every code it knows into a message that says what happened', () => {
    const failure = new ApiError(409, 'namespace_taken', 'namespace already used');

    assert.match(describeApiError(failure), /namespace/);
  });

  it('falls back to a message of its own for a value that is not an ApiError', () => {
    assert.match(describeApiError(new Error('boom')), /gateway/);
    assert.match(describeApiError('not even an error'), /gateway/);
  });
});
