import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProtocolAdapter, ProtocolRequestTarget } from '../../integrations/providers/protocol-adapter.js';
import { createProtocolAdapters } from '../../integrations/providers/protocol-adapters.js';
import type { AdapterTarget, DiscoveredModelRecord } from '../../types/provider.js';
import { createFakeAdapter } from '../testing/fake-adapter.js';
import { UnsupportedProviderError } from '../errors.js';
import { ProviderRegistry } from './provider-registry.js';

function probeAdapter(format: ProtocolAdapter['format']): ProtocolAdapter & {
  readonly seen: ProtocolRequestTarget[];
} {
  const seen: ProtocolRequestTarget[] = [];

  return {
    format,
    seen,
    validateCredential: async (target) => {
      seen.push(target);

      return { ok: true, detail: `${format} answered`, validatedAt: 5 };
    },
    discoverCatalog: async (target) => {
      seen.push(target);

      return [];
    },
  };
}

describe('ProviderRegistry', () => {
  it('resolves every ported protocol by format', () => {
    const registry = new ProviderRegistry(createProtocolAdapters());

    for (const format of ['openai', 'claude', 'gemini', 'ollama'] as const) {
      assert.equal(registry.resolveFormat(format).format, format);
    }

    assert.deepEqual(
      createProtocolAdapters().map((adapter) => adapter.format),
      ['openai', 'claude', 'gemini', 'ollama'],
    );
  });

  it('resolves a catalog provider by id and by alias, to the adapter of its format', () => {
    const registry = new ProviderRegistry(createProtocolAdapters());

    assert.equal(registry.get('groq').id, 'groq');
    assert.equal(registry.get('oc').id, 'opencode');
    assert.equal(registry.get('anthropic').id, 'anthropic');
    assert.equal(registry.get('ollama').id, 'ollama');
  });

  it('refuses a provider no adapter serves', () => {
    const registry = new ProviderRegistry(createProtocolAdapters());

    assert.throws(() => registry.get('not-a-provider'), UnsupportedProviderError);
    // A catalog entry whose protocol adapter is missing is the same failure, named the same way.
    assert.throws(
      () => new ProviderRegistry([probeAdapter('openai')]).get('anthropic'),
      UnsupportedProviderError,
    );
  });

  it('fails loudly when two adapters claim one format', () => {
    assert.throws(
      () => new ProviderRegistry([probeAdapter('openai'), probeAdapter('openai')]),
      /duplicate formats: openai/,
    );
  });

  it('hands a catalog entry its endpoint, its headers, its suffix and its credential placement', async () => {
    const openai = probeAdapter('openai');
    const registry = new ProviderRegistry([openai]);
    const target: AdapterTarget = { baseUrl: 'http://127.0.0.1:9/v1/chat/completions', authKind: 'none' };

    await registry.get('groq').validateCredential(target);

    assert.deepEqual(openai.seen[0], {
      providerId: 'groq',
      label: 'Groq',
      authKind: 'none',
      baseUrl: 'http://127.0.0.1:9/v1/chat/completions',
      auth: { authType: 'bearer' },
    });
  });

  it('carries the catalog headers, the suffix and the scheme through to the adapter', async () => {
    const claude = probeAdapter('claude');
    const registry = new ProviderRegistry([claude]);

    await registry
      .get('zai')
      .validateCredential({ baseUrl: 'https://api.z.ai/api/anthropic/v1/messages', authKind: 'none' });

    assert.equal(claude.seen[0]?.urlSuffix, '?beta=true');
    assert.deepEqual(claude.seen[0]?.headers, { 'Anthropic-Version': '2023-06-01' });
    assert.deepEqual(claude.seen[0]?.auth, { authType: 'x-api-key' });
  });

  it('reports the credential kinds a provider accepts: none when keyless, api_key when keyed', () => {
    const registry = new ProviderRegistry(createProtocolAdapters());

    assert.deepEqual(registry.get('mlx-gemma').authKinds, ['none']);
    assert.deepEqual(registry.get('opencode').authKinds, ['none']);
    assert.deepEqual(registry.get('groq').authKinds, ['api_key']);
  });

  it('hands the credential secret to the protocol adapter, keeping it off the adapter id', async () => {
    const openai = probeAdapter('openai');
    const registry = new ProviderRegistry([openai]);
    const secret = 'kr-secret-9f8e7d6c';

    const adapter = registry.get('groq');
    await adapter.validateCredential({
      baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
      authKind: 'api_key',
      secret,
    });

    assert.equal(openai.seen[0]?.auth.secret, secret);
    assert.equal(openai.seen[0]?.authKind, 'api_key');
    assert.equal(adapter.id, 'groq');
  });

  it('keeps the spec 001 adapter contract working, bound to its own provider id', async () => {
    const registry = new ProviderRegistry([createFakeAdapter({ authKinds: ['none', 'api_key'] })]);
    const adapter = registry.get('ollama');

    assert.deepEqual(adapter.authKinds, ['none', 'api_key']);
    assert.deepEqual(await adapter.discoverCatalog({ baseUrl: 'http://127.0.0.1:11434', authKind: 'none' }), []);
    assert.deepEqual(
      registry.list().map((registered) => registered.id),
      ['ollama'],
    );
  });

  it('serves a discovered model list through the bound adapter', async () => {
    const adapter: ProtocolAdapter = {
      format: 'openai',
      validateCredential: async () => ({ ok: true, detail: 'probe', validatedAt: 1 }),
      discoverCatalog: async (): Promise<DiscoveredModelRecord[]> => [
        {
          providerModelId: 'llama-3.3-70b-versatile',
          displayName: 'Llama 3.3 70B',
          sizeBytes: null,
          family: null,
          providerModifiedAt: null,
        },
      ],
    };
    const registry = new ProviderRegistry([adapter]);

    const discovered = await registry
      .get('groq')
      .discoverCatalog({ baseUrl: 'https://api.groq.com/openai/v1/chat/completions', authKind: 'none' });

    assert.equal(discovered[0]?.providerModelId, 'llama-3.3-70b-versatile');
  });

  it('binds one adapted provider per catalog entry, and reuses it across lookups', () => {
    const registry = new ProviderRegistry(createProtocolAdapters());

    for (const providerId of ['groq', 'anthropic', 'gemini', 'ollama'] as const) {
      assert.equal(registry.get(providerId).id, providerId);
    }

    assert.equal(registry.get('groq'), registry.get('groq'));
  });

  it('lists the providers reachable without a catalog entry, which is how spec 001 keeps its provider', () => {
    const registry = new ProviderRegistry(createProtocolAdapters());

    assert.deepEqual(
      registry.list().map((adapter) => [adapter.id, adapter.authKinds]),
      [['ollama', ['none']]],
    );
  });
});
