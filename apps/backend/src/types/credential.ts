import type { AuthKind, ProviderId } from './provider.js';

/** Namespace slug: lowercase, alphanumeric start, hyphen separated. */
export const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

/**
 * Bounds of a storable secret. The lower bound is what keeps `secretHint` (its last four
 * characters) from revealing the whole value; the upper bound keeps one row bounded.
 */
export const SECRET_MIN_LENGTH = 8;
export const SECRET_MAX_LENGTH = 4096;

/**
 * A credential is not a provider: the namespace identifies one account, and two accounts of the
 * same provider are never merged.
 */
export interface CredentialInput {
  readonly namespace: string;
  readonly providerId: ProviderId;
  readonly baseUrl: string;
  readonly authKind: AuthKind;
  /** Required by `authKind: 'api_key'`, refused by `authKind: 'none'`. Encrypted before it is stored. */
  readonly secret?: string;
}

/**
 * Encrypted secret exactly as it is stored. It never leaves `dal/` and `bll/`: no response body, log
 * line or error message is built from it.
 */
export interface StoredSecret {
  readonly secretCiphertext: string;
  readonly secretIv: string;
  readonly secretTag: string;
  readonly secretVersion: number;
  readonly secretHint: string;
}

/**
 * Persisted credential. It never carries the secret, only the hint the UI shows, so the type that
 * crosses the API boundary is secret free by construction.
 */
export interface Credential {
  readonly id: string;
  readonly namespace: string;
  readonly providerId: ProviderId;
  readonly baseUrl: string;
  readonly authKind: AuthKind;
  /** Last four characters of the stored secret, for the UI only. Null when no secret is stored. */
  readonly secretHint: string | null;
  readonly lastValidatedAt: number | null;
  readonly lastRefreshAt: number | null;
  readonly lastRefreshError: string | null;
  readonly createdAt: number;
}
