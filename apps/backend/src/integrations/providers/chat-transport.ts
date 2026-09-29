import type { ProviderChatCall } from '../../types/chat-transport.js';
import type { ProviderFormat } from '../../types/provider-catalog.js';
import { ProviderFailure, type ProviderErrorKind } from '../../types/provider.js';
import { withQuery } from '../catalog/auth-headers.js';
import { DOCUMENTED_PATHS, chatEndpointFor } from './documented-paths.js';
import {
  absoluteHttpUrl,
  buildRequestAuth,
  requestJson,
  requestStream,
  stripTrailingSlashes,
  withDeclaredQuery,
  type ProviderFetch,
} from './http.js';
import type { ProtocolRequestTarget } from './protocol-adapter.js';
import { readSseFrames } from './sse.js';

/**
 * The chat transport every protocol adapter shares: build the endpoint the protocol documents, place the
 * credential the way the catalog declares, POST the translated body and hand back either the answer or
 * the frames as they arrive. An adapter supplies its format and nothing else, so each protocol detail
 * lives in exactly one place.
 */

export interface ChatTransportDeps {
  readonly fetch: ProviderFetch;
  readonly timeoutMs: number;
}

export interface ChatTransportOptions {
  readonly format: ProviderFormat;
  readonly deps: ChatTransportDeps;
  /**
   * Where a chat goes, for a protocol whose chat lives outside the root its model list hangs from. The
   * Ollama protocol is the case: its model list is `/api/tags` and its chat is the OpenAI shaped
   * `/v1/chat/completions`.
   */
  readonly chatUrl?: (baseUrl: string, model: string | undefined, stream: boolean) => string;
}

interface PreparedCall {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export class ProtocolChatTransport {
  constructor(private readonly options: ChatTransportOptions) {}

  /** One non streamed chat, the provider's own payload back. */
  async chat(target: ProtocolRequestTarget, call: ProviderChatCall): Promise<unknown> {
    const prepared = this.prepare(target, call);

    return await requestJson({
      label: target.label,
      operation: 'POST its chat endpoint',
      url: prepared.url,
      headers: prepared.headers,
      method: 'POST',
      body: prepared.body,
      ...(call.signal === undefined ? {} : { signal: call.signal }),
      fetch: this.options.deps.fetch,
      timeoutMs: this.options.deps.timeoutMs,
      fail: this.failure(target),
    });
  }

  /** One streamed chat: nothing reaches the provider until the caller starts consuming. */
  chatStream(target: ProtocolRequestTarget, call: ProviderChatCall): AsyncIterable<unknown> {
    return this.frames(target, call);
  }

  private async *frames(target: ProtocolRequestTarget, call: ProviderChatCall): AsyncGenerator<unknown> {
    const prepared = this.prepare(target, call);
    const chunks = await requestStream({
      label: target.label,
      operation: 'POST its chat endpoint',
      url: prepared.url,
      headers: prepared.headers,
      method: 'POST',
      body: prepared.body,
      ...(call.signal === undefined ? {} : { signal: call.signal }),
      fetch: this.options.deps.fetch,
      timeoutMs: this.options.deps.timeoutMs,
      fail: this.failure(target),
    });

    yield* readSseFrames({
      label: target.label,
      operation: 'POST its chat endpoint',
      chunks,
      fail: this.failure(target),
    });
  }

  /**
   * The endpoint, the headers and the serialized body of one call. The URL carries the query the catalog
   * declares and the one the credential belongs in, which is why the credential is resolved first: a
   * `query` scheme places the secret there and nowhere else, so a transport that only read the headers would
   * send the request without any credential at all.
   */
  private prepare(target: ProtocolRequestTarget, call: ProviderChatCall): PreparedCall {
    const base = stripTrailingSlashes(target.baseUrl);
    const parsed = absoluteHttpUrl({
      url: base,
      label: target.label,
      fail: this.failure(target),
    });
    const auth = buildRequestAuth({
      label: target.label,
      auth: target.auth,
      fail: this.failure(target),
    });
    const url = withQuery(
      withDeclaredQuery(this.urlFor(parsed, call), target.urlSuffix),
      auth.query,
    );
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: call.stream ? 'text/event-stream' : 'application/json',
      ...target.headers,
      ...auth.headers,
    };

    return { url, headers, body: JSON.stringify(call.body) };
  }

  private urlFor(base: URL, call: ProviderChatCall): string {
    if (this.options.chatUrl !== undefined) {
      return this.options.chatUrl(base.toString(), call.model, call.stream);
    }

    return chatEndpointFor({
      baseUrl: base,
      paths: DOCUMENTED_PATHS[this.options.format],
      ...(call.model === undefined ? {} : { model: call.model }),
      stream: call.stream,
    });
  }

  private failure(target: ProtocolRequestTarget) {
    return (kind: ProviderErrorKind, message: string): ProviderFailure =>
      new ProviderFailure(target.providerId as never, kind, message);
  }
}
