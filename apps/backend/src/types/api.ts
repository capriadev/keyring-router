import type { CatalogModel, CatalogRefreshResult, ExposedModel } from './catalog.js';
import type { Credential } from './credential.js';
import type { PolicyRule } from './policy.js';
import type { AuthKind, ProviderId, ValidationResult } from './provider.js';

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
