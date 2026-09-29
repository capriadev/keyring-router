import type { AuthKind, ProviderId } from './provider.js';

/** Namespace slug: lowercase, alphanumeric start, hyphen separated. */
export const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

/**
 * A credential is not a provider: the namespace identifies one account, and two accounts of the
 * same provider are never merged.
 */
export interface CredentialInput {
  readonly namespace: string;
  readonly providerId: ProviderId;
  readonly baseUrl: string;
  readonly authKind: AuthKind;
  /** Rejected until the security spec defines secret storage. Never persisted in this slice. */
  readonly secret?: string;
}

/** Persisted credential. Never carries a secret. */
export interface Credential {
  readonly id: string;
  readonly namespace: string;
  readonly providerId: ProviderId;
  readonly baseUrl: string;
  readonly authKind: AuthKind;
  readonly lastValidatedAt: number | null;
  readonly lastRefreshAt: number | null;
  readonly lastRefreshError: string | null;
  readonly createdAt: number;
}
