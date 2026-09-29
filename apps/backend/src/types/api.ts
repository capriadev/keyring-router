import type { CatalogModel, CatalogRefreshResult, ExposedModel } from './catalog.js';
import type { Credential } from './credential.js';
import type { PolicyRule } from './policy.js';
import type { AuthKind, ProviderId, ValidationResult } from './provider.js';
import type { CatalogAuthType, DeclaredModel, ProviderFormat } from './provider-catalog.js';

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

/**
 * `GET /api/providers`: what a client may know about a provider before it holds a credential for it.
 * `authType` is where the catalog entry places a credential, `authKinds` is what a credential may store,
 * and `modelCount` counts the models the entry declares. Nothing here is discovered from a credential.
 */
export interface ProviderDescriptor {
  readonly providerId: ProviderId;
  readonly alias: string;
  readonly displayName: string;
  readonly format: ProviderFormat;
  readonly authType: CatalogAuthType;
  readonly authKinds: readonly AuthKind[];
  readonly baseUrl: string;
  readonly modelCount: number;
}

export type ProvidersResponse = readonly ProviderDescriptor[];

/**
 * `GET /api/providers/:id`: the same descriptor plus the models the entry declares. A protocol provider
 * declares none, because its models are discovered from the server a credential points at.
 */
export interface ProviderDetailResponse extends ProviderDescriptor {
  readonly models: readonly DeclaredModel[];
}

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
