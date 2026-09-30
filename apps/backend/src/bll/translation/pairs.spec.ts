import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChatFormat, ChatRequest, FrameDrop, TranslateRequestOptions } from '../../types/chat.js';
import { createPairTranslator, createTranslationRegistry, TranslationError, translatorKey } from './index.js';
import {
  ARGUMENT_FRAGMENTS,
  FORMAT_FIXTURES,
  OPENAI_ARGUMENTS,
  REQUEST_OPTIONS,
  RICH_REQUEST,
  UPSTREAM_MODEL,
} from './testing/fixtures.js';

const registry = createTranslationRegistry();
const pairs = registry.pairs();

const EXPECTED_MATRIX = [
  'openai:openai',
  'openai:claude',
  'openai:gemini',
  'openai:ollama',
  'claude:openai',
  'claude:claude',
  'claude:gemini',
  'claude:ollama',
];

/** Walks a body the way a caller reads it, without pretending to know its shape in advance. */
function pick(value: unknown, ...path: readonly (string | number)[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (typeof key === 'number') {
      return Array.isArray(current) ? current[key] : undefined;
    }

    return typeof current === 'object' && current !== null
      ? (current as Readonly<Record<string, unknown>>)[key]
      : undefined;
  }, value);
}

function itemCount(value: unknown): number {
  return Array.isArray(value) ? value.length : -1;
}

function warning(name: string): string {
  return `parameter ${name} is declared unsupported for this model and was removed from the request body`;
}

function assertOpenAiBody(body: Readonly<Record<string, unknown>>): void {
  assert.equal(body.model, UPSTREAM_MODEL);
  assert.equal(body.stream, true);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.top_p, 0.9);
  assert.equal(body.max_tokens, 256);
  assert.equal(body.top_k, 5);
  assert.deepEqual(pick(body, 'messages', 0), { role: 'system', content: 'Sos un asistente.' });
  assert.deepEqual(pick(body, 'messages', 1, 'content'), [
    { type: 'text', text: 'Cuanto es 1+2?' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
  ]);
  assert.equal(pick(body, 'tools', 0, 'type'), 'function');
  assert.equal(pick(body, 'tools', 0, 'function', 'name'), 'sumar');
  assert.equal(pick(body, 'tools', 0, 'function', 'parameters', 'type'), 'object');
  assert.equal(pick(body, 'messages', 2, 'tool_calls', 0, 'id'), 'call_1');
  assert.equal(pick(body, 'messages', 2, 'tool_calls', 0, 'function', 'arguments'), OPENAI_ARGUMENTS);
  assert.deepEqual(pick(body, 'messages', 3), {
    role: 'tool',
    content: '3',
    tool_call_id: 'call_1',
    name: 'sumar',
  });
  assert.equal(itemCount(body.messages), 4);
}

function assertClaudeBody(body: Readonly<Record<string, unknown>>): void {
  assert.equal(body.model, UPSTREAM_MODEL);
  assert.equal(body.stream, true);
  assert.equal(body.system, 'Sos un asistente.');
  assert.equal(body.temperature, 0.2);
  assert.equal(body.top_p, 0.9);
  assert.equal(body.max_tokens, 256);
  assert.equal(body.top_k, 5);
  assert.equal(pick(body, 'messages', 0, 'role'), 'user');
  assert.deepEqual(pick(body, 'messages', 0, 'content', 0), { type: 'text', text: 'Cuanto es 1+2?' });
  assert.deepEqual(pick(body, 'messages', 0, 'content', 1), {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
  });
  assert.deepEqual(pick(body, 'messages', 1), {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'call_1', name: 'sumar', input: { a: 1, b: 2 } }],
  });
  assert.deepEqual(pick(body, 'messages', 2), {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '3' }],
  });
  assert.equal(pick(body, 'tools', 0, 'name'), 'sumar');
  assert.equal(pick(body, 'tools', 0, 'input_schema', 'type'), 'object');
  assert.equal(itemCount(body.messages), 3);
}

function assertGeminiBody(body: Readonly<Record<string, unknown>>): void {
  assert.equal(body.model, undefined);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'Sos un asistente.' }] });
  assert.equal(pick(body, 'contents', 0, 'role'), 'user');
  assert.deepEqual(pick(body, 'contents', 0, 'parts', 0), { text: 'Cuanto es 1+2?' });
  assert.deepEqual(pick(body, 'contents', 0, 'parts', 1), {
    inlineData: { mimeType: 'image/png', data: 'QUJD' },
  });
  assert.deepEqual(pick(body, 'contents', 1), {
    role: 'model',
    parts: [{ functionCall: { name: 'sumar', args: { a: 1, b: 2 } } }],
  });
  assert.deepEqual(pick(body, 'contents', 2), {
    role: 'user',
    parts: [{ functionResponse: { name: 'sumar', response: { result: '3' } } }],
  });
  assert.equal(pick(body, 'tools', 0, 'functionDeclarations', 0, 'name'), 'sumar');
  assert.deepEqual(body.generationConfig, {
    maxOutputTokens: 256,
    topK: 5,
    temperature: 0.2,
    topP: 0.9,
  });
  assert.equal(itemCount(body.contents), 3);
}

function assertProviderBody(to: ChatFormat, body: Readonly<Record<string, unknown>>): void {
  if (to === 'claude') {
    assertClaudeBody(body);

    return;
  }

  if (to === 'gemini') {
    assertGeminiBody(body);

    return;
  }

  // openai and ollama: ollama's chat endpoint is openai shaped, so the body is the same one.
  assertOpenAiBody(body);
}

/** The registered pairs, as keys, in the order the registry serves them. */
function keys(): readonly string[] {
  return pairs.map((pair) => translatorKey(pair.from, pair.to));
}

describe('the registered matrix', () => {
  it('serves exactly the eight pairs: openai and claude as client, every protocol as provider', () => {
    assert.deepEqual(keys(), EXPECTED_MATRIX);
    assert.equal(registry.pairs().length, 8);
  });

  it('refuses an origin that is not a client protocol instead of registering a pair nobody asked for', () => {
    for (const from of ['gemini', 'ollama'] as readonly ChatFormat[]) {
      assert.throws(
        () => createPairTranslator(from, 'openai'),
        (error: unknown) => {
          assert.ok(error instanceof TranslationError);
          assert.equal(error.code, 'unsupported_format');
          assert.match(error.message, /no client protocol is served for/);

          return true;
        },
      );
    }
  });

  it('refuses a pair it never registered and names the pairs it does serve', () => {
    assert.equal(registry.has('gemini', 'openai'), false);
    assert.equal(registry.has('ollama', 'claude'), false);

    assert.throws(
      () => registry.get('gemini', 'openai'),
      (error: unknown) => {
        assert.ok(error instanceof TranslationError);
        assert.equal(error.code, 'unknown_pair');
        assert.match(error.message, /registered pairs: openai:openai, openai:claude/);

        return true;
      },
    );
  });

  it('builds the same body for one provider whoever the client protocol was', () => {
    const fromOpenAi = registry.get('openai', 'ollama').translateRequest(RICH_REQUEST, REQUEST_OPTIONS);
    const fromClaude = registry.get('claude', 'ollama').translateRequest(RICH_REQUEST, REQUEST_OPTIONS);

    assert.deepEqual(fromClaude, fromOpenAi);
  });

  it('fails loudly for a frame that is not valid JSON, without quoting the frame', () => {
    const frame = '{"choices":[{"delta":{"content":"Ho"}';

    for (const pair of pairs) {
      const translator = registry.get(pair.from, pair.to);

      assert.throws(
        () => translator.translateChunk(frame),
        (error: unknown) => {
          assert.ok(error instanceof TranslationError);
          assert.equal(error.code, 'invalid_frame');
          assert.equal(error.message.includes('Ho'), false);

          return true;
        },
      );
    }
  });
});

for (const pair of pairs) {
  const key = translatorKey(pair.from, pair.to);
  const fixture = FORMAT_FIXTURES[pair.to];
  const translator = registry.get(pair.from, pair.to);

  describe(`pair ${key}`, () => {
    it('builds the provider request with the catalog defaults applied', () => {
      const translated = translator.translateRequest(RICH_REQUEST, REQUEST_OPTIONS);

      assertProviderBody(pair.to, translated.body);
      assert.deepEqual(translated.warnings, []);
    });

    it('normalizes a complete answer, tool call included', () => {
      const response = translator.translateResponse(fixture.response);

      assert.deepEqual(response, fixture.expectedResponse);
      assert.equal(response.toolCalls[0]?.arguments, OPENAI_ARGUMENTS);
    });

    it('translates the stream frame by frame, in order, one entry per provider frame', () => {
      const sequence = fixture.frames.map((frame) => translator.translateChunk(frame));
      const carriesSeveral = fixture.expectedChunks.some((chunks) => chunks.length > 1);

      assert.deepEqual(sequence, fixture.expectedChunks);
      assert.equal(sequence.length, fixture.frames.length);
      assert.ok(sequence.some((chunks) => chunks.length === 0), 'a frame may carry nothing');
      assert.ok(sequence.some((chunks) => chunks.length === 1), 'a frame may carry one chunk');
      assert.equal(sequence.some((chunks) => chunks.length > 1), carriesSeveral);
    });

    it('keeps the argument fragments of a tool call exactly as they arrived', () => {
      const fragments = fixture.frames
        .flatMap((frame) => translator.translateChunk(frame))
        .flatMap((chunk) =>
          chunk.toolCallDelta?.arguments === undefined ? [] : [chunk.toolCallDelta.arguments],
        );

      assert.deepEqual(fragments, ARGUMENT_FRAGMENTS[pair.to]);
      assert.equal(fragments.join(''), OPENAI_ARGUMENTS);
    });

    it('removes the parameters the catalog declares unsupported and reports each one', () => {
      const options: TranslateRequestOptions = {
        ...REQUEST_OPTIONS,
        unsupportedParams: ['temperature', 'topK'],
      };
      const translated = translator.translateRequest(RICH_REQUEST, options);
      const encoded = JSON.stringify(translated.body);

      for (const name of ['temperature', 'top_k', 'topK']) {
        assert.equal(encoded.includes(name), false, `${name} must not reach the ${pair.to} body`);
      }

      assert.deepEqual(translated.warnings, [warning('temperature'), warning('topK')]);
    });

    it('reports nothing for a parameter the client never sent', () => {
      const translated = translator.translateRequest(RICH_REQUEST, {
        ...REQUEST_OPTIONS,
        unsupportedParams: ['seed'],
      });

      assert.deepEqual(translated.warnings, []);
    });

    it('carries a parameter the contract does not model through to the provider', () => {
      const translated = translator.translateRequest(
        { ...RICH_REQUEST, passthrough: { seed: 7, stop: ['fin'] } },
        REQUEST_OPTIONS,
      );
      const encoded = JSON.stringify(translated.body);

      assert.equal(encoded.includes('"seed":7'), true);
      assert.equal(encoded.includes('fin'), true);
    });
  });
}

describe('catalog defaults', () => {
  const bare: ChatRequest = {
    model: 'ns/modelo',
    stream: false,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hola' }] }],
  };

  const noDefaults: TranslateRequestOptions = {
    model: UPSTREAM_MODEL,
    stream: false,
    unsupportedParams: [],
  };

  it('applies the catalog defaults the client left open', () => {
    const { body } = registry.get('openai', 'openai').translateRequest(bare, REQUEST_OPTIONS);

    assert.equal(body.max_tokens, 16384);
    assert.equal(body.top_k, 5);
  });

  it('lets the client value win over a catalog default', () => {
    const { body } = registry.get('openai', 'openai').translateRequest(RICH_REQUEST, REQUEST_OPTIONS);

    assert.equal(body.max_tokens, 256);
  });

  it('serves the documented claude default when the client names no output limit', () => {
    const { body } = registry.get('claude', 'claude').translateRequest(bare, noDefaults);

    assert.equal(body.max_tokens, 4096);
    assert.equal(body.stream, false);
  });

  it('removes a parameter the catalog default itself wrote', () => {
    const translated = registry.get('openai', 'openai').translateRequest(bare, {
      ...REQUEST_OPTIONS,
      unsupportedParams: ['topK'],
    });

    assert.equal(translated.body.top_k, undefined);
    assert.deepEqual(translated.warnings, [warning('topK')]);
  });
});
/**
 * The link the audit of spec 016 found unasserted: `pairs.ts` is what carries a report from the
 * translator the service actually holds down to the codec that drops the frame. Emptying that forward
 * left the whole suite green, so this case is the only thing that guards it. Spec 017.
 */
describe('the pair the service actually receives', () => {
  it('forwards the report, so a frame the codec drops is reported in production and not only over a double', () => {
    const translator = createPairTranslator('openai', 'openai');
    const drops: FrameDrop[] = [];

    const chunks = translator.translateChunk(42, (_code, drop) => {
      drops.push(drop);
    });

    assert.deepEqual(chunks, []);
    assert.deepEqual(drops, [{ reason: 'not_an_object', shape: 'number' }]);
  });
});

