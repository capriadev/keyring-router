import { z } from 'zod';
import {
  ProviderFailure,
  type DiscoveredModelRecord,
  type ProviderErrorKind,
  type ValidationResult,
} from '../../../types/provider.js';
import { withQuery } from '../../catalog/auth-headers.js';
import {
  buildRequestAuth,
  DEFAULT_TIMEOUT_MS,
  describeInvalidPayload,
  requestJson,
  stripTrailingSlashes,
  type ProviderFetch,
} from '../http.js';
import type { ProtocolAdapter, ProtocolRequestTarget } from '../protocol-adapter.js';

const MODELS_PATH = '/models';
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
    const url = this.buildModelsUrl(target);
    await this.getModels(target, url);

    return { ok: true, detail: `${target.label} answered GET ${new URL(url).pathname}`, validatedAt: this.now() };
  }

  async discoverCatalog(target: ProtocolRequestTarget): Promise<DiscoveredModelRecord[]> {
    const url = this.buildModelsUrl(target);
    const payload = await this.getModels(target, url);
    const parsed = modelsResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw this.fail(
        target,
        'invalid_response',
        `${target.label} returned an invalid payload for GET ${new URL(url).pathname} (${describeInvalidPayload(parsed.error)})`,
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

  private buildModelsUrl(target: ProtocolRequestTarget): string {
    const base = stripTrailingSlashes(target.baseUrl);

    if (base === '') {
      throw this.fail(target, 'unknown', `${target.label} has no base URL to call`);
    }

    let parsed: URL;

    try {
      parsed = new URL(base);
    } catch {
      throw this.fail(target, 'unknown', `${target.label} base URL must be an absolute http or https URL`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw this.fail(target, 'unknown', `${target.label} base URL must be an absolute http or https URL`);
    }

    return base.endsWith(MODELS_PATH) ? base : `${base}${MODELS_PATH}`;
  }

  private async getModels(target: ProtocolRequestTarget, url: string): Promise<unknown> {
    const { headers, query } = buildRequestAuth({
      label: target.label,
      auth: target.auth,
      fail: (kind, message) => this.fail(target, kind, message),
    });

    const finalUrl = withQuery(url, query);

    return requestJson({
      label: target.label,
      operation: `GET ${new URL(url).pathname}`,
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
