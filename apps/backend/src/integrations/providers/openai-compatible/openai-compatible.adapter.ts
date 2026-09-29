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

const CHAT_PATH = '/chat/completions';
const MODELS_PATH = '/models';

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

  constructor(options: OpenAiCompatibleAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Reaching `GET /models` with a well-formed payload is the whole validation: a gateway that answers it
   * accepts the credential it was given, and one that rejects the credential answers 401.
   */
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
      // OpenAI compatible gateways report no label apart from the id.
      displayName: model.id,
      sizeBytes: null,
      family: model.owned_by ?? null,
      providerModifiedAt:
        typeof model.created === 'number' ? new Date(model.created * 1000).toISOString() : null,
    }));
  }

  /**
   * A chat endpoint names its own model list: `/models` sits next to `/chat/completions`. A credential may
   * hold the bare API root instead, so a base without the chat path is completed the way OpenAI compatible
   * gateways document it.
   */
  private buildModelsUrl(target: ProtocolRequestTarget): string {
    const base = stripTrailingSlashes(target.baseUrl);

    if (base === '') {
      throw this.fail(target, 'unknown', `${target.label} has no base URL to call`);
    }

    let chatUrl: string;

    if (base.endsWith(CHAT_PATH)) {
      chatUrl = base;
    } else if (base.endsWith('/v1')) {
      chatUrl = `${base}${CHAT_PATH}`;
    } else {
      const parsed = this.parseUrl(target, base);
      chatUrl = parsed.pathname === '/' ? `${base}/v1${CHAT_PATH}` : `${base}${CHAT_PATH}`;
    }

    return `${chatUrl.slice(0, -CHAT_PATH.length)}${MODELS_PATH}`;
  }

  private async getModels(target: ProtocolRequestTarget, url: string): Promise<unknown> {
    const { headers, query } = buildRequestAuth({
      label: target.label,
      auth: target.auth,
      fail: (kind, message) => this.fail(target, kind, message),
    });

    const withSuffix = addUrlSuffix(url, target.urlSuffix);
    const parsed = this.parseUrl(target, withSuffix);
    const finalUrl = withQuery(withSuffix, query);

    return requestJson({
      label: target.label,
      operation: `GET ${parsed.pathname}`,
      url: finalUrl,
      headers: { ...(target.headers ?? {}), ...headers },
      fetch: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      fail: (kind, message) => this.fail(target, kind, message),
    });
  }

  /** A host can embed a credential, so only the path of a URL is ever quoted in a failure. */
  private parseUrl(target: ProtocolRequestTarget, url: string): URL {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw this.fail(target, 'unknown', `${target.label} base URL must be an absolute http or https URL`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw this.fail(target, 'unknown', `${target.label} base URL must be an absolute http or https URL`);
    }

    return parsed;
  }

  private fail(target: ProtocolRequestTarget, kind: ProviderErrorKind, message: string): ProviderFailure {
    return new ProviderFailure(target.providerId, kind, message);
  }
}

/** The catalog carries the provider's own suffix, such as `?beta=true`, next to the base URL. */
function addUrlSuffix(url: string, urlSuffix: string | undefined): string {
  return urlSuffix === undefined ? url : `${url}${urlSuffix}`;
}

