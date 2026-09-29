/**
 * The chat transport contract: what the router hands to a protocol adapter, and what an adapter hands back.
 * The adapter owns the URL, the authentication placement and the timeout; the router owns which endpoint of
 * the protocol is being called and what the body means. Neither knows a provider id.
 */
import type { ProtocolRequestTarget } from '../integrations/providers/protocol-adapter.js';

export interface ProviderChatCall {
  /**
   * The model id the provider knows, when the protocol names it outside the body. Gemini carries it in
   * the URL path, so a transport that cannot see it could not build the endpoint at all.
   */
  readonly model?: string;
  /** The request body in the provider's own shape, already translated. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly stream: boolean;
  /**
   * Aborted when the client goes away. A transport that carries it stops the upstream request instead of
   * burning the credential's quota for an answer nobody will read.
   */
  readonly signal?: AbortSignal;
}

/**
 * A protocol adapter that can carry a chat call. One implementation per format, so a provider that speaks a
 * protocol without an implementation fails loudly instead of being served a mangled request.
 */
export interface ChatCapableAdapter {
  /** The provider's answer, unparsed: normalization belongs to the translator, not to the transport. */
  chat(target: ProtocolRequestTarget, call: ProviderChatCall): Promise<unknown>;
  /**
   * The provider's frames, each one as it arrived. A transport never accumulates: a broken stream is the
   * caller's business to report, and a frame that carries no meaning for the client is dropped by the
   * translator rather than by the socket.
   */
  chatStream(target: ProtocolRequestTarget, call: ProviderChatCall): AsyncIterable<unknown>;
}
