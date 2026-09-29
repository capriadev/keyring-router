/**
 * The wire shapes of the gateway's own API: what a client receives and what a client sends. They are
 * structural and depend on nothing, so the gateway, the local interface and the command line all describe
 * the same bytes without one importing the other.
 *
 * A shape here is a contract, not an implementation: the gateway asserts at compile time that its richer
 * domain types satisfy these, and that assertion is what keeps the two from drifting apart.
 */

/** Every non-2xx response uses this body. `code` is stable, `message` never carries a secret. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
  };
}

/** `GET /api/health` */
export interface HealthResponse {
  readonly status: 'ok';
  readonly version: string;
  readonly uptimeSeconds: number;
}

/** How a credential authenticates. `api_key` is storable only once the security spec allows a secret. */
export type AuthKind = 'none' | 'api_key';

/** A credential, exactly as the API serves it: the secret itself is never part of this shape. */
export interface Credential {
  readonly id: string;
  readonly namespace: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly authKind: AuthKind;
  /** Last four characters of the stored secret, for display. Enough to recognise, never to rebuild. */
  readonly secretHint: string | null;
  readonly lastValidatedAt: number | null;
  readonly lastRefreshAt: number | null;
  readonly lastRefreshError: string | null;
  readonly createdAt: number;
}

/** `POST /api/credentials` */
export interface CredentialCreateRequest {
  readonly namespace: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly authKind: AuthKind;
  /** Required for `api_key`, refused for `none`. Never echoed back by any response. */
  readonly secret?: string;
}

/** `PATCH /api/credentials/:id/secret` */
export interface CredentialSecretRequest {
  readonly secret: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly validatedAt: number;
}

/** One model a provider catalog entry declares, with the capabilities it advertises. */
export interface DeclaredModel {
  readonly id: string;
  readonly displayName: string;
  readonly contextLength?: number;
  readonly maxOutputTokens?: number;
  readonly supportsReasoning?: boolean;
  readonly supportsVision?: boolean;
  /** Parameters this model rejects: the translation removes them and says so instead of flattening. */
  readonly unsupportedParams?: readonly string[];
}

/** `GET /api/providers`: what a client knows about a provider before it holds a credential for it. */
export interface ProviderDescriptor {
  readonly providerId: string;
  readonly alias: string;
  readonly displayName: string;
  readonly format: string;
  readonly authType: string;
  readonly authKinds: readonly AuthKind[];
  readonly baseUrl: string;
  readonly modelCount: number;
}

export type ProvidersResponse = readonly ProviderDescriptor[];

/** `GET /api/providers/:id`: the same descriptor plus the models the entry declares. */
export interface ProviderDetailResponse extends ProviderDescriptor {
  readonly models: readonly DeclaredModel[];
}

/** A discovered model with its credential scope and the current exposure decision. */
export interface CatalogModel {
  readonly credentialId: string;
  readonly namespace: string;
  readonly providerId: string;
  readonly providerModelId: string;
  readonly namespacedId: string;
  readonly displayName: string;
  readonly sizeBytes: number | null;
  readonly family: string | null;
  readonly providerModifiedAt: string | null;
  readonly discoveredAt: number;
  readonly exposed: boolean;
}

/** Policy-passing model. The only shape `GET /api/models` lists. */
export interface ExposedModel {
  readonly namespacedId: string;
  readonly providerId: string;
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

export type PolicyEffect = 'allow' | 'deny';

export interface PolicyRule {
  readonly id: string;
  readonly credentialId: string | null;
  readonly pattern: string;
  readonly effect: PolicyEffect;
  readonly createdAt: number;
}

export interface PolicyRuleCreateRequest {
  readonly credentialId?: string | null;
  /** Glob over the namespaced model id. Only `*` and `?` are supported. */
  readonly pattern: string;
  readonly effect: PolicyEffect;
}

export type CredentialsResponse = readonly Credential[];
export type CatalogResponse = readonly CatalogModel[];
export type ModelsResponse = readonly ExposedModel[];
export type PoliciesResponse = readonly PolicyRule[];

/**
 * The stable codes a refusal can carry. A client switches on the code, never on the message: the message
 * is written for a human and may change, the code is part of the contract.
 */
export type ApiErrorCode =
  | 'invalid_input'
  | 'namespace_taken'
  | 'auth_kind_unsupported'
  | 'unsupported_provider'
  | 'credential_not_found'
  | 'secret_not_found'
  | 'secret_undecryptable'
  | 'secret_key_unavailable'
  | 'policy_not_found'
  | 'invalid_policy_rule'
  | 'model_not_found'
  | 'chat_not_supported'
  | 'invalid_chat_request'
  | 'invalid_body'
  | 'provider_failure'
  | 'route_not_found'
  | 'request_rejected'
  | 'internal_error';

