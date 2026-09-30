import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Logger } from '@nestjs/common';
import type { ChatChunk, ChatRequest, ChatTranslator } from '../../types/chat.js';
import { createPairTranslator } from '../translation/pairs.js';
import { ChatService } from './chat.service.js';
import type { RequestRouter, ResolvedRoute } from './request-router.js';

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
    const service = new ChatService({ resolve: () => routeOver('req-1', frames) } as unknown as RequestRouter);

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
    const service = new ChatService({ resolve: () => routeOver('req-2', frames) } as unknown as RequestRouter);

    const chunks = await drain(service);

    capture.restore();

    assert.deepEqual(chunks, [{ delta: 'hola' }]);
    assert.deepEqual(capture.lines, []);
  });
});
