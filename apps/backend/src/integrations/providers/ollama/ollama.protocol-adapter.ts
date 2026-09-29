import type { AdapterTarget } from '../../../types/provider.js';
import type { ProtocolAdapter, ProtocolRequestTarget } from '../protocol-adapter.js';
import { OllamaAdapter, type OllamaAdapterOptions } from './ollama.adapter.js';

/**
 * Presents the native Ollama adapter of spec 001 as one protocol of the catalog. Its behaviour is
 * unchanged: it still calls `GET /api/version` and `GET /api/tags` on the base URL it is given. Ollama is
 * local and unauthenticated, so the catalog declares no credential for it and the registry resolves this
 * adapter both by format and by its provider id.
 */
export function createOllamaProtocolAdapter(options: OllamaAdapterOptions = {}): ProtocolAdapter {
  const adapter = new OllamaAdapter(options);

  return {
    format: 'ollama',
    validateCredential: (target: ProtocolRequestTarget) =>
      adapter.validateCredential(toAdapterTarget(target)),
    discoverCatalog: (target: ProtocolRequestTarget) => adapter.discoverCatalog(toAdapterTarget(target)),
  };
}

function toAdapterTarget(target: ProtocolRequestTarget): AdapterTarget {
  return { baseUrl: target.baseUrl, authKind: 'none' };
}
