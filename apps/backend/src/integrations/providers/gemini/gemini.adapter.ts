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

const MODEL_PREFIX = 'models/';

/**
 * `GET {baseUrl}` of the Gemini API, where the base URL is the model collection itself and the model goes
 * in the path of a completion.
 */
const modelsResponseSchema = z.object({
  models: z.array(
    z.object({
      name: z.string().min(1),
      displayName: z.string().optional(),
      inputTokenLimit: z.number().optional(),
      outputTokenLimit: z.number().optional(),
    }),
  ),
});

export interface GeminiAdapterOptions {
  /** Defaults to the global `fetch`. */
  readonly fetch?: ProviderFetch;
  /** Defaults to 10000 ms. */
  readonly timeoutMs?: number;
  /** Defaults to `Date.now`; injected so `validatedAt` is deterministic in tests. */
  readonly now?: () => number;
}

/**
 * Serves the Gemini `generateContent` protocol: the model collection is the endpoint, the credential goes
 * in `x-goog-api-key` (or in a query parameter for a catalog entry that declares `authType: 'query'`), and
 * the completion URL is built by the facade as `{baseUrl}/{model}:generateContent` (spec 003).
 */
export class GeminiAdapter implements ProtocolAdapter {
  readonly format = 'gemini' as const;

  private readonly fetchImpl: ProviderFetch;

  private readonly timeoutMs: number;

  private readonly now: () => number;

  constructor(options: GeminiAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
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

    return parsed.data.models.map((model) => ({
      // Gemini names a model `models/gemini-2.5-pro`; the id a client sends is the bare name.
      providerModelId: model.name.startsWith(MODEL_PREFIX) ? model.name.slice(MODEL_PREFIX.length) : model.name,
      displayName: model.displayName ?? model.name,
      sizeBytes: null,
      family: null,
      providerModifiedAt: null,
    }));
  }

  /**
   * The model collection is the endpoint. A base URL that is only a host is completed with the path the
   * format documents, `/v1beta/models`, instead of a `/models` that no Gemini server answers.
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
