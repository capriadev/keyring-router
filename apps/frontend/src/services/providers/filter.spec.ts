import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProviderDescriptor } from '../../types/api';
import {
  NO_PROVIDER_FILTERS,
  distinctAuthTypes,
  distinctFormats,
  filterProviders,
  type ProviderFilters,
} from './filter';

function provider(overrides: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return {
    providerId: 'groq',
    alias: 'groq',
    displayName: 'Groq',
    format: 'openai',
    authType: 'bearer',
    authKinds: ['api_key'],
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    modelCount: 3,
    ...overrides,
  };
}

const CATALOG: readonly ProviderDescriptor[] = [
  provider({ providerId: 'groq', alias: 'groq', displayName: 'Groq', format: 'openai', authType: 'bearer' }),
  provider({ providerId: 'anthropic', alias: 'anthropic', displayName: 'Anthropic', format: 'claude', authType: 'x-api-key' }),
  provider({ providerId: 'ollama', alias: 'ollama', displayName: 'Ollama', format: 'ollama', authType: 'none' }),
  provider({ providerId: 'mlx-gemma', alias: 'mlx-gemma', displayName: 'MLX Gemma 26B', format: 'openai', authType: 'none' }),
];

function ids(providers: readonly ProviderDescriptor[]): string[] {
  return providers.map((value) => value.providerId);
}

function withFilters(overrides: Partial<ProviderFilters>): ProviderFilters {
  return { ...NO_PROVIDER_FILTERS, ...overrides };
}

describe('filterProviders', () => {
  it('returns everything when nothing was set', () => {
    assert.deepEqual(ids(filterProviders(CATALOG, NO_PROVIDER_FILTERS)), ['groq', 'anthropic', 'ollama', 'mlx-gemma']);
  });

  it('matches the query against the display name, the id and the alias, case-insensitively', () => {
    assert.deepEqual(ids(filterProviders(CATALOG, withFilters({ query: 'GROQ' }))), ['groq']);
    assert.deepEqual(ids(filterProviders(CATALOG, withFilters({ query: 'ANTHROPIC' }))), ['anthropic']);
    // "mlx" is in the id and the display name, and matches both rows that carry it.
    assert.deepEqual(ids(filterProviders(CATALOG, withFilters({ query: 'mlx' }))), ['mlx-gemma']);
  });

  it('treats a query of only spaces as no query, so a stray space never empties the list', () => {
    assert.equal(filterProviders(CATALOG, withFilters({ query: '   ' })).length, CATALOG.length);
  });

  it('filters by format and by auth type, and combines both', () => {
    assert.deepEqual(ids(filterProviders(CATALOG, withFilters({ format: 'openai' }))), ['groq', 'mlx-gemma']);
    assert.deepEqual(ids(filterProviders(CATALOG, withFilters({ authType: 'none' }))), ['ollama', 'mlx-gemma']);
    assert.deepEqual(
      ids(filterProviders(CATALOG, withFilters({ format: 'openai', authType: 'none' }))),
      ['mlx-gemma'],
    );
  });

  it('combines the query with a filter', () => {
    assert.deepEqual(
      ids(filterProviders(CATALOG, withFilters({ query: 'a', format: 'claude' }))),
      ['anthropic'],
    );
  });

  it('reports nothing for a query that matches no provider, so the screen can show an empty state', () => {
    assert.deepEqual(filterProviders(CATALOG, withFilters({ query: 'nope' })), []);
  });

  it('keeps the order the gateway reported', () => {
    assert.deepEqual(ids(filterProviders(CATALOG, NO_PROVIDER_FILTERS)), ids(CATALOG));
  });
});

describe('the values the filters offer', () => {
  it('lists the distinct formats and auth types, sorted and without duplicates', () => {
    assert.deepEqual(distinctFormats(CATALOG), ['claude', 'ollama', 'openai']);
    assert.deepEqual(distinctAuthTypes(CATALOG), ['bearer', 'none', 'x-api-key']);
  });
});