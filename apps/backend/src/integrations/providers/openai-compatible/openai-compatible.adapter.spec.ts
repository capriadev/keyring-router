import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { ProviderFailure } from '../../../types/provider.js';
import { randomSecret } from '../../../dal/testing/secret-fixtures.js';
import type { ProtocolRequestTarget } from '../protocol-adapter.js';
import { OpenAiCompatibleAdapter } from './openai-compatible.adapter.js';

/** Generated at run time by the shared fixture module: no spec declares a secret of its own. */
const SECRET = randomSecret();
const BODY_MARKER = 'raw-provider-body-marker';

interface StubRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage['headers'];
}

interface StubServer {
  readonly baseUrl: string;
  readonly requests: StubRequest[];
  close(): Promise<void>;
}

/** In-process loopback stub on an ephemeral port: the only socket a test may open. */
async function startStub(
  respond: (path: string, response: ServerResponse) => void,
): Promise<StubServer> {
  const requests: StubRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers });
    respond(request.url ?? '', response);
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
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

function serveJson(body: string, status = 200): Promise<StubServer> {
  return startStub((_path, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body);
  });
}

function target(baseUrl: string, extra: Partial<ProtocolRequestTarget> = {}): ProtocolRequestTarget {
  return {
    providerId: 'groq',
    label: 'Groq',
    authKind: 'none',
    baseUrl,
    auth: { authType: 'bearer', secret: SECRET },
    ...extra,
  };
}

const MODELS_PAYLOAD = JSON.stringify({
  data: [
    { id: 'llama-3.3-70b-versatile', created: 1_700_000_000, owned_by: 'meta' },
    { id: 'groq/compound' },
  ],
  object: 'list',
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

const servers: StubServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function stub(body: string, status = 200): Promise<StubServer> {
  const server = await serveJson(body, status);
  servers.push(server);

  return server;
}

describe('OpenAiCompatibleAdapter', () => {
  it('validates against the model list next to the chat endpoint, naming the URL it called', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new OpenAiCompatibleAdapter({ now: () => 7 });

    const result = await adapter.validateCredential(target(`${server.baseUrl}/v1/chat/completions`));

    assert.deepEqual(result, {
      ok: true,
      detail: `Groq answered GET ${server.baseUrl}/v1/models`,
      validatedAt: 7,
    });
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0]?.method, 'GET');
    assert.equal(server.requests[0]?.url, '/v1/models');
  });

  it('sends the credential as an Authorization header, and a catalog header alongside it', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new OpenAiCompatibleAdapter();

    await adapter.validateCredential(
      target(`${server.baseUrl}/v1/chat/completions`, { headers: { 'X-Catalog-Header': 'from the catalog' } }),
    );

    assert.equal(server.requests[0]?.headers.authorization, `Bearer ${SECRET}`);
    assert.equal(server.requests[0]?.headers['x-catalog-header'], 'from the catalog');
  });

  it('sends no credential while no secret exists', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new OpenAiCompatibleAdapter();

    await adapter.validateCredential(
      target(`${server.baseUrl}/v1/chat/completions`, { auth: { authType: 'bearer' } }),
    );

    assert.equal(server.requests[0]?.headers.authorization, undefined);
  });

  it('completes a bare base URL and keeps a catalog suffix on the call', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new OpenAiCompatibleAdapter();

    await adapter.validateCredential(target(server.baseUrl));
    await adapter.validateCredential(target(`${server.baseUrl}/v1`, { urlSuffix: '?api-version=7' }));

    assert.deepEqual(
      server.requests.map((request) => request.url),
      ['/v1/models', '/v1/models?api-version=7'],
    );
  });

  it('discovers the models a gateway reports, normalized and secret free', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new OpenAiCompatibleAdapter();

    const models = await adapter.discoverCatalog(target(`${server.baseUrl}/v1/chat/completions`));

    assert.deepEqual(models, [
      {
        providerModelId: 'llama-3.3-70b-versatile',
        displayName: 'llama-3.3-70b-versatile',
        sizeBytes: null,
        family: 'meta',
        providerModifiedAt: new Date(1_700_000_000_000).toISOString(),
      },
      {
        providerModelId: 'groq/compound',
        displayName: 'groq/compound',
        sizeBytes: null,
        family: null,
        providerModifiedAt: null,
      },
    ]);
  });

  it('reports a rejected credential as unauthorized without quoting the secret', async () => {
    const server = await stub(JSON.stringify({ error: 'invalid api key' }), 401);
    const adapter = new OpenAiCompatibleAdapter();

    const failure = await captureFailure(() =>
      adapter.validateCredential(target(`${server.baseUrl}/v1/chat/completions`)),
    );

    assert.equal(failure.kind, 'unauthorized');
    assert.equal(failure.providerId, 'groq');
    assert.equal(failure.message, `Groq rejected GET ${server.baseUrl}/v1/models with HTTP 401`);
    assert.equal(failure.message.includes(SECRET), false);
    // The endpoint is named in full; only the credential stays out of it.
    assert.equal(failure.message.includes(server.baseUrl), true);
  });

  it('reports an unexpected payload as invalid_response, naming the broken field only', async () => {
    const server = await stub(JSON.stringify({ data: [{ display_name: BODY_MARKER }] }));
    const adapter = new OpenAiCompatibleAdapter();

    const failure = await captureFailure(() =>
      adapter.discoverCatalog(target(`${server.baseUrl}/v1/chat/completions`)),
    );

    assert.equal(failure.kind, 'invalid_response');
    assert.match(
      failure.message,
      new RegExp(`Groq returned an invalid payload for GET ${server.baseUrl}/v1/models \\(data\\.0\\.id\\)`),
    );
    assert.equal(failure.message.includes(BODY_MARKER), false);
  });

  it('reports a non-JSON body as invalid_response', async () => {
    const server = await stub(`<html>${BODY_MARKER}</html>`);
    const adapter = new OpenAiCompatibleAdapter();

    const failure = await captureFailure(() =>
      adapter.validateCredential(target(`${server.baseUrl}/v1/chat/completions`)),
    );

    assert.equal(failure.kind, 'invalid_response');
    assert.equal(failure.message, `Groq did not return JSON for GET ${server.baseUrl}/v1/models`);
    assert.equal(failure.message.includes(BODY_MARKER), false);
  });

  it('reports an unanswered provider as unreachable, and always hands an abort signal to fetch', async () => {
    let signalled: AbortSignal | undefined;
    const adapter = new OpenAiCompatibleAdapter({
      timeoutMs: 20,
      fetch: (_url, init) => {
        signalled = init.signal;

        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error(`aborted at ${SECRET}`)));
        });
      },
    });

    const failure = await captureFailure(() =>
      adapter.discoverCatalog(target('http://127.0.0.1:11434/v1/chat/completions')),
    );

    assert.ok(signalled instanceof AbortSignal);
    assert.equal(signalled.aborted, true);
    assert.equal(failure.kind, 'unreachable');
    assert.equal(failure.message, 'Groq did not answer GET http://127.0.0.1:11434/v1/models');
    assert.equal(failure.message.includes(SECRET), false);
  });

  it('refuses a base URL that is not an absolute http or https URL, before any request', async () => {
    let calls = 0;
    const adapter = new OpenAiCompatibleAdapter({
      fetch: () => {
        calls += 1;

        return Promise.reject(new Error('fetch must not be called'));
      },
    });

    assert.equal(calls, 0);
    const empty = await captureFailure(() => adapter.discoverCatalog(target('')));

    assert.equal(empty.message, 'Groq has no base URL to call');

    for (const baseUrl of ['not-a-url', 'ftp://127.0.0.1/v1']) {
      const failure = await captureFailure(() => adapter.discoverCatalog(target(baseUrl)));

      assert.equal(failure.kind, 'unknown');
      assert.equal(failure.message, 'Groq base URL must be an absolute http or https URL');
    }

    assert.equal(calls, 0);
  });

  it('refuses a secret in a scheme that takes none, before any request', async () => {
    let calls = 0;
    const adapter = new OpenAiCompatibleAdapter({
      fetch: () => {
        calls += 1;

        return Promise.reject(new Error('fetch must not be called'));
      },
    });

    const failure = await captureFailure(() =>
      adapter.validateCredential(
        target('https://api.example.test/v1/chat/completions', {
          auth: { authType: 'none', secret: SECRET },
        }),
      ),
    );

    assert.equal(calls, 0);
    assert.equal(failure.kind, 'unknown');
    assert.equal(failure.message.includes(SECRET), false);
  });
});


