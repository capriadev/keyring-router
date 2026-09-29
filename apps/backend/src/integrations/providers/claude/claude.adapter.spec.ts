import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { ProviderFailure } from '../../../types/provider.js';
import { randomSecret } from '../../../dal/testing/secret-fixtures.js';
import type { ProtocolRequestTarget } from '../protocol-adapter.js';
import { ClaudeAdapter } from './claude.adapter.js';

/** Generated at run time by the shared fixture module: no spec declares a secret of its own. */
const SECRET = randomSecret();

interface StubRequest {
  readonly url: string;
  readonly headers: IncomingMessage['headers'];
}

interface StubServer {
  readonly baseUrl: string;
  readonly requests: StubRequest[];
  close(): Promise<void>;
}

/** In-process loopback stub on an ephemeral port: the only socket a test may open. */
async function startStub(respond: (response: ServerResponse) => void): Promise<StubServer> {
  const requests: StubRequest[] = [];
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
    providerId: 'anthropic',
    label: 'Anthropic',
    authKind: 'none',
    baseUrl,
    headers: { 'Anthropic-Version': '2023-06-01' },
    auth: { authType: 'x-api-key', secret: SECRET },
    ...extra,
  };
}

const MODELS_PAYLOAD = JSON.stringify({
  data: [
    { type: 'model', id: 'claude-opus-5', display_name: 'Claude Opus 5', created_at: '2026-01-05T00:00:00Z' },
    { type: 'model', id: 'claude-haiku-4.5' },
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

describe('ClaudeAdapter', () => {
  it('validates against the model list beside the messages endpoint, naming the URL it called', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new ClaudeAdapter({ now: () => 11 });

    const result = await adapter.validateCredential(target(`${server.baseUrl}/v1/messages`));

    assert.deepEqual(result, {
      ok: true,
      detail: `Anthropic answered GET ${server.baseUrl}/v1/models`,
      validatedAt: 11,
    });
    assert.equal(server.requests[0]?.url, '/v1/models');
  });

  it('completes a base URL that is only a host with the path the format documents', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new ClaudeAdapter();

    await adapter.validateCredential(target(server.baseUrl));

    assert.equal(server.requests[0]?.url, '/v1/models');
  });

  it('calls the model list without the query a catalog entry declares for its chat endpoint', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new ClaudeAdapter();

    await adapter.validateCredential(
      target(`${server.baseUrl}/v1/messages`, { urlSuffix: '?api-version=7' }),
    );

    assert.equal(server.requests[0]?.url, '/v1/models');
  });

  it('refuses a base URL that embeds a credential, before any request', async () => {
    let calls = 0;
    const adapter = new ClaudeAdapter({
      fetch: () => {
        calls += 1;

        return Promise.reject(new Error('fetch must not be called'));
      },
    });

    const failure = await captureFailure(() =>
      adapter.validateCredential(target(`http://user:${SECRET}@127.0.0.1:9/v1/messages`)),
    );

    assert.equal(calls, 0);
    assert.equal(failure.kind, 'unknown');
    assert.equal(
      failure.message,
      'Anthropic base URL must not embed a credential: store it as the credential secret instead',
    );
    assert.equal(failure.message.includes(SECRET), false);
  });

  it('sends the credential in the header the catalog declares, plus its own protocol headers', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new ClaudeAdapter();

    await adapter.validateCredential(target(`${server.baseUrl}/v1/messages`));

    assert.equal(server.requests[0]?.headers['x-api-key'], SECRET);
    assert.equal(server.requests[0]?.headers['anthropic-version'], '2023-06-01');
    assert.equal(server.requests[0]?.headers.authorization, undefined);
  });

  it('discovers the models Anthropic compatible endpoints report', async () => {
    const server = await stub(MODELS_PAYLOAD);
    const adapter = new ClaudeAdapter();

    const models = await adapter.discoverCatalog(target(`${server.baseUrl}/v1/messages`));

    assert.deepEqual(models, [
      {
        providerModelId: 'claude-opus-5',
        displayName: 'Claude Opus 5',
        sizeBytes: null,
        family: null,
        providerModifiedAt: '2026-01-05T00:00:00Z',
      },
      {
        providerModelId: 'claude-haiku-4.5',
        displayName: 'claude-haiku-4.5',
        sizeBytes: null,
        family: null,
        providerModifiedAt: null,
      },
    ]);
  });

  it('reports a rejected credential as unauthorized, without quoting the secret', async () => {
    const server = await stub(JSON.stringify({ error: 'authentication_error' }), 401);
    const adapter = new ClaudeAdapter();

    const failure = await captureFailure(() =>
      adapter.validateCredential(target(`${server.baseUrl}/v1/messages`)),
    );

    assert.equal(failure.kind, 'unauthorized');
    assert.equal(failure.message, `Anthropic rejected GET ${server.baseUrl}/v1/models with HTTP 401`);
    assert.equal(failure.message.includes(SECRET), false);
  });

  it('reports a gateway without a model list as a provider failure, not as an empty catalog', async () => {
    const server = await stub(JSON.stringify({ type: 'error', error: { type: 'not_found' } }), 404);
    const adapter = new ClaudeAdapter();

    const failure = await captureFailure(() =>
      adapter.discoverCatalog(target(`${server.baseUrl}/v1/messages`)),
    );

    assert.equal(failure.kind, 'unknown');
    assert.equal(failure.message, `Anthropic answered GET ${server.baseUrl}/v1/models with HTTP 404`);
  });

  it('reports an unexpected payload as invalid_response, naming the broken field only', async () => {
    const server = await stub(JSON.stringify({ data: [{ display_name: 'no id' }] }));
    const adapter = new ClaudeAdapter();

    const failure = await captureFailure(() =>
      adapter.discoverCatalog(target(`${server.baseUrl}/v1/messages`)),
    );

    assert.equal(failure.kind, 'invalid_response');
    assert.match(failure.message, /\(data\.0\.id\)/);
  });
});

