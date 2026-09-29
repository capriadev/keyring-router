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
  withDeclaredQuery,
  type ProviderCall,
  type ProviderFetch,
} from '../http.js';
import type { ProtocolAdapter, ProtocolRequestTarget } from '../protocol-adapter.js';
import type { ProviderChatCall } from '../../../types/chat-transport.js';
import { ProtocolChatTransport } from '../chat-transport.js';

/** `GET /models` of an OpenAI compatible gateway. */
const modelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      created: z.number().optional(),
      owned_by: z.string().optional(),
    }),
  ),
});

export interface OpenAiCompatibleAdapterOptions {
  /** Defaults to the global `fetch`. */
  readonly fetch?: ProviderFetch;
  /** Defaults to 10000 ms. */
  readonly timeoutMs?: number;
  /** Defaults to `Date.now`; injected so `validatedAt` is deterministic in tests. */
  readonly now?: () => number;
}

/**
 * Serves every provider whose protocol is OpenAI chat completions. Nothing about a provider is hardcoded
 * here: `baseUrl`, `urlSuffix`, `authType`, `authHeader`, `authPrefix` and `headers` come from the catalog
 * entry the registry resolved, and `requestDefaults` is carried for the chat path of spec 003.
 */
export class OpenAiCompatibleAdapter implements ProtocolAdapter {
  readonly format = 'openai' as const;

  private readonly fetchImpl: ProviderFetch;

  private readonly timeoutMs: number;

  private readonly now: () => number;

  /** The chat transport of this protocol: one implementation, shared by every provider that speaks it. */
  private readonly chatTransport: ProtocolChatTransport;

  constructor(options: OpenAiCompatibleAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.chatTransport = new ProtocolChatTransport({
      format: 'openai',
      deps: { fetch: this.fetchImpl, timeoutMs: this.timeoutMs },
    });
  }

  chat(target: ProtocolRequestTarget, call: ProviderChatCall): Promise<unknown> {
    return this.chatTransport.chat(target, call);
  }

  chatStream(target: ProtocolRequestTarget, call: ProviderChatCall): AsyncIterable<unknown> {
    return this.chatTransport.chatStream(target, call);
  }

  /**
   * Reaching `GET /models` with a well-formed payload is the whole validation: a gateway that answers it
   * accepts the credential it was given, and one that rejects the credential answers 401.
   */
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
      // OpenAI compatible gateways report no label apart from the id.
      displayName: model.id,
      sizeBytes: null,
      family: model.owned_by ?? null,
      providerModifiedAt:
        typeof model.created === 'number' ? new Date(model.created * 1000).toISOString() : null,
    }));
  }

  /**
   * The call this adapter makes: the model list of the gateway, and the same URL as a detail may name it. A
   * chat endpoint names its own model list, so a base without the chat path is completed the way OpenAI
   * compatible gateways document it, and a bare host with the documented path of the format.
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

    return { url, displayUrl: describeRequestUrl(url, target.urlSuffix ?? '') };
  }

  private async getModels(target: ProtocolRequestTarget, call: ProviderCall): Promise<unknown> {
    const { headers, query } = buildRequestAuth({
      label: target.label,
      auth: target.auth,
      fail: (kind, message) => this.fail(target, kind, message),
    });

    const finalUrl = withQuery(withDeclaredQuery(call.url, target.urlSuffix), query);

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

