import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATALOG } from '../catalog/catalog.js';
import { PROVIDER_FORMATS } from '../../types/provider-catalog.js';
import { DOCUMENTED_PATHS, modelsEndpointFor } from './documented-paths.js';

describe('DOCUMENTED_PATHS', () => {
  it('declares a root and a model list for every format that has an adapter', () => {
    assert.deepEqual(Object.keys(DOCUMENTED_PATHS).sort(), [...PROVIDER_FORMATS].sort());

    for (const format of PROVIDER_FORMATS) {
      const paths = DOCUMENTED_PATHS[format];

      assert.match(paths.root, /^\/\S+$/, `${format} root`);
      assert.match(paths.models, /^\//, `${format} models`);
      if (paths.chat !== undefined) {
        assert.match(paths.chat, /^\//, `${format} chat`);
      }
    }
  });

  it('documents the path every catalog entry of that format already ends with', () => {
    for (const entry of CATALOG) {
      const paths = DOCUMENTED_PATHS[entry.format];
      // A format that names a chat endpoint is what every entry of that format ends with.
      const resource = paths.chat ?? paths.models;
      const pathname = new URL(entry.baseUrl).pathname;

      assert.ok(pathname.endsWith(resource), `${entry.id} does not end with ${resource}`);
    }
  });
});

describe('modelsEndpointFor', () => {
  it('completes a bare host with the documented path of the format', () => {
    assert.equal(
      modelsEndpointFor(new URL('http://127.0.0.1:11434'), DOCUMENTED_PATHS.openai),
      'http://127.0.0.1:11434/v1/models',
    );
    assert.equal(
      modelsEndpointFor(new URL('https://api.anthropic.com'), DOCUMENTED_PATHS.claude),
      'https://api.anthropic.com/v1/models',
    );
    assert.equal(
      modelsEndpointFor(new URL('https://generativelanguage.googleapis.com'), DOCUMENTED_PATHS.gemini),
      'https://generativelanguage.googleapis.com/v1beta/models',
    );
    assert.equal(
      modelsEndpointFor(new URL('http://127.0.0.1:11434'), DOCUMENTED_PATHS.ollama),
      'http://127.0.0.1:11434/api/tags',
    );
  });

  it('places the model list beside the chat endpoint, whatever root the provider uses', () => {
    assert.equal(
      modelsEndpointFor(new URL('https://api.deepinfra.com/v1/openai/chat/completions'), DOCUMENTED_PATHS.openai),
      'https://api.deepinfra.com/v1/openai/models',
    );
    assert.equal(
      modelsEndpointFor(new URL('https://api.z.ai/api/anthropic/v1/messages'), DOCUMENTED_PATHS.claude),
      'https://api.z.ai/api/anthropic/v1/models',
    );
  });

  it('keeps a base URL that already names the model list', () => {
    assert.equal(
      modelsEndpointFor(new URL('https://generativelanguage.googleapis.com/v1beta/models'), DOCUMENTED_PATHS.gemini),
      'https://generativelanguage.googleapis.com/v1beta/models',
    );
    assert.equal(
      modelsEndpointFor(new URL('https://gateway.test/v1/models'), DOCUMENTED_PATHS.openai),
      'https://gateway.test/v1/models',
    );
  });

  it('hangs the model list from any other root, and keeps a query the credential carries', () => {
    assert.equal(
      modelsEndpointFor(new URL('https://api.groq.com/openai/v1'), DOCUMENTED_PATHS.openai),
      'https://api.groq.com/openai/v1/models',
    );
    assert.equal(
      modelsEndpointFor(new URL('https://gateway.test/studio'), DOCUMENTED_PATHS.openai),
      'https://gateway.test/studio/models',
    );
    assert.equal(
      modelsEndpointFor(new URL('https://gateway.test/v1?api-version=7'), DOCUMENTED_PATHS.openai),
      'https://gateway.test/v1/models?api-version=7',
    );
  });
});
