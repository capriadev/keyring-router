export const PROVIDER_IDS = ['ollama'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** How a credential authenticates against its provider. `api_key` is not storable until the security spec lands. */
export type AuthKind = 'none' | 'api_key';

/** Auth kinds that may be persisted today. */
export const STORABLE_AUTH_KINDS: readonly AuthKind[] = ['none'];

/** Everything an adapter needs to reach one credential. `secret` is absent for `authKind: 'none'`. */
export interface AdapterTarget {
  readonly baseUrl: string;
  readonly authKind: AuthKind;
  readonly secret?: string;
}

export type ProviderErrorKind = 'unreachable' | 'unauthorized' | 'invalid_response' | 'unknown';

/**
 * Secret-free provider failure. The message never carries headers, tokens or raw provider payloads.
 */
export class ProviderFailure extends Error {
  readonly providerId: ProviderId;

  readonly kind: ProviderErrorKind;

  constructor(providerId: ProviderId, kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = 'ProviderFailure';
    this.providerId = providerId;
    this.kind = kind;
  }
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly validatedAt: number;
}

/** One model reported by a provider catalog, already normalized. */
export interface DiscoveredModelRecord {
  readonly providerModelId: string;
  readonly displayName: string;
  readonly sizeBytes: number | null;
  readonly family: string | null;
  readonly providerModifiedAt: string | null;
}

/**
 * The only contract between `bll/` and `integrations/`. The core never imports provider SDK details.
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly authKinds: readonly AuthKind[];
  validateCredential(target: AdapterTarget): Promise<ValidationResult>;
  discoverCatalog(target: AdapterTarget): Promise<DiscoveredModelRecord[]>;
}
