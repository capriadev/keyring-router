import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claudeMessagesBodySchema, openAiChatBodySchema } from './v1-schemas.js';

const OPENAI_BODY = {
  model: 'local-main/qwen2.5:7b',
  messages: [{ role: 'user', content: 'hola' }],
};

const CLAUDE_BODY = {
  model: 'local-main/qwen2.5:7b',
  max_tokens: 64,
  messages: [{ role: 'user', content: 'hola' }],
};

/** One character per family the rule refuses, named so a failure says which family was not covered. */
const NON_PRINTABLE: Readonly<Record<string, string>> = {
  'a control character': '\n',
  'a bidirectional override': '\u202e',
  'a zero width space': '\u200b',
  'a private use character': '\ue000',
  'an unassigned code point': '\u0378',
  'a lone surrogate': '\ud800',
  'a line separator': '\u2028',
  'a paragraph separator': '\u2029',
};

describe('the model id of a v1 chat request', () => {
  it('accepts an identifier as the catalog declares it, on both facades', () => {
    assert.equal(openAiChatBodySchema.safeParse(OPENAI_BODY).success, true);
    assert.equal(claudeMessagesBodySchema.safeParse(CLAUDE_BODY).success, true);
  });

  it('accepts an identifier with a printable space, which the rule leaves alone on purpose', () => {
    const spaced = { ...OPENAI_BODY, model: 'local-main/mi modelo' };

    assert.equal(openAiChatBodySchema.safeParse(spaced).success, true);
  });

  for (const [what, character] of Object.entries(NON_PRINTABLE)) {
    it(`refuses an id carrying ${what}, on both facades`, () => {
      const forged = `${OPENAI_BODY.model}${character}route request=fake outcome=resolved`;

      assert.equal(openAiChatBodySchema.safeParse({ ...OPENAI_BODY, model: forged }).success, false);
      assert.equal(claudeMessagesBodySchema.safeParse({ ...CLAUDE_BODY, model: forged }).success, false);
    });
  }
});