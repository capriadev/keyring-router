import type { ProviderAdapter } from '../../types/provider.js';

export function createFakeAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    id: 'ollama',
    authKinds: ['none'],
    validateCredential: async () => ({ ok: true, detail: 'fake', validatedAt: 1 }),
    discoverCatalog: async () => [],
    ...overrides,
  };
}
