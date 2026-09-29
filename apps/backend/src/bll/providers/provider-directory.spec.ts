import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STANDALONE_PROVIDERS, listCatalog } from '../../integrations/catalog/catalog.js';
import { createProtocolAdapters } from '../../integrations/providers/protocol-adapters.js';
import { UnsupportedProviderError } from '../errors.js';
import { listProviderDescriptors, readProviderDescriptor } from './provider-directory.js';
import { ProviderRegistry } from './provider-registry.js';

function registry(): ProviderRegistry {
  return new ProviderRegistry(createProtocolAdapters());
}

describe('listProviderDescriptors', () => {
  it('lists every catalog entry with its declared model count, plus the protocol providers', () => {
    const descriptors = listProviderDescriptors(registry());
    const byId = new Map(descriptors.map((descriptor) => [descriptor.providerId, descriptor]));

    assert.equal(descriptors.length, listCatalog().length + STANDALONE_PROVIDERS.length);
    assert.deepEqual(byId.get('groq'), {
      providerId: 'groq',
      alias: 'groq',
      displayName: 'Groq',
      format: 'openai',
      authType: 'bearer',
      authKinds: ['api_key'],
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      modelCount: listCatalog().find((entry) => entry.id === 'groq')?.models.length,
    });
    assert.deepEqual(byId.get('ollama'), {
      providerId: 'ollama',
      alias: 'ollama',
      displayName: 'Ollama',
      format: 'ollama',
      authType: 'none',
      authKinds: ['none'],
      baseUrl: 'http://localhost:11434',
      modelCount: 0,
    });
  });

  it('reports what a credential may store, which is not the same as where the entry places it', () => {
    const byId = new Map(
      listProviderDescriptors(registry()).map((descriptor) => [descriptor.providerId, descriptor]),
    );

    // A keyless entry accepts a keyless credential only, and a keyed entry accepts an api key.
    assert.deepEqual(byId.get('mlx-gemma')?.authKinds, ['none']);
    assert.equal(byId.get('mlx-gemma')?.authType, 'none');
    assert.deepEqual(byId.get('anthropic')?.authKinds, ['api_key']);
    assert.equal(byId.get('anthropic')?.authType, 'x-api-key');
  });

  it('serves the declared catalog and none of the catalog discovered for a credential', () => {
    const serialized = JSON.stringify(listProviderDescriptors(registry()));

    assert.equal(serialized.includes('namespacedId'), false);
    assert.equal(serialized.includes('credentialId'), false);
    assert.equal(serialized.includes('discoveredAt'), false);
    assert.equal(serialized.includes('exposed'), false);
  });

  it('fails loudly when the registry serves no adapter for a protocol provider', () => {
    assert.throws(
      () => listProviderDescriptors(new ProviderRegistry([])),
      /the registry exposes no adapter for the standalone provider ollama/,
    );
  });
});

describe('readProviderDescriptor', () => {
  it('adds the models the entry declares', () => {
    const detail = readProviderDescriptor(registry(), 'groq');

    assert.equal(detail.modelCount, detail.models.length);
    assert.ok(detail.models.length > 0);
    assert.equal(detail.models[0]?.id, 'meta-llama/llama-4-scout-17b-16e-instruct');
  });

  it('resolves an alias, and declares no model for a protocol provider', () => {
    assert.equal(readProviderDescriptor(registry(), 'oc').providerId, 'opencode');
    assert.deepEqual(readProviderDescriptor(registry(), 'ollama').models, []);
  });

  it('refuses an identifier no provider owns', () => {
    assert.throws(() => readProviderDescriptor(registry(), 'not-a-provider'), UnsupportedProviderError);
  });
});
