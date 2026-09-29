import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { ProviderFailure } from '../../../types/provider.js';
import type { ProtocolRequestTarget } from '../protocol-adapter.js';
import { GeminiAdapter } from './gemini.adapter.js';

const SECRET = 'kr-secret-9f8e7d6c';

interface StubServer {
  readonly baseUrl: string;
  readonly requests: { readonly url: string; readonly headers: IncomingMessage['headers'] }[];
  close(): Promise<void>;
}

async function startStub(respond: (response: ServerResponse) => void): Promise<StubServer> {
  const requests: StubServer['requests'][number][] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push({ url: request.url ?? '', headers: request.headers });
    respond(response);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the stub server did not expose a port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

const servers: StubServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function stub(body: string, status = 200): Promise<StubServer> {
  const server = await startStub((response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body);
  });

  servers.push(server);

  return server;
}

function target(baseUrl: string, extra: Partial<ProtocolRequestTarget> = {}): ProtocolRequestTarget {
  return {
    providerId: 'gemini',
    label: 'Gemini',
    authKind: 'none',
    baseUrl,
    auth: { authType: 'x-api-key', authHeader: 'x-goog-api-key', secret: SECRET },
    ...extra,
  };
}

const MODELS_PAYLOAD = JSON.stringify({
  models: [
    { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', inputTokenLimit: 1048576 },
    { name: 'models/gemini-3.8-flash' },
  ],
});

async function captureFailure(run: () => Promise<unknown>): Promise<ProviderFailure> {
  let failure: unknown;
  try {
    await run();
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof ProviderFailure, 'the adapter was expected to throw ProviderFailure');
  return failure;
}

describe('GeminiAdapter', () => {
  it('validates against the model collection the base URL names', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new GeminiAdapter({ now: () => 13 });

    const result = await adapter.validateCredential(target(`${server.baseUrl}/v1beta/models`));

    assert.deepEqual(result, { ok: true, detail: 'Gemini answered GET /v1beta/models', validatedAt: 13 });
    assert.equal(server.requests[0]?.headers['x-goog-api-key'], SECRET);
  });

  it('places the credential in the query when the catalog declares the query scheme', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new GeminiAdapter();

    await adapter.validateCredential(
      target(`${server.baseUrl}/v1beta/models`, { auth: { authType: 'query', secret: SECRET } }),
    );

    assert.equal(server.requests[0]?.url, `/v1beta/models?key=${SECRET}`);
    assert.equal(server.requests[0]?.headers['x-goog-api-key'], undefined);
  });

  it('discovers the models Gemini reports, with the bare id a client sends', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new GeminiAdapter();

    const models = await adapter.discoverCatalog(target(`${server.baseUrl}/v1beta/models`));

    assert.deepEqual(models, [
      {
        providerModelId: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        sizeBytes: null,
        family: null,
        providerModifiedAt: null,
      },
      {
        providerModelId: 'gemini-3.8-flash',
        displayName: 'models/gemini-3.8-flash',
        sizeBytes: null,
        family: null,
        providerModifiedAt: null,
      },
    ]);
  });

  it('reports a rejected credential as unauthorized, without quoting the secret', async () => {
    const server = await stub(JSON.stringify({ error: { code: 401 } }), 401);
    const adapter = new GeminiAdapter();

    const failure = await captureFailure(() =>
      adapter.validateCredential(target(`${server.baseUrl}/v1beta/models`)),
    );

    assert.equal(failure.kind, 'unauthorized');
    assert.equal(failure.message, 'Gemini rejected GET /v1beta/models with HTTP 401');
    assert.equal(failure.message.includes(SECRET), false);
  });

  it('reports an unexpected payload as invalid_response, naming the broken field only', async () => {
    const server = await stub(JSON.stringify({ models: [{ displayName: 'no name' }] }));
    const adapter = new GeminiAdapter();

    const failure = await captureFailure(() =>
      adapter.discoverCatalog(target(`${server.baseUrl}/v1beta/models`)),
    );

    assert.equal(failure.kind, 'invalid_response');
    assert.match(failure.message, /\(models\.0\.name\)/);
  });

  it('refuses a base URL that is not an absolute http or https URL, before any request', async () => {
    let calls = 0;
    const adapter = new GeminiAdapter({
      fetch: () => {
        calls += 1;

        return Promise.reject(new Error('fetch must not be called'));
      },
    });

    const failure = await captureFailure(() => adapter.discoverCatalog(target('ftp://generativelanguage.test')));

    assert.equal(calls, 0);
    assert.equal(failure.message, 'Gemini base URL must be an absolute http or https URL');
  });
});
