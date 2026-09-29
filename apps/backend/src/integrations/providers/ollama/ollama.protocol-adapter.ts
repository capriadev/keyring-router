import type { AdapterTarget } from '../../../types/provider.js';
import type { ChatCapableAdapter, ProviderChatCall } from '../../../types/chat-transport.js';
import { ProtocolChatTransport } from '../chat-transport.js';
import type { ProtocolAdapter, ProtocolRequestTarget } from '../protocol-adapter.js';
import { OllamaAdapter, type OllamaAdapterOptions } from './ollama.adapter.js';

/**
 * Presents the native Ollama adapter of spec 001 as one protocol of the catalog. Its behaviour is
 * unchanged: it still calls `GET /api/version` and `GET /api/tags` on the base URL it is given. Ollama is
 * local and unauthenticated, so the catalog declares no credential for it and the registry resolves this
 * adapter both by format and by its provider id.
 *
 * Its chat is the OpenAI shaped endpoint Ollama documents at `/v1/chat/completions`, which is why the
 * chat URL is built from the host instead of from the `/api` root the model list hangs from: a credential
 * that points at the native API root still chats through the compatible surface.
 */
export function createOllamaProtocolAdapter(
  options: OllamaAdapterOptions = {},
): ProtocolAdapter & ChatCapableAdapter {
  const adapter = new OllamaAdapter(options);
  const chatTransport = new ProtocolChatTransport({
    format: 'ollama',
    deps: { fetch: options.fetch ?? globalThis.fetch, timeoutMs: options.timeoutMs ?? 10_000 },
    chatUrl: (baseUrl) => `${new URL(baseUrl).origin}/v1/chat/completions`,
  });

  return {
    format: 'ollama',
    validateCredential: (target: ProtocolRequestTarget) =>
      adapter.validateCredential(toAdapterTarget(target)),
    discoverCatalog: (target: ProtocolRequestTarget) => adapter.discoverCatalog(toAdapterTarget(target)),
    chat: (target: ProtocolRequestTarget, call: ProviderChatCall) => chatTransport.chat(target, call),
    chatStream: (target: ProtocolRequestTarget, call: ProviderChatCall) =>
      chatTransport.chatStream(target, call),
  };
}

function toAdapterTarget(target: ProtocolRequestTarget): AdapterTarget {
  return { baseUrl: target.baseUrl, authKind: 'none' };
}
