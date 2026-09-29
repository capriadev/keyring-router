/**
 * Provider catalog: the protocols that are also their own provider.
 *
 * These entries declare no models and no credential: the protocol itself is the provider, and a credential
 * carries the endpoint it talks to. `catalog.ts` validates them together with the catalog, so an identifier
 * is owned once across both lists.
 */
import type { StandaloneProvider } from '../../../types/provider-catalog.js';

export const STANDALONE_PROVIDER_DATA: readonly StandaloneProvider[] = [
  {
    providerId: 'ollama',
    displayName: 'Ollama',
    format: 'ollama',
    authType: 'none',
    // The documented default of a local Ollama server; a credential may point at another host or port.
    baseUrl: 'http://localhost:11434',
  },
];
