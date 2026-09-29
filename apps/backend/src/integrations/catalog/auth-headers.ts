import type { CatalogAuthType } from '../../types/provider-catalog.js';

/**
 * The single place that turns an `authType` plus a secret into an outgoing request. Nothing else in the
 * backend builds an authentication header, so a new scheme is added here once and tested once.
 */
export interface AuthHeaderInput {
  readonly authType: CatalogAuthType;
  /** Header name for `x-api-key`, query parameter name for `query`. Defaults per auth type. */
  readonly authHeader?: string;
  /** Literal value prefix, for schemes such as `Key ` that a provider requires verbatim. */
  readonly authPrefix?: string;
  /**
   * The credential value. Only the security spec can store one, so a caller without a secret gets no
   * authentication header: the upstream then answers 401, which the adapter reports as unauthorized.
   */
  readonly secret?: string;
}

export interface AuthRequestParts {
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
}

const DEFAULT_BEARER_HEADER = 'Authorization';
const DEFAULT_BEARER_PREFIX = 'Bearer ';
const DEFAULT_API_KEY_HEADER = 'x-api-key';
const DEFAULT_QUERY_PARAM = 'key';

const EMPTY: AuthRequestParts = { headers: {}, query: {} };

export class AuthHeaderError extends Error {
  readonly authType: string;

  constructor(authType: string, message: string) {
    super(message);
    this.name = 'AuthHeaderError';
    this.authType = authType;
  }
}

/**
 * `none` sends nothing. A scheme that needs a secret sends nothing while no secret exists, so an anonymous
 * request is still a legal request. A `query` scheme reports the parameter instead of a header: the caller
 * owns URL construction, this module owns the credential placement.
 */
export function buildAuthHeaders(input: AuthHeaderInput): AuthRequestParts {
  switch (input.authType) {
    case 'none':
      if (hasSecret(input.secret)) {
        throw new AuthHeaderError(input.authType, 'authType none takes no secret');
      }

      return EMPTY;
    case 'bearer': {
      if (!hasSecret(input.secret)) {
        return EMPTY;
      }

      const header = input.authHeader ?? DEFAULT_BEARER_HEADER;
      const prefix = input.authPrefix ?? DEFAULT_BEARER_PREFIX;

      return { headers: { [header]: `${prefix}${input.secret}` }, query: {} };
    }
    case 'x-api-key': {
      if (!hasSecret(input.secret)) {
        return EMPTY;
      }

      const header = input.authHeader ?? DEFAULT_API_KEY_HEADER;
      const prefix = input.authPrefix ?? '';

      return { headers: { [header]: `${prefix}${input.secret}` }, query: {} };
    }
    case 'query': {
      if (!hasSecret(input.secret)) {
        return EMPTY;
      }

      const param = input.authHeader ?? DEFAULT_QUERY_PARAM;

      return { headers: {}, query: { [param]: input.secret } };
    }
    default:
      // Exhaustive over CatalogAuthType: a new auth type without a branch lands here instead of silently
      // sending an unauthenticated request.
      throw new AuthHeaderError(String(input.authType), `authType ${String(input.authType)} is not supported`);
  }
}

/** Appends the query parameters of an auth scheme to an absolute URL that carries none of its own. */
export function withQuery(url: string, query: Readonly<Record<string, string>>): string {
  const entries = Object.entries(query);

  if (entries.length === 0) {
    return url;
  }

  const parsed = new URL(url);

  for (const [name, value] of entries) {
    parsed.searchParams.set(name, value);
  }

  return parsed.toString();
}

function hasSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret !== '';
}
