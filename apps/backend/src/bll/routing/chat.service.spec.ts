import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Logger } from '@nestjs/common';
import type { AppEnv } from '../../config/env.js';
import type { ChatChunk, ChatRequest, ChatTranslator } from '../../types/chat.js';
import { ProviderFailure } from '../../types/provider.js';
import { createPairTranslator } from '../translation/pairs.js';
import { ChatService } from './chat.service.js';
import { AllAttemptsFailedError, InvalidChatRequestError } from './errors.js';
import type { RequestRouter, ResolvedRoute } from './request-router.js';
import type { RoutingStateService } from './state.service.js';

/**
 * What the gateway logged, captured instead of printed. Nest puts the hook there for exactly this, and
 * the capture lives inside this file: the suite runs one process per file, so nothing leaks out of it.
 */
function captureWarnings(): { readonly lines: readonly string[]; readonly restore: () => void } {
  const lines: string[] = [];

  Logger.overrideLogger({
    log: () => undefined,
    error: () => undefined,
    warn: (message: unknown) => {
      lines.push(String(message));
    },
    debug: () => undefined,
    verbose: () => undefined,
    fatal: () => undefined,
  });

  return { lines, restore: () => Logger.overrideLogger([]) };
}

/**
 * A resolved route whose translator is the pair the service actually receives in production, over the
 * real openai codec, so the chain under test runs whole: pair to codec to the line the service writes.
 * The audit of spec 017 measured that with a literal translator the pair link and the log link were
 * each tested alone and their union by nobody. Spec 018.
 */
function routeOver(requestId: string, frames: readonly unknown[]): ResolvedRoute {
  const translator: ChatTranslator = createPairTranslator('openai', 'openai');

  return {
    requestId,
    model: 'ns/model',
    namespace: 'ns',
    providerModelId: 'model',
    credentialId: 'credential-1',
    providerId: 'probe',
    providerFormat: 'openai',
    pair: { from: 'openai', to: 'openai' },
    translator,
    translateOptions: { model: 'model', stream: true, unsupportedParams: [] },
    adapter: {
      chat: () => Promise.resolve({}),
      chatStream: () =>
        (async function* streamFrames(): AsyncGenerator<unknown> {
          for (const frame of frames) {
            yield frame;
          }
        })(),
    },
    target: { providerId: 'probe', label: 'probe', authKind: 'none', baseUrl: 'http://127.0.0.1:1' },
  } as unknown as ResolvedRoute;
}

const REQUEST: ChatRequest = {
  model: 'ns/model',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hola' }] }],
  stream: true,
};

const ENV = { routingMode: 'normal', routingCascade: [] } as unknown as AppEnv;

/** A state service that records nothing: the facade tests are about routing, not persistence. */
const STATE = { recordServed: () => undefined, recordFailed: () => undefined } as unknown as RoutingStateService;

/**
 * The service over one fixed route, with the router reduced to the two calls the service makes: a plan
 * that offers the single attempt, and its resolution. The frame chain under test is the real one.
 */
function serviceOver(requestId: string, frames: readonly unknown[]): ChatService {
  const route = routeOver(requestId, frames);
  const attempt = {
    credentialId: route.credentialId,
    namespace: route.namespace,
    providerId: route.providerId,
    providerModelId: route.providerModelId,
    namespacedId: `${route.namespace}/${route.providerModelId}`,
    origin: 'requested',
    cascadeIndex: null,
  };
  const router = {
    plan: () => ({ requestId, namespace: route.namespace, attempts: [attempt], skipped: [] }),
    resolveAttempt: () => route,
  } as unknown as RequestRouter;

  return new ChatService(router, ENV, STATE);
}

async function drain(service: ChatService): Promise<ChatChunk[]> {
  const stream = service.stream({
    model: 'ns/model',
    clientFormat: 'openai',
    stream: true,
    request: REQUEST,
  });
  const chunks: ChatChunk[] = [];

  for await (const chunk of stream.chunks) {
    chunks.push(chunk);
  }

  return chunks;
}

describe('the line the gateway writes for the frames it dropped', () => {
  it('writes one line for the whole request, with the id, the count and the reasons, and no frame', async () => {
    const capture = captureWarnings();
    const frames = [42, { choices: 'nonsense' }, { choices: [{ delta: { content: 'hola' } }] }];
    const service = serviceOver('req-1', frames);

    const chunks = await drain(service);

    capture.restore();

    // The frame it could read still reached the client, and the two it could not became one warning.
    assert.deepEqual(chunks, [{ delta: 'hola' }]);
    assert.deepEqual(capture.lines, [
      'route request=req-1 outcome=frame_dropped drops=2 reasons=not_an_object,unexpected_field_shape',
    ]);
  });

  it('writes nothing when every frame could be read', async () => {
    const capture = captureWarnings();
    const frames = [{ choices: [{ delta: { content: 'hola' } }] }, { choices: [] }];
    const service = serviceOver('req-2', frames);

    const chunks = await drain(service);

    capture.restore();

    assert.deepEqual(chunks, [{ delta: 'hola' }]);
    assert.deepEqual(capture.lines, []);
  });
});

/** One attempt per credential, and the route that serves it. */
function cascade(routes: Record<string, ResolvedRoute>, state: RoutingStateService = STATE): ChatService {
  const attempts = Object.keys(routes).map((credentialId) => ({
    credentialId,
    namespace: 'ns',
    providerId: 'probe',
    providerModelId: `m-${credentialId}`,
    namespacedId: `ns/m-${credentialId}`,
    origin: 'cascade',
    cascadeIndex: 0,
  }));
  const router = {
    plan: () => ({ requestId: 'req-cascade', namespace: 'ns', attempts, skipped: [] }),
    resolveAttempt: (_requestId: string, attempt: { readonly credentialId: string }) => routes[attempt.credentialId],
  } as unknown as RequestRouter;

  return new ChatService(router, ENV, state);
}

function makeRoute(requestId: string, credentialId: string, adapter: ResolvedRoute['adapter']): ResolvedRoute {
  return {
    requestId,
    model: 'ns/model',
    namespace: 'ns',
    providerModelId: `m-${credentialId}`,
    credentialId,
    providerId: 'probe',
    providerFormat: 'openai',
    pair: { from: 'openai', to: 'openai' },
    translator: createPairTranslator('openai', 'openai'),
    translateOptions: { model: 'm', stream: true, unsupportedParams: [] },
    adapter,
    target: { providerId: 'probe', label: 'probe', authKind: 'none', baseUrl: 'http://127.0.0.1:1' },
  } as unknown as ResolvedRoute;
}

function chatCall() {
  return { model: 'ns/model', clientFormat: 'openai' as const, stream: false, request: REQUEST };
}

function failingAdapter(error: Error): ResolvedRoute['adapter'] {
  return {
    chat: () => Promise.reject(error),
    chatStream: () => (async function* never(): AsyncGenerator<unknown> {
      throw error;
    })(),
  };
}

function completingAdapter(): ResolvedRoute['adapter'] {
  return {
    chat: () => Promise.resolve({ choices: [{ message: { role: 'assistant', content: 'hola' } }] }),
    chatStream: () => (async function* never(): AsyncGenerator<unknown> {})(),
  };
}

async function drainCascade(service: ChatService): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];

  for await (const chunk of service.stream({ ...chatCall(), stream: true }).chunks) {
    chunks.push(chunk);
  }

  return chunks;
}

describe('the facade walking the cascade', () => {
  it('serves from the next candidate when the first fails at the provider', async () => {
    const service = cascade({
      c1: makeRoute('req-cascade', 'c1', failingAdapter(new ProviderFailure('probe', 'unreachable', 'down'))),
      c2: makeRoute('req-cascade', 'c2', completingAdapter()),
    });

    const completion = await service.complete(chatCall());

    assert.equal(completion.route.credentialId, 'c2');
  });

  it('names every candidate when none can serve', async () => {
    const service = cascade({
      c1: makeRoute('req-cascade', 'c1', failingAdapter(new ProviderFailure('probe', 'unreachable', 'down'))),
      c2: makeRoute('req-cascade', 'c2', failingAdapter(new ProviderFailure('probe', 'unreachable', 'down'))),
    });

    await assert.rejects(service.complete(chatCall()), (error: unknown) => {
      assert.ok(error instanceof AllAttemptsFailedError);
      assert.match(error.message, /ns\/m-c1/);
      assert.match(error.message, /ns\/m-c2/);
      return true;
    });
  });

  it('does not spend another candidate on a body the client sent badly', async () => {
    const service = cascade({
      c1: makeRoute('req-cascade', 'c1', failingAdapter(new InvalidChatRequestError('bad body'))),
      c2: makeRoute('req-cascade', 'c2', completingAdapter()),
    });

    await assert.rejects(service.complete(chatCall()), InvalidChatRequestError);
  });

  it('reroutes a stream only before the first frame, never after', async () => {
    const service = cascade({
      c1: makeRoute(
        'req-cascade',
        'c1',
        failingAdapter(new ProviderFailure('probe', 'unreachable', 'down')),
      ),
      c2: makeRoute(
        'req-cascade',
        'c2',
        {
          chat: () => Promise.resolve({}),
          chatStream: () =>
            (async function* frames(): AsyncGenerator<unknown> {
              yield { choices: [{ delta: { content: 'hola' } }] };
            })(),
        },
      ),
    });

    assert.deepEqual(await drainCascade(service), [{ delta: 'hola' }]);
  });

  it('lets a failure after the first frame propagate instead of rerouting', async () => {
    const service = cascade({
      c1: makeRoute('req-cascade', 'c1', {
        chat: () => Promise.resolve({}),
        chatStream: () =>
          (async function* frames(): AsyncGenerator<unknown> {
            yield { choices: [{ delta: { content: 'hola' } }] };
            throw new ProviderFailure('probe', 'unreachable', 'down');
          })(),
      }),
      c2: makeRoute('req-cascade', 'c2', completingAdapter()),
    });

    await assert.rejects(drainCascade(service), ProviderFailure);
  });

  it('records a failure for each candidate it spends and a success for the one that serves', async () => {
    const calls: string[] = [];
    const state = {
      recordServed: (credentialId: string) => calls.push(`served:${credentialId}`),
      recordFailed: (credentialId: string, kind: string) => calls.push(`failed:${credentialId}:${kind}`),
    } as unknown as RoutingStateService;
    const service = cascade(
      {
        c1: makeRoute('req-cascade', 'c1', failingAdapter(new ProviderFailure('probe', 'unreachable', 'down'))),
        c2: makeRoute('req-cascade', 'c2', completingAdapter()),
      },
      state,
    );

    await service.complete(chatCall());

    assert.deepEqual(calls, ['failed:c1:unreachable', 'served:c2']);
  });
});
