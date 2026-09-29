import { z } from 'zod';
import {
  ProviderFailure,
  type DiscoveredModelRecord,
  type ProviderErrorKind,
  type ValidationResult,
} from '../../../types/provider.js';
import { withQuery } from '../../catalog/auth-headers.js';
import { DOCUMENTED_PATHS, modelsEndpointFor } from '../documented-paths.js';
import {
  absoluteHttpUrl,
  buildRequestAuth,
  DEFAULT_TIMEOUT_MS,
  describeInvalidPayload,
  describeRequestUrl,
  requestJson,
  stripTrailingSlashes,
  type ProviderCall,
  type ProviderFetch,
} from '../http.js';
import type { ProtocolAdapter, ProtocolRequestTarget } from '../protocol-adapter.js';
import type { ProviderChatCall } from '../../../types/chat-transport.js';
import { ProtocolChatTransport } from '../chat-transport.js';

/** `GET /v1/models` of the Anthropic Messages API and of the gateways that mirror it. */
const modelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      display_name: z.string().optional(),
      created_at: z.string().optional(),
    }),
  ),
});

export interface ClaudeAdapterOptions {
  /** Defaults to the global `fetch`. */
  readonly fetch?: ProviderFetch;
  /** Defaults to 10000 ms. */
  readonly timeoutMs?: number;
  /** Defaults to `Date.now`; injected so `validatedAt` is deterministic in tests. */
  readonly now?: () => number;
}

/**
 * Serves the Anthropic Messages protocol: `x-api-key` (or a bearer token) plus the Anthropic version
 * headers, both read from the catalog entry. The protocol has no streaming-free endpoint for a model list
 * other than `GET /v1/models`, which is what validation and discovery use, so no chat request is ever sent
 * to judge a credential.
 */
export class ClaudeAdapter implements ProtocolAdapter {
  readonly format = 'claude' as const;

  private readonly fetchImpl: ProviderFetch;

  private readonly timeoutMs: number;

  private readonly now: () => number;

  /** The chat transport of this protocol: one implementation, shared by every provider that speaks it. */
  private readonly chatTransport: ProtocolChatTransport;

  constructor(options: ClaudeAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.chatTransport = new ProtocolChatTransport({
      format: 'claude',
      deps: { fetch: this.fetchImpl, timeoutMs: this.timeoutMs },
    });
  }

  chat(target: ProtocolRequestTarget, call: ProviderChatCall): Promise<unknown> {
    return this.chatTransport.chat(target, call);
  }

  chatStream(target: ProtocolRequestTarget, call: ProviderChatCall): AsyncIterable<unknown> {
    return this.chatTransport.chatStream(target, call);
  }

  async validateCredential(target: ProtocolRequestTarget): Promise<ValidationResult> {
    const call = this.modelsCall(target);
    await this.getModels(target, call);

    return { ok: true, detail: `${target.label} answered GET ${call.displayUrl}`, validatedAt: this.now() };
  }

  async discoverCatalog(target: ProtocolRequestTarget): Promise<DiscoveredModelRecord[]> {
    const call = this.modelsCall(target);
    const payload = await this.getModels(target, call);
    const parsed = modelsResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw this.fail(
        target,
        'invalid_response',
        `${target.label} returned an invalid payload for GET ${call.displayUrl} (${describeInvalidPayload(parsed.error)})`,
      );
    }

    return parsed.data.data.map((model) => ({
      providerModelId: model.id,
      displayName: model.display_name ?? model.id,
      sizeBytes: null,
      family: null,
      providerModifiedAt: model.created_at ?? null,
    }));
  }

  /**
   * The model list of the Messages API sits beside `/messages`, and a host that names no path is completed
   * with the path the format documents. The suffix a catalog entry declares belongs to the messages endpoint
   * and not to the model list, so it is not carried over here.
   */
  private modelsCall(target: ProtocolRequestTarget): ProviderCall {
    const base = stripTrailingSlashes(target.baseUrl);

    if (base === '') {
      throw this.fail(target, 'unknown', `${target.label} has no base URL to call`);
    }

    const parsed = absoluteHttpUrl({
      url: base,
      label: target.label,
      fail: (kind, message) => this.fail(target, kind, message),
    });
    const url = modelsEndpointFor(parsed, DOCUMENTED_PATHS[this.format]);

    return { url, displayUrl: describeRequestUrl(url) };
  }

  private async getModels(target: ProtocolRequestTarget, call: ProviderCall): Promise<unknown> {
    const { headers, query } = buildRequestAuth({
      label: target.label,
      auth: target.auth,
      fail: (kind, message) => this.fail(target, kind, message),
    });

    const finalUrl = withQuery(call.url, query);

    return requestJson({
      label: target.label,
      operation: `GET ${call.displayUrl}`,
      url: finalUrl,
      headers: { ...(target.headers ?? {}), ...headers },
      fetch: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      fail: (kind, message) => this.fail(target, kind, message),
    });
  }

  private fail(target: ProtocolRequestTarget, kind: ProviderErrorKind, message: string): ProviderFailure {
    return new ProviderFailure(target.providerId, kind, message);
  }
}
