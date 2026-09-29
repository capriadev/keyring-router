import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, it } from 'node:test';

import type { ProtocolRequestTarget } from '../protocol-adapter.js';
import { createOllamaProtocolAdapter } from './ollama.protocol-adapter.js';

interface StubServer {
  readonly baseUrl: string;
  readonly paths: string[];
  close(): Promise<void>;
}

async function startStub(): Promise<StubServer> {
  const paths: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    paths.push(request.url ?? '');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      request.url === '/api/version'
        ? JSON.stringify({ version: '0.12.0' })
        : JSON.stringify({ models: [{ name: 'gemma4', size: 42, modified_at: '2026-01-05T00:00:00Z' }] }),
    );
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
    paths,
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

function target(baseUrl: string): ProtocolRequestTarget {
  return {
    providerId: 'ollama',
    label: 'Ollama',
    authKind: 'none',
    baseUrl,
    auth: { authType: 'none' },
  };
}

describe('createOllamaProtocolAdapter', () => {
  it('declares the ollama format, the protocol the registry looks up by name', () => {
    assert.equal(createOllamaProtocolAdapter().format, 'ollama');
  });

  it('keeps the native behaviour: GET /api/version and GET /api/tags on the credential base URL', async () => {
    const server = await startStub();
    servers.push(server);
    const adapter = createOllamaProtocolAdapter({ now: () => 3 });

    const validation = await adapter.validateCredential(target(server.baseUrl));
    const discovered = await adapter.discoverCatalog(target(server.baseUrl));

    assert.deepEqual(validation, {
      ok: true,
      detail: 'Ollama 0.12.0 reachable over GET /api/version',
      validatedAt: 3,
    });
    assert.deepEqual(server.paths, ['/api/version', '/api/tags']);
    assert.deepEqual(discovered, [
      {
        providerModelId: 'gemma4',
        displayName: 'gemma4',
        sizeBytes: 42,
        family: null,
        providerModifiedAt: '2026-01-05T00:00:00.000Z',
      },
    ]);
  });

  it('reports a rejected base URL with the message the native adapter already produces', async () => {
    const adapter = createOllamaProtocolAdapter();

    await assert.rejects(
      () => adapter.validateCredential(target('not-a-url')),
      /Ollama base URL must be an absolute http or https URL without query or fragment/,
    );
  });
});
