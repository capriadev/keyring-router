import type { ProviderErrorKind, ProviderFailure } from '../../types/provider.js';
import { buildAuthHeaders, type AuthRequestParts } from '../catalog/auth-headers.js';
import type { ProtocolAuth } from './protocol-adapter.js';

/**
 * The part of the Fetch API the protocol adapters use. Injected so a test never reaches the network, and
 * defaults to the global `fetch`.
 */
export interface ProviderHttpResponse {
  readonly status: number;
  text(): Promise<string>;
}

export type ProviderFetch = (
  url: string,
  init: { readonly signal: AbortSignal; readonly headers?: Readonly<Record<string, string>> },
) => Promise<ProviderHttpResponse>;

/** A provider that does not answer within this budget is `unreachable`. */
export const DEFAULT_TIMEOUT_MS = 10_000;

export interface JsonRequestInput {
  readonly label: string;
  /** The operation as it is named in a failure, path only: a host can embed a credential. */
  readonly operation: string;
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch: ProviderFetch;
  readonly timeoutMs: number;
  readonly fail: FailureFactory;
}

/** Builds the secret-free failure a caller reports; nothing that was sent is quoted. */
export type FailureFactory = (kind: ProviderErrorKind, message: string) => ProviderFailure;

/**
 * Builds the credential placement of one request. A scheme the module cannot serve is a provider failure,
 * not an error of its own: an adapter never leaks another module's error type, and the secret stays unquoted.
 */
export function buildRequestAuth(input: {
  readonly label: string;
  readonly auth: ProtocolAuth;
  readonly fail: FailureFactory;
}): AuthRequestParts {
  try {
    return buildAuthHeaders({
      authType: input.auth.authType,
      ...(input.auth.authHeader === undefined ? {} : { authHeader: input.auth.authHeader }),
      ...(input.auth.authPrefix === undefined ? {} : { authPrefix: input.auth.authPrefix }),
      ...(input.auth.secret === undefined ? {} : { secret: input.auth.secret }),
    });
  } catch {
    throw input.fail('unknown', `${input.label} cannot use its declared authentication scheme`);
  }
}

/**
 * Reads JSON from one provider endpoint. Every failure is a `ProviderFailure` with a fixed message: the
 * caught error is dropped on purpose, because it can quote headers, the URL or the response body.
 */
export async function requestJson(input: JsonRequestInput): Promise<unknown> {
  const { label, operation } = input;
  let response: ProviderHttpResponse;

  try {
    response = await input.fetch(input.url, {
      signal: AbortSignal.timeout(input.timeoutMs),
      ...(input.headers === undefined ? {} : { headers: input.headers }),
    });
  } catch {
    throw input.fail('unreachable', `${label} did not answer ${operation}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw input.fail('unauthorized', `${label} rejected ${operation} with HTTP ${response.status}`);
  }

  if (response.status < 200 || response.status >= 300) {
    throw input.fail('unknown', `${label} answered ${operation} with HTTP ${response.status}`);
  }

  let body: string;

  try {
    body = await response.text();
  } catch {
    throw input.fail('invalid_response', `${label} sent an unreadable body for ${operation}`);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw input.fail('invalid_response', `${label} did not return JSON for ${operation}`);
  }
}

/**
 * Zod issue paths are built from the schema's own keys plus array indices, never from provider values, so
 * naming them is safe: they point at the broken field without quoting the payload.
 */
export function describeInvalidPayload(error: {
  readonly issues: readonly { readonly path: readonly PropertyKey[] }[];
}): string {
  return [
    ...new Set(
      error.issues.map((issue) => issue.path.map((segment) => String(segment)).join('.') || '<root>'),
    ),
  ]
    .sort()
    .join(', ');
}

/** Trailing slashes carry no meaning for these endpoints and would break a suffix match. */
export function stripTrailingSlashes(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
