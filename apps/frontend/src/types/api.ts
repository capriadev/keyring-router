/**
 * Hand-written mirror of the frozen backend contract (`apps/backend/src/types/*.ts` plus the error
 * codes of `apps/backend/src/gateway/api-errors.ts`). The duplication is accepted for this slice
 * and must be replaced by a generated or shared contract before the second provider lands.
 *
 * Only what the local UI consumes is mirrored: the adapter-internal contracts (`ProviderAdapter`,
 * `AdapterTarget`, `ProviderFailure`, `DiscoveredModelRecord`) never reach the frontend.
 */

// --- provider.ts ---

export const PROVIDER_IDS = ['ollama'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type AuthKind = 'none' | 'api_key';

/** Auth kinds that may be persisted today. `api_key` is refused by the gateway until the security spec. */
export const STORABLE_AUTH_KINDS: readonly AuthKind[] = ['none'];

export type ProviderErrorKind = 'unreachable' | 'unauthorized' | 'invalid_response' | 'unknown';

export interface ValidationResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly validatedAt: number;
}

// --- credential.ts ---

/** Namespace slug: lowercase, alphanumeric start, hyphen separated. */
export const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

/**
 * A credential is not a provider: the namespace identifies one account, and two accounts of the
 * same provider are never merged. The UI never sends `secret`.
 */
export interface CredentialInput {
  readonly namespace: string;
  readonly providerId: ProviderId;
  readonly baseUrl: string;
  readonly authKind: AuthKind;
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

// --- catalog.ts ---

/** Namespaced model id, the identifier a client uses to name one credential explicitly. */
export function toNamespacedModelId(namespace: string, providerModelId: string): string {
  return `${namespace}/${providerModelId}`;
}

/** A discovered model with its credential scope and the current exposure decision. */
export interface CatalogModel {
  readonly credentialId: string;
  readonly namespace: string;
  readonly providerId: ProviderId;
  readonly providerModelId: string;
  readonly namespacedId: string;
  readonly displayName: string;
  readonly sizeBytes: number | null;
  readonly family: string | null;
  readonly providerModifiedAt: string | null;
  readonly discoveredAt: number;
  readonly exposed: boolean;
}

/** Policy-passing model. The only shape the gateway lists as consumable. */
export interface ExposedModel {
  readonly namespacedId: string;
  readonly providerId: ProviderId;
  readonly namespace: string;
  readonly providerModelId: string;
  readonly displayName: string;
}

export interface CatalogRefreshResult {
  readonly credentialId: string;
  readonly discovered: number;
  readonly exposed: number;
  readonly refreshedAt: number;
}

// --- policy.ts ---

export type PolicyEffect = 'allow' | 'deny';

export interface PolicyRuleInput {
  /** `null` or omitted means a global rule that applies to every credential. */
  readonly credentialId?: string | null;
  /** Glob over the namespaced model id. Only `*` and `?` are supported. */
  readonly pattern: string;
  readonly effect: PolicyEffect;
}

export interface PolicyRule {
  readonly id: string;
  readonly credentialId: string | null;
  readonly pattern: string;
  readonly effect: PolicyEffect;
  readonly createdAt: number;
}

// --- gateway/api-errors.ts ---

export type DomainErrorCode =
  | 'invalid_input'
  | 'namespace_taken'
  | 'auth_kind_unsupported'
  | 'unsupported_provider'
  | 'credential_not_found'
  | 'policy_not_found'
  | 'invalid_policy_rule';

/**
 * Every code the API layer can surface: the gateway codes plus the two raised by `services/api`
 * before or after an answer exists (`network_error`: request never reached the gateway,
 * `unreadable_response`: 2xx body that is not JSON). The gateway never sends the last two.
 */
export type ApiErrorCode =
  | DomainErrorCode
  | 'invalid_body'
  | 'provider_failure'
  | 'route_not_found'
  | 'request_rejected'
  | 'internal_error'
  | 'network_error'
  | 'unreadable_response';

// --- types/api.ts ---

/** Every non-2xx response uses this body. `code` is stable, `message` never carries a secret. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

/** `GET /api/health` */
export interface HealthResponse {
  readonly status: 'ok';
  readonly version: string;
  readonly uptimeSeconds: number;
}

/** `GET /api/providers` */
export interface ProviderDescriptor {
  readonly providerId: ProviderId;
  readonly authKinds: readonly AuthKind[];
}

export type ProvidersResponse = readonly ProviderDescriptor[];

/** `GET /api/credentials` */
export type CredentialsResponse = readonly Credential[];

/** `POST /api/credentials/:id/validate` */
export type ValidateResponse = ValidationResult;

/** `POST /api/credentials/:id/refresh` */
export type RefreshResponse = CatalogRefreshResult;

/** `GET /api/catalog` */
export type CatalogResponse = readonly CatalogModel[];

/** `GET /api/models` */
export type ModelsResponse = readonly ExposedModel[];

/** `GET /api/policies` */
export type PoliciesResponse = readonly PolicyRule[];
