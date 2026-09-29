import { ProviderFailure } from '../../../types/provider.js';
import type {
  AdapterTarget,
  AuthKind,
  DiscoveredModelRecord,
  ProviderAdapter,
  ProviderId,
  ValidationResult,
} from '../../../types/provider.js';
import { DOCUMENTED_PATHS } from '../documented-paths.js';
import { describeRequestUrl } from '../http.js';
import {
  ollamaTagsResponseSchema,
  ollamaVersionResponseSchema,
  type OllamaModelSummary,
  type OllamaTagsResponse,
  type OllamaVersionResponse,
} from './ollama.schemas.js';

export const OLLAMA_PROVIDER_ID: ProviderId = 'ollama';

/**
 * The two endpoints the protocol documents, under the root its format declares: a liveness probe, and the
 * model list. Both hang from the base URL a credential carries.
 */
const VERSION_PATH = `${DOCUMENTED_PATHS.ollama.root}/version`;
const TAGS_PATH = `${DOCUMENTED_PATHS.ollama.root}${DOCUMENTED_PATHS.ollama.models}`;
const DEFAULT_TIMEOUT_MS = 10_000;

/** The part of the Fetch API this adapter uses. */
export interface ProviderHttpResponse {
  readonly status: number;
  text(): Promise<string>;
}

/** Injected so tests never touch the network; defaults to the global `fetch`. */
export type ProviderFetch = (
  url: string,
  init: { readonly signal: AbortSignal },
) => Promise<ProviderHttpResponse>;

export interface OllamaAdapterOptions {
  /** Defaults to the global `fetch`. */
  readonly fetch?: ProviderFetch;
  /** A provider that does not answer within this budget is `unreachable`. Defaults to 10000 ms. */
  readonly timeoutMs?: number;
  /** Defaults to `Date.now`; injected so `validatedAt` is deterministic in tests. */
  readonly now?: () => number;
}

export class OllamaAdapter implements ProviderAdapter {
  readonly id: ProviderId = OLLAMA_PROVIDER_ID;

  /** Ollama is local and unauthenticated until the security spec allows storing an api key. */
  readonly authKinds: readonly AuthKind[] = ['none'];

  private readonly fetchImpl: ProviderFetch;

  private readonly timeoutMs: number;

  private readonly now: () => number;

  constructor(options: OllamaAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * `authKind: 'none'` has no credential to judge: reaching `GET /api/version` with a well-formed payload is
   * the whole validation. Every other outcome is a `ProviderFailure`, so `ok` is never false for this provider.
   */
  async validateCredential(target: AdapterTarget): Promise<ValidationResult> {
    const baseUrl = resolveBaseUrl(target);
    const version = await this.getVersion(baseUrl);

    return {
      ok: true,
      detail: `Ollama ${version.version} reachable over GET ${describeRequestUrl(`${baseUrl}${VERSION_PATH}`)}`,
      validatedAt: this.now(),
    };
  }

  async discoverCatalog(target: AdapterTarget): Promise<DiscoveredModelRecord[]> {
    const baseUrl = resolveBaseUrl(target);
    const catalog = await this.getCatalog(baseUrl);
    const endpoint = `${baseUrl}${TAGS_PATH}`;

    return catalog.models.map((summary) => toDiscoveredModelRecord(summary, endpoint));
  }

  private async getVersion(baseUrl: string): Promise<OllamaVersionResponse> {
    const payload = await this.requestJson(baseUrl, VERSION_PATH);
    const parsed = ollamaVersionResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw invalidPayload(`${baseUrl}${VERSION_PATH}`, parsed.error);
    }

    return parsed.data;
  }

  private async getCatalog(baseUrl: string): Promise<OllamaTagsResponse> {
    const payload = await this.requestJson(baseUrl, TAGS_PATH);
    const parsed = ollamaTagsResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw invalidPayload(`${baseUrl}${TAGS_PATH}`, parsed.error);
    }

    return parsed.data;
  }

  private async requestJson(baseUrl: string, path: string): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    // Every message names the full URL requested, so a user sees which endpoint was called.
    const operation = `GET ${describeRequestUrl(url)}`;
    const response = await this.send(url, operation);

    if (response.status === 401 || response.status === 403) {
      throw new ProviderFailure(
        OLLAMA_PROVIDER_ID,
        'unauthorized',
        `Ollama rejected ${operation} with HTTP ${response.status}`,
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ProviderFailure(
        OLLAMA_PROVIDER_ID,
        'unknown',
        `Ollama answered ${operation} with HTTP ${response.status}`,
      );
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new ProviderFailure(
        OLLAMA_PROVIDER_ID,
        'invalid_response',
        `Ollama sent an unreadable body for ${operation}`,
      );
    }

    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ProviderFailure(
        OLLAMA_PROVIDER_ID,
        'invalid_response',
        `Ollama did not return JSON for ${operation}`,
      );
    }
  }

  private async send(url: string, operation: string): Promise<ProviderHttpResponse> {
    try {
      return await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // The caught error is dropped on purpose: it can quote headers, the URL or the response body.
      throw new ProviderFailure(
        OLLAMA_PROVIDER_ID,
        'unreachable',
        `Ollama did not answer ${operation}`,
      );
    }
  }
}

/**
 * Ollama is reached over plain http/https and never carries a credential. `target.secret` is not read, not
 * sent and not named in any error. A message names the endpoint it called without its userinfo, because a
 * base URL can embed a credential there.
 */
function resolveBaseUrl(target: AdapterTarget): string {
  if (target.authKind !== 'none') {
    throw new ProviderFailure(
      OLLAMA_PROVIDER_ID,
      'unknown',
      `Ollama does not support authKind ${target.authKind}`,
    );
  }

  const baseUrl = target.baseUrl.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ProviderFailure(
      OLLAMA_PROVIDER_ID,
      'unknown',
      'Ollama base URL must be an absolute http or https URL without query or fragment',
    );
  }

  const schemeAllowed = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  if (!schemeAllowed || parsed.search !== '' || parsed.hash !== '') {
    throw new ProviderFailure(
      OLLAMA_PROVIDER_ID,
      'unknown',
      'Ollama base URL must be an absolute http or https URL without query or fragment',
    );
  }

  // `fetch` refuses a URL that carries credentials, so a base URL with userinfo could never be called.
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ProviderFailure(
      OLLAMA_PROVIDER_ID,
      'unknown',
      'Ollama base URL must not embed a credential: store it as the credential secret instead',
    );
  }

  return baseUrl;
}

/**
 * Zod issue paths are built from this module's own keys plus array indices, never from provider values, so
 * naming them is safe: they point at the broken field without quoting the payload. The endpoint is named in
 * full, without userinfo.
 */
function invalidPayload(
  endpoint: string,
  error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] },
): ProviderFailure {
  const fields = [
    ...new Set(
      error.issues.map(
        (issue) => issue.path.map((segment) => String(segment)).join('.') || '<root>',
      ),
    ),
  ]
    .sort()
    .join(', ');

  return new ProviderFailure(
    OLLAMA_PROVIDER_ID,
    'invalid_response',
    `Ollama returned an invalid payload for GET ${describeRequestUrl(endpoint)} (${fields})`,
  );
}

function toDiscoveredModelRecord(summary: OllamaModelSummary, endpoint: string): DiscoveredModelRecord {
  const providerModelId = summary.name ?? summary.model ?? null;

  // The schema already rejects an entry without an identifier; the guard keeps this function total.
  if (providerModelId === null) {
    throw new ProviderFailure(
      OLLAMA_PROVIDER_ID,
      'invalid_response',
      `Ollama returned a model entry without an identifier for GET ${describeRequestUrl(endpoint)}`,
    );
  }

  return {
    providerModelId,
    // Ollama has no separate display name: the model name is the label.
    displayName: providerModelId,
    sizeBytes: summary.size ?? null,
    family: optionalText(summary.details?.family),
    providerModifiedAt: optionalTimestamp(summary.modified_at),
  };
}

function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = value.trim();
  return text === '' ? null : text;
}

/** Ollama reports RFC 3339, sometimes with nanoseconds; the catalog stores one canonical ISO 8601 form. */
function optionalTimestamp(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
