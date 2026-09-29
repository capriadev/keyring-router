import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import { ProviderFailure, type AdapterTarget } from '../../../types/provider.js';
import { OllamaAdapter, type ProviderFetch } from './ollama.adapter.js';

const SECRET = 'kr-secret-9f8e7d6c';
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
    requests.push({
      method: request.method ?? '',
      url: request.url ?? '',
      headers: request.headers,
    });
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

async function serveJson(body: string, status = 200): Promise<StubServer> {
  return startStub((_path, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body);
  });
}

function target(baseUrl: string, extra: Partial<AdapterTarget> = {}): AdapterTarget {
  return { baseUrl, authKind: 'none', ...extra };
}

/** A fetch stub that never opens a socket; the adapter reads `status` and `text()` only. */
function bodyFetch(status: number, readBody: () => Promise<string>): ProviderFetch {
  return async () => ({ status, text: readBody });
}

/** Binds and releases a loopback port so the following connection is refused for real. */
async function unusedBaseUrl(): Promise<string> {
  const stub = await startStub((_path, response) => {
    response.end();
  });
  const baseUrl = stub.baseUrl;
  await stub.close();
  return baseUrl;
}

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

function assertSecretFree(failure: ProviderFailure, forbidden: readonly string[]): void {
  for (const value of forbidden) {
    assert.equal(
      failure.message.includes(value),
      false,
      `the failure message leaked "${value}": ${failure.message}`,
    );
  }
}

const TAGS_PAYLOAD = JSON.stringify({
  models: [
    {
      name: 'gemma4',
      model: 'gemma4',
      modified_at: '2025-10-03T23:34:03.409490317-07:00',
      size: 9608350245,
      digest: 'c6eb396dbd5992bbe3f5cdb947e8bbc0ee413d7c17e2beaae69f5d569cf982eb',
      details: {
        format: 'gguf',
        family: 'gemma4',
        families: ['gemma4'],
        parameter_size: '8.0B',
        quantization_level: 'Q4_K_M',
      },
    },
    { model: 'qwen2.5:7b', modified_at: 'yesterday', size: null, details: { format: 'gguf' } },
    { name: 'llama3.2:latest', size: 0, details: null },
  ],
});

describe('OllamaAdapter', () => {
  describe('validateCredential', () => {
    it('reaches GET /api/version on the given base URL', async () => {
      const stub = await serveJson(JSON.stringify({ version: '0.20.0' }));

      try {
        const adapter = new OllamaAdapter({ now: () => 1_700_000_000_000 });
        const result = await adapter.validateCredential(target(stub.baseUrl));

        assert.equal(result.ok, true);
        assert.equal(result.detail, 'Ollama 0.20.0 reachable over GET /api/version');
        assert.equal(result.validatedAt, 1_700_000_000_000);
        assert.deepEqual(
          stub.requests.map((request) => `${request.method} ${request.url}`),
          ['GET /api/version'],
        );
        // authKind 'none': nothing credential-shaped may leave the adapter.
        assert.equal(stub.requests[0]?.headers.authorization, undefined);
      } finally {
        await stub.close();
      }
    });

    it('rejects a version payload without a version field', async () => {
      const stub = await serveJson(JSON.stringify({ version: 12 }));

      try {
        const failure = await captureFailure(() =>
          new OllamaAdapter().validateCredential(target(stub.baseUrl)),
        );

        assert.equal(failure.kind, 'invalid_response');
        assert.equal(failure.providerId, 'ollama');
        assert.match(failure.message, /invalid payload for GET \/api\/version \(version\)/);
      } finally {
        await stub.close();
      }
    });
  });

  describe('discoverCatalog', () => {
    it('discovers and normalizes the catalog against a loopback stub', async () => {
      const stub = await serveJson(TAGS_PAYLOAD);

      try {
        const adapter = new OllamaAdapter();
        const records = await adapter.discoverCatalog(target(stub.baseUrl));

        assert.deepEqual(records, [
          {
            providerModelId: 'gemma4',
            displayName: 'gemma4',
            sizeBytes: 9608350245,
            family: 'gemma4',
            providerModifiedAt: '2025-10-04T06:34:03.409Z',
          },
          {
            providerModelId: 'qwen2.5:7b',
            displayName: 'qwen2.5:7b',
            sizeBytes: null,
            family: null,
            providerModifiedAt: null,
          },
          {
            providerModelId: 'llama3.2:latest',
            displayName: 'llama3.2:latest',
            sizeBytes: 0,
            family: null,
            providerModifiedAt: null,
          },
        ]);
        assert.deepEqual(
          stub.requests.map((request) => `${request.method} ${request.url}`),
          ['GET /api/tags'],
        );
        assert.equal(stub.requests[0]?.headers.authorization, undefined);
      } finally {
        await stub.close();
      }
    });

    it('tolerates a trailing slash on the base URL', async () => {
      const stub = await serveJson(TAGS_PAYLOAD);

      try {
        const adapter = new OllamaAdapter();
        const records = await adapter.discoverCatalog(target(`${stub.baseUrl}/`));

        assert.equal(records.length, 3);
        assert.equal(stub.requests[0]?.url, '/api/tags');
      } finally {
        await stub.close();
      }
    });
  });

  describe('failures', () => {
    it('maps a non-JSON body to invalid_response', async () => {
      const stub = await serveJson(`<html>${BODY_MARKER}</html>`);

      try {
        const failure = await captureFailure(() =>
          new OllamaAdapter().discoverCatalog(target(stub.baseUrl)),
        );

        assert.equal(failure.kind, 'invalid_response');
        assert.equal(failure.message, 'Ollama did not return JSON for GET /api/tags');
        assertSecretFree(failure, [BODY_MARKER]);
      } finally {
        await stub.close();
      }
    });

    it('maps a payload with the wrong shape to invalid_response', async () => {
      const stub = await serveJson(JSON.stringify({ models: `${BODY_MARKER}-not-an-array` }));

      try {
        const failure = await captureFailure(() =>
          new OllamaAdapter().discoverCatalog(target(stub.baseUrl)),
        );

        assert.equal(failure.kind, 'invalid_response');
        assert.equal(failure.message, 'Ollama returned an invalid payload for GET /api/tags (models)');
        assertSecretFree(failure, [BODY_MARKER]);
      } finally {
        await stub.close();
      }
    });

    it('maps a model entry without an identifier to invalid_response', async () => {
      const stub = await serveJson(JSON.stringify({ models: [{ size: 1024 }] }));

      try {
        const failure = await captureFailure(() =>
          new OllamaAdapter().discoverCatalog(target(stub.baseUrl)),
        );

        assert.equal(failure.kind, 'invalid_response');
        // A cross-field rule has no single field to blame, so Zod reports the entry index.
        assert.equal(
          failure.message,
          'Ollama returned an invalid payload for GET /api/tags (models.0)',
        );
      } finally {
        await stub.close();
      }
    });

    it('maps a mistyped model field to invalid_response naming only the field', async () => {
      const stub = await serveJson(JSON.stringify({ models: [{ name: 'gemma4', size: 'big' }] }));

      try {
        const failure = await captureFailure(() =>
          new OllamaAdapter().discoverCatalog(target(stub.baseUrl)),
        );

        assert.equal(failure.kind, 'invalid_response');
        assert.equal(
          failure.message,
          'Ollama returned an invalid payload for GET /api/tags (models.0.size)',
        );
        assertSecretFree(failure, ['big']);
      } finally {
        await stub.close();
      }
    });

    it('maps HTTP 401 and 403 to unauthorized and leaks nothing', async () => {
      for (const status of [401, 403]) {
        const stub = await startStub((_path, response) => {
          response.writeHead(status, {
            'content-type': 'application/json',
            'www-authenticate': `Bearer ${SECRET}`,
            'x-kr-debug': SECRET,
          });
          response.end(JSON.stringify({ error: `${BODY_MARKER} ${SECRET}` }));
        });

        try {
          const failure = await captureFailure(() =>
            new OllamaAdapter().discoverCatalog(
              target(stub.baseUrl, { authKind: 'none', secret: SECRET }),
            ),
          );

          assert.equal(failure.kind, 'unauthorized');
          assert.equal(failure.message, `Ollama rejected GET /api/tags with HTTP ${status}`);
          assertSecretFree(failure, [
            SECRET,
            BODY_MARKER,
            'www-authenticate',
            'x-kr-debug',
            'Bearer',
            stub.baseUrl,
          ]);
          assert.equal(JSON.stringify(failure).includes(SECRET), false);
          assert.equal(String(failure).includes(SECRET), false);
          // The secret the target carries is never sent either.
          assert.equal(JSON.stringify(stub.requests[0]?.headers).includes(SECRET), false);
        } finally {
          await stub.close();
        }
      }
    });

    it('maps an unexpected status to unknown', async () => {
      const stub = await serveJson(JSON.stringify({ error: BODY_MARKER }), 503);

      try {
        const failure = await captureFailure(() =>
          new OllamaAdapter().discoverCatalog(target(stub.baseUrl)),
        );

        assert.equal(failure.kind, 'unknown');
        assert.equal(failure.message, 'Ollama answered GET /api/tags with HTTP 503');
        assertSecretFree(failure, [BODY_MARKER]);
      } finally {
        await stub.close();
      }
    });

    it('maps an unreadable body to invalid_response', async () => {
      const adapter = new OllamaAdapter({
        fetch: bodyFetch(200, () => Promise.reject(new Error(`socket closed ${SECRET}`))),
      });

      const failure = await captureFailure(() =>
        adapter.discoverCatalog(target('http://127.0.0.1:11434')),
      );

      assert.equal(failure.kind, 'invalid_response');
      assert.equal(failure.message, 'Ollama sent an unreadable body for GET /api/tags');
      assertSecretFree(failure, [SECRET]);
    });

    it('maps a connection refused by a real loopback port to unreachable', async () => {
      const baseUrl = await unusedBaseUrl();
      const failure = await captureFailure(() =>
        new OllamaAdapter().discoverCatalog(target(baseUrl)),
      );

      assert.equal(failure.kind, 'unreachable');
      assert.equal(failure.message, 'Ollama did not answer GET /api/tags');
      assertSecretFree(failure, [baseUrl]);
    });

    it('maps a rejected fetch implementation to unreachable without quoting it', async () => {
      const adapter = new OllamaAdapter({
        fetch: () => Promise.reject(new Error(`connect ECONNREFUSED ${SECRET} at ${BODY_MARKER}`)),
      });

      const failure = await captureFailure(() =>
        adapter.validateCredential(target('http://127.0.0.1:11434')),
      );

      assert.equal(failure.kind, 'unreachable');
      assert.equal(failure.message, 'Ollama did not answer GET /api/version');
      assertSecretFree(failure, [SECRET, BODY_MARKER, 'ECONNREFUSED', '11434']);
    });

    it('maps a timeout to unreachable and always hands an abort signal to fetch', async () => {
      let signalled: AbortSignal | undefined;
      const adapter = new OllamaAdapter({
        timeoutMs: 20,
        fetch: (_url, init) => {
          signalled = init.signal;
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new Error('The operation was aborted'));
            });
          });
        },
      });

      const failure = await captureFailure(() =>
        adapter.discoverCatalog(target('http://127.0.0.1:11434')),
      );

      assert.ok(signalled instanceof AbortSignal);
      assert.equal(signalled.aborted, true);
      assert.equal(failure.kind, 'unreachable');
      assert.equal(failure.message, 'Ollama did not answer GET /api/tags');
    });

    it('rejects an authKind it cannot serve before any request', async () => {
      let calls = 0;
      const adapter = new OllamaAdapter({
        fetch: () => {
          calls += 1;
          return Promise.reject(new Error('fetch must not be called'));
        },
      });

      const failure = await captureFailure(() =>
        adapter.validateCredential(
          target('http://127.0.0.1:11434', { authKind: 'api_key', secret: SECRET }),
        ),
      );

      assert.equal(calls, 0);
      assert.equal(failure.kind, 'unknown');
      assert.equal(failure.message, 'Ollama does not support authKind api_key');
      assertSecretFree(failure, [SECRET]);
    });

    it('rejects a base URL that is not an absolute http or https URL', async () => {
      let calls = 0;
      const adapter = new OllamaAdapter({
        fetch: () => {
          calls += 1;
          return Promise.reject(new Error('fetch must not be called'));
        },
      });

      for (const baseUrl of ['', 'not-a-url', 'ftp://127.0.0.1:11434', 'http://127.0.0.1:11434?x=1']) {
        const failure = await captureFailure(() => adapter.discoverCatalog(target(baseUrl)));

        assert.equal(failure.kind, 'unknown');
        assert.equal(
          failure.message,
          'Ollama base URL must be an absolute http or https URL without query or fragment',
        );
        assertSecretFree(failure, ['not-a-url', '127.0.0.1', 'ftp']);
      }

      assert.equal(calls, 0);
    });
  });
});



