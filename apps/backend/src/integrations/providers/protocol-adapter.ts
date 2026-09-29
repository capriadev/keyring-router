import type {
  AdapterTarget,
  AuthKind,
  DiscoveredModelRecord,
  ProviderId,
  ValidationResult,
} from '../../types/provider.js';
import type { CatalogAuthType, ProviderFormat } from '../../types/provider-catalog.js';

/**
 * One protocol, resolved for one provider. `bll/` builds it from a catalog entry plus a credential, so an
 * adapter never reads the catalog: it receives the endpoint, the headers and the credential placement it
 * must use.
 */
export interface ProtocolRequestTarget {
  readonly providerId: ProviderId;
  /** Catalog display name; used to label a failure, never quoted from a request. */
  readonly label: string;
  /** The credential's stored kind. `none` is the only one a credential can hold today. */
  readonly authKind: AuthKind;
  readonly baseUrl: string;
  readonly urlSuffix?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Applied by the OpenAI compatible facade when it builds a chat request (spec 003). */
  readonly requestDefaults?: Readonly<Record<string, unknown>>;
  readonly auth: ProtocolAuth;
}

export interface ProtocolAuth {
  readonly authType: CatalogAuthType;
  readonly authHeader?: string;
  readonly authPrefix?: string;
  /** Only the security spec can store one, so it is absent for every credential today. */
  readonly secret?: string;
}

/**
 * The protocol contract. There is one implementation per protocol, not per provider: a provider is data in
 * the catalog, and the registry picks its adapter by `format`.
 */
export interface ProtocolAdapter {
  readonly format: ProviderFormat;
  validateCredential(target: ProtocolRequestTarget): Promise<ValidationResult>;
  discoverCatalog(target: ProtocolRequestTarget): Promise<DiscoveredModelRecord[]>;
}
