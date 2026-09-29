import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChatFormat, ChatTranslator } from '../../types/chat.js';
import { codecFor, createChatTranslators, createPairTranslator, createTranslationRegistry } from './pairs.js';
import { ChatTranslatorRegistry, TranslationError, translatorKey } from './registry.js';

const MATRIX = [
  'openai:openai',
  'openai:claude',
  'openai:gemini',
  'openai:ollama',
  'claude:openai',
  'claude:claude',
  'claude:gemini',
  'claude:ollama',
];

function keys(registry: ChatTranslatorRegistry): readonly string[] {
  return registry.pairs().map((pair) => translatorKey(pair.from, pair.to));
}

describe('ChatTranslatorRegistry', () => {
  it('registers one translator per direction of the matrix, identity included', () => {
    const registry = createTranslationRegistry();

    assert.deepEqual(keys(registry), MATRIX);

    for (const from of ['openai', 'claude'] as const) {
      for (const to of ['openai', 'claude', 'gemini', 'ollama'] as const) {
        assert.equal(registry.has(from, to), true, `${from}:${to} must be registered`);
        assert.equal(registry.get(from, to).from, from);
        assert.equal(registry.get(from, to).to, to);
      }
    }
  });

  it('fails loudly when one pair is registered twice and keeps the first translator', () => {
    const registry = new ChatTranslatorRegistry();
    const first = createPairTranslator('openai', 'claude');
    const second = createPairTranslator('openai', 'claude');

    registry.register(first);

    assert.throws(
      () => {
        registry.register(second);
      },
      (error: unknown) => {
        assert.ok(error instanceof TranslationError);
        assert.equal(error.code, 'duplicate_pair');
        assert.match(error.message, /openai:claude/);

        return true;
      },
    );

    assert.equal(registry.get('openai', 'claude'), first);
    assert.deepEqual(keys(registry), ['openai:claude']);
  });

  it('fails loudly for a pair that was never registered instead of returning something mangled', () => {
    const registry = new ChatTranslatorRegistry();

    assert.throws(
      () => registry.get('openai', 'gemini'),
      (error: unknown) => {
        assert.ok(error instanceof TranslationError);
        assert.equal(error.code, 'unknown_pair');
        assert.match(error.message, /openai:gemini/);
        assert.match(error.message, /registered pairs: none/);

        return true;
      },
    );

    assert.equal(registry.has('openai', 'gemini'), false);
  });

  it('reports the pairs it does serve when it is asked for one it does not', () => {
    const registry = new ChatTranslatorRegistry();
    registry.register(createPairTranslator('claude', 'openai'));
    registry.register(createPairTranslator('claude', 'gemini'));

    assert.throws(
      () => registry.get('openai', 'claude'),
      (error: unknown) => {
        assert.ok(error instanceof TranslationError);
        assert.match(error.message, /no translator is registered for openai:claude/);
        assert.match(error.message, /registered pairs: claude:openai, claude:gemini/);

        return true;
      },
    );
  });

  it('refuses a format outside the matrix', () => {
    const registry = createTranslationRegistry();

    for (const format of ['anthropic', 'gemini-flash', ''] as readonly string[]) {
      assert.throws(
        () => registry.get('openai', format as ChatFormat),
        (error: unknown) => {
          assert.ok(error instanceof TranslationError);
          assert.equal(error.code, 'unsupported_format');

          return true;
        },
      );

      assert.throws(() => registry.get(format as ChatFormat, 'openai'), TranslationError);
      assert.throws(() => createPairTranslator('openai', format as ChatFormat), TranslationError);
    }
  });

  it('refuses an object that does not implement the contract', () => {
    const registry = new ChatTranslatorRegistry();
    const broken = { from: 'openai', to: 'claude' } as unknown as ChatTranslator;

    assert.throws(
      () => {
        registry.register(broken);
      },
      (error: unknown) => {
        assert.ok(error instanceof TranslationError);
        assert.equal(error.code, 'unsupported_format');
        assert.match(error.message, /does not implement translateRequest/);

        return true;
      },
    );

    assert.deepEqual(keys(registry), []);
  });
});

describe('createChatTranslators', () => {
  it('serves every codec once per client format', () => {
    const translators = createChatTranslators();

    assert.equal(translators.length, 8);
    assert.deepEqual(keys(createTranslationRegistry()), MATRIX);
    assert.equal(new Set(translators.map((translator) => translatorKey(translator.from, translator.to))).size, 8);
  });

  it('answers with the codec of the target protocol only', () => {
    assert.equal(codecFor('openai').format, 'openai');
    assert.equal(codecFor('claude').format, 'claude');
    assert.equal(codecFor('gemini').format, 'gemini');
    assert.equal(codecFor('ollama').format, 'ollama');
  });

  it('serves ollama as a provider only, never as a client protocol', () => {
    assert.throws(() => createPairTranslator('ollama', 'ollama'), TranslationError);
    assert.throws(() => createPairTranslator('gemini', 'openai'), TranslationError);
    assert.equal(createTranslationRegistry().has('ollama', 'openai'), false);
  });
});
