import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openAiChatBodySchema } from './v1-schemas.js';

const BODY = {
  model: 'local-main/qwen2.5:7b',
  messages: [{ role: 'user', content: 'hola' }],
};

describe('the model id of a v1 chat request', () => {
  it('accepts an identifier as the catalog declares it', () => {
    assert.equal(openAiChatBodySchema.safeParse(BODY).success, true);
  });

  it('refuses one carrying a control character, because the id is written into a log line', () => {
    const forged = { ...BODY, model: 'local-main/ok\nroute request=x outcome=refused' };

    assert.equal(openAiChatBodySchema.safeParse(forged).success, false);
    // The same rule for the other facade, which shares the schema.
    assert.equal(openAiChatBodySchema.safeParse({ ...BODY, model: 'local-main/ok\ttab' }).success, false);
  });
});