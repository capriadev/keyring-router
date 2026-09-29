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

const MESSAGES_PATH = '/messages';
const MODELS_PATH = '/models';

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

  constructor(options: ClaudeAdapterOptions = {}) {
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

    return parsed.data.data.map((model) => ({
      providerModelId: model.id,
      displayName: model.display_name ?? model.id,
      sizeBytes: null,
      family: null,
      providerModifiedAt: model.created_at ?? null,
    }));
  }

  /**
   * The model list of the Messages API sits beside `/messages`. A gateway that mirrors the protocol but not
   * its model list answers 404, which is reported as a provider failure instead of a silent empty catalog.
   */
  private buildModelsUrl(target: ProtocolRequestTarget): string {
    const base = stripTrailingSlashes(stripQuery(target.baseUrl));

    if (base === '') {
      throw this.fail(target, 'unknown', `${target.label} has no base URL to call`);
    }

    const messages = base.endsWith(MESSAGES_PATH) ? base : `${base}${MESSAGES_PATH}`;
    const models = `${messages.slice(0, -MESSAGES_PATH.length)}${MODELS_PATH}`;

    return models;
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

/** The catalog suffix, such as `?beta=true`, belongs to the messages endpoint and not to the model list. */
function stripQuery(url: string): string {
  const separator = url.indexOf('?');

  return separator === -1 ? url : url.slice(0, separator);
}
