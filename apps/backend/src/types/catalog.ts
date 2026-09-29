import type { ProviderId } from './provider.js';

/**
 * Namespaced model id, the identifier a client uses to name one credential explicitly.
 * Single source of truth for the `namespace/providerModel` format.
 */
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

/** Policy-passing model. The only shape listed by `/api/models`. */
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
