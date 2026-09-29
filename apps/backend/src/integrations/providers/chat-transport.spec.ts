import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProviderChatCall } from '../../types/chat-transport.js';
import { ProtocolChatTransport } from './chat-transport.js';
import type { ProviderFetch, ProviderHttpResponse } from './http.js';
import type { ProtocolAuth, ProtocolRequestTarget } from './protocol-adapter.js';

const SECRET = 'test-secret-7f3a';

interface RecordedCall {
  readonly url: string;
  readonly init: Parameters<ProviderFetch>[1];
}

/** Records what the provider was asked, so a test reads the URL and the headers it really received. */
function recordingFetch(
  respond: () => ProviderHttpResponse = () => ({ status: 200, text: async () => '{}' }),
): { readonly fetch: ProviderFetch; readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });

      return respond();
    },
  };
}

/** A provider that accepts the call and then says nothing: it can only reject when its signal aborts. */
const hangingFetch: ProviderFetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });

/** How the promise settled within the budget: 'pending' is the failure this guards against. */
async function settleWithin(
  promise: Promise<unknown>,
  ms: number,
): Promise<'fulfilled' | 'rejected' | 'pending'> {
  return await Promise.race([
    promise.then(
      () => 'fulfilled' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>((resolve) => {
      setTimeout(() => resolve('pending'), ms);
    }),
  ]);
}

function target(auth: ProtocolAuth): ProtocolRequestTarget {
  return {
    providerId: 'probe',
    label: 'Probe provider',
    authKind: 'api_key',
    baseUrl: 'http://127.0.0.1:9',
    auth,
  };
}

function transport(fetch: ProviderFetch, timeoutMs = 1_000): ProtocolChatTransport {
  return new ProtocolChatTransport({ format: 'claude', deps: { fetch, timeoutMs } });
}

describe('ProtocolChatTransport', () => {
  it('bounds the call with its own timeout while a client signal is present', async () => {
    const call: ProviderChatCall = {
      body: {},
      stream: false,
      signal: new AbortController().signal,
    };

    assert.equal(await settleWithin(transport(hangingFetch, 60).chat(target({ authType: 'none' }), call), 1_000), 'rejected');
  });

  it('bounds the call with its own timeout when no client signal is present', async () => {
    assert.equal(
      await settleWithin(transport(hangingFetch, 60).chat(target({ authType: 'none' }), { body: {}, stream: false }), 1_000),
      'rejected',
    );
  });

  it('places a query credential in the URL and nowhere in the headers', async () => {
    const recorded = recordingFetch();

    await transport(recorded.fetch).chat(target({ authType: 'query', secret: SECRET }), {
      body: { model: 'probe' },
      stream: false,
    });

    assert.equal(recorded.calls.length, 1);
    assert.ok(
      recorded.calls[0].url.includes(`key=${SECRET}`),
      `the called URL must carry the credential: ${recorded.calls[0].url}`,
    );
    assert.equal(JSON.stringify(recorded.calls[0].init.headers).includes(SECRET), false);
  });

  it('keeps a header credential in the headers and out of the URL', async () => {
    const recorded = recordingFetch();

    await transport(recorded.fetch).chat(target({ authType: 'bearer', secret: SECRET }), {
      body: {},
      stream: false,
    });

    assert.equal(recorded.calls[0].init.headers?.Authorization, `Bearer ${SECRET}`);
    assert.equal(recorded.calls[0].url.includes(SECRET), false);
  });

  it('hands back the frames of a streamed answer as they arrive', async () => {
    const encoder = new TextEncoder();
    const fetch: ProviderFetch = async () => ({
      status: 200,
      text: async () => '',
      body: (async function* () {
        yield encoder.encode('data: {"a":1}\n\n');
        yield encoder.encode('data: [DONE]\n\n');
      })(),
    });
    const frames: unknown[] = [];

    for await (const frame of transport(fetch).chatStream(target({ authType: 'none' }), {
      body: {},
      stream: true,
    })) {
      frames.push(frame);
    }

    assert.deepEqual(frames, [{ a: 1 }]);
  });
});
