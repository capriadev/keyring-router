import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  CatalogError,
  CATALOG_AUTH_TYPES,
  PROVIDER_FORMATS,
  validateCatalogEntries,
  validateStandaloneProviders,
  type ProviderCatalogEntry,
} from '../../types/provider-catalog.js';
import { CATALOG, findCatalogEntry, findStandaloneProvider, listCatalog, STANDALONE_PROVIDERS } from './catalog.js';
import { API_KEY_PROVIDERS } from './providers/apikey.js';
import { LOCAL_PROVIDERS } from './providers/local.js';
import { NO_AUTH_PROVIDERS } from './providers/noauth.js';

function entry(overrides: Partial<ProviderCatalogEntry> = {}): ProviderCatalogEntry {
  return {
    id: 'example',
    alias: 'example',
    displayName: 'Example',
    format: 'openai',
    baseUrl: 'https://example.test/v1/chat/completions',
    authType: 'bearer',
    models: [{ id: 'example-model', displayName: 'Example Model' }],
    source: 'OmniRoute (MIT) open-sse/config/providers/registry/example/index.ts',
    ...overrides,
  };
}

describe('validateCatalogEntries', () => {
  it('accepts a well formed entry', () => {
    const validated = validateCatalogEntries([entry()]);

    assert.equal(validated.length, 1);
    assert.equal(validated[0]?.id, 'example');
  });

  it('fails loudly on a duplicate id', () => {
    assert.throws(
      () => validateCatalogEntries([entry({ id: 'dup' }), entry({ id: 'dup', alias: 'other' })]),
      (error: unknown) => error instanceof CatalogError && error.message.includes('dup is declared by both'),
    );
  });

  it('fails loudly on a duplicate alias', () => {
    assert.throws(
      () =>
        validateCatalogEntries([
          entry({ id: 'one', alias: 'shared' }),
          entry({ id: 'two', alias: 'shared' }),
        ]),
      CatalogError,
    );
  });

  it('fails loudly when an id collides with another entry alias', () => {
    assert.throws(
      () =>
        validateCatalogEntries([
          entry({ id: 'one', alias: 'shared' }),
          entry({ id: 'shared', alias: 'two' }),
        ]),
      CatalogError,
    );
  });

  it('rejects a missing model, a missing source, a bad base URL and an unknown auth type', () => {
    const broken: readonly Partial<ProviderCatalogEntry>[] = [
      { models: [] },
      { source: 'somewhere else' },
      { baseUrl: 'ftp://example.test/v1' },
      { authType: 'cookie' as never },
      { format: 'openai-responses' as never },
    ];

    for (const overrides of broken) {
      assert.throws(() => validateCatalogEntries([entry(overrides)]), CatalogError, JSON.stringify(overrides));
    }
  });

  it('rejects a credential value, a cookie and a session id in the data', () => {
    const leaks: readonly Partial<ProviderCatalogEntry>[] = [
      { displayName: `Bearer ${'a'.repeat(24)}` },
      { authHeader: `sk-${'a'.repeat(12)}` },
      { headers: { Cookie: 'session=abc' } },
      { headers: { Authorization: 'session-token' } },
      { headers: { 'X-Title': `Token ${'b'.repeat(24)}` } },
    ];

    for (const overrides of leaks) {
      assert.throws(() => validateCatalogEntries([entry(overrides)]), CatalogError, JSON.stringify(overrides));
    }
  });

  it('names the broken entry without quoting the value', () => {
    const secret = `Bearer ${'c'.repeat(24)}`;

    assert.throws(
      () => validateCatalogEntries([entry({ id: 'leaky', displayName: secret })]),
      (error: unknown) =>
        error instanceof CatalogError &&
        error.entryId === 'leaky' &&
        error.message.includes('displayName') &&
        !error.message.includes(secret),
    );
  });
});

describe('validateStandaloneProviders', () => {
  const standalone = {
    providerId: 'ollama',
    displayName: 'Ollama',
    format: 'ollama' as const,
    authType: 'none' as const,
    baseUrl: 'http://localhost:11434',
  };

  it('accepts a protocol provider, and refuses one the catalog already owns', () => {
    assert.equal(validateStandaloneProviders([standalone], CATALOG).length, 1);
    assert.throws(
      () => validateStandaloneProviders([{ ...standalone, providerId: 'groq' }], CATALOG),
      (error: unknown) => error instanceof CatalogError && error.message.includes('already declared'),
    );
    // An alias of a catalog entry is an identifier too: a client may name a provider by either.
    assert.throws(
      () => validateStandaloneProviders([{ ...standalone, providerId: 'oc' }], CATALOG),
      CatalogError,
    );
  });

  it('refuses a malformed protocol provider without quoting it', () => {
    assert.throws(
      () => validateStandaloneProviders([{ ...standalone, baseUrl: 'localhost' }], CATALOG),
      (error: unknown) =>
        error instanceof CatalogError &&
        error.entryId === 'ollama' &&
        error.message.includes('baseUrl'),
    );
    assert.throws(
      () => validateStandaloneProviders([{ ...standalone, format: 'openai-responses' }], CATALOG),
      CatalogError,
    );
  });
});

describe('the shipped catalog', () => {
  it('loads, is non empty, and keeps every id and alias unique', () => {
    // An entry whose alias repeats its own id is legal; two entries sharing one identifier are not.
    const identifiers = CATALOG.flatMap((catalogEntry) => [...new Set([catalogEntry.id, catalogEntry.alias])]);

    assert.ok(CATALOG.length > 100, `expected a catalog of many providers, read ${CATALOG.length}`);
    assert.equal(new Set(identifiers).size, identifiers.length);
  });

  it('is the concatenation of the three family files', () => {
    assert.equal(
      CATALOG.length,
      API_KEY_PROVIDERS.length + LOCAL_PROVIDERS.length + NO_AUTH_PROVIDERS.length,
    );
    assert.equal(listCatalog().length, CATALOG.length);
  });

  it('resolves a provider by id and by alias', () => {
    assert.equal(findCatalogEntry('groq')?.displayName, 'Groq');
    assert.equal(findCatalogEntry('oc')?.id, 'opencode');
    assert.equal(findCatalogEntry('nonexistent-provider'), undefined);
  });

  it('gives every entry a ported format, an http endpoint, a model and a source note', () => {
    for (const catalogEntry of CATALOG) {
      assert.ok(PROVIDER_FORMATS.includes(catalogEntry.format), catalogEntry.id);
      assert.match(catalogEntry.baseUrl, /^https?:\/\//, catalogEntry.id);
      assert.ok(catalogEntry.models.length > 0, catalogEntry.id);
      assert.ok(CATALOG_AUTH_TYPES.includes(catalogEntry.authType), catalogEntry.id);
      assert.ok(catalogEntry.source.startsWith('OmniRoute (MIT) '), catalogEntry.id);
      assert.ok(catalogEntry.source.includes('/registry/'), catalogEntry.id);
    }
  });

  it('carries no oauth, cookie or browser session provider', () => {
    const refused = [
      'claude',
      'codex',
      'chatgpt-web',
      'copilot-web',
      'grok-web',
      'notion-web',
      'suno',
      'udio',
      'duckduckgo-web',
      'cloudflare-playground',
      'cursor',
      'kiro',
      'antigravity',
    ];

    for (const providerId of refused) {
      assert.equal(findCatalogEntry(providerId), undefined, providerId);
    }
  });

  it('keeps a local provider and a keyless provider usable, and the rest keyed', () => {
    for (const providerId of ['mlx-gemma', 'mlx-qwen', 'aihorde', 'opencode', 'uncloseai']) {
      assert.equal(findCatalogEntry(providerId)?.authType, 'none', providerId);
    }

    assert.equal(findCatalogEntry('groq')?.authType, 'bearer');
    assert.equal(findCatalogEntry('anthropic')?.authType, 'x-api-key');
  });

  it('carries no CLI identity, fingerprint or impersonation marker', () => {
    // A marker in any of these fields would travel with every request that entry serves (spec 009 F4).
    const markers = [
      /claude[-_]code/i,
      /claude[-_]cli/i,
      /anthropic[-_]beta/i,
      /codex[-_]cli/i,
      /cursor[-_]agent/i,
      /fingerprint/i,
      /impersonat/i,
      /^user[-_]agent$/i,
      /^x[-_]app/i,
      /^x[-_]title$/i,
      /^http[-_]referer$/i,
      /^origin$/i,
    ];

    for (const catalogEntry of CATALOG) {
      const carried = [
        catalogEntry.displayName,
        catalogEntry.urlSuffix ?? '',
        catalogEntry.authHeader ?? '',
        catalogEntry.authPrefix ?? '',
        ...Object.entries(catalogEntry.headers ?? {}).flatMap(([name, value]) => [name, value]),
      ];

      for (const value of carried) {
        for (const marker of markers) {
          assert.equal(marker.test(value), false, `${catalogEntry.id} carries ${String(marker)}: ${value}`);
        }
      }
    }
  });

  it('carries no anonymous relay that resells another provider', () => {
    for (const catalogEntry of CATALOG) {
      assert.equal(catalogEntry.id.startsWith('g4f'), false, catalogEntry.id);
      assert.notEqual(new URL(catalogEntry.baseUrl).hostname, 'g4f.space', catalogEntry.id);
    }

    for (const removed of ['g4f-gemini', 'g4f-groq', 'g4f-nvidia', 'g4f-ollama', 'g4f-pollinations']) {
      assert.equal(findCatalogEntry(removed), undefined, removed);
    }
  });

  it('lists the protocols that are their own provider beside the catalog entries', () => {
    assert.deepEqual(STANDALONE_PROVIDERS.map((provider) => provider.providerId), ['ollama']);
    assert.equal(findStandaloneProvider('ollama')?.format, 'ollama');
    assert.equal(findStandaloneProvider('ollama')?.authType, 'none');
    assert.equal(findStandaloneProvider('groq'), undefined);
  });

  it('stays ASCII, and its data carries no key, cookie, session or trace of the AGPL source', () => {
    const files = ['providers/apikey.ts', 'providers/local.ts', 'providers/noauth.ts', 'catalog.ts'];

    for (const file of files) {
      const path = fileURLToPath(new URL(file, import.meta.url));
      const contents = readFileSync(path, 'utf8');
      // The header of each file documents what is refused, so the data is what gets scanned.
      const data = contents
        .split('\n')
        .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
        .join('\n');

      assert.equal(/[^\x20-\x7E\n\r\t]/.test(contents), false, `${file} carries a non-ASCII character`);
      assert.equal(/free-claude-code/i.test(contents), false, `${file} names the AGPL source`);
      assert.equal(/(sk|rk|ghp|xoxb)[-_][A-Za-z0-9_-]{12}/.test(data), false, `${file} carries a key`);
      assert.equal(/cookie/i.test(data), false, `${file} mentions a cookie`);
      assert.equal(/session/i.test(data), false, `${file} mentions a session`);
    }
  });
});
