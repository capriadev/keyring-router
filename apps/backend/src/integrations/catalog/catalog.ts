import {
  validateCatalogEntries,
  validateStandaloneProviders,
  type ProviderCatalogEntry,
  type StandaloneProvider,
} from '../../types/provider-catalog.js';
import { API_KEY_PROVIDERS } from './providers/apikey.js';
import { LOCAL_PROVIDERS } from './providers/local.js';
import { NO_AUTH_PROVIDERS } from './providers/noauth.js';
import { STANDALONE_PROVIDER_DATA } from './providers/standalone.js';

/**
 * The combined provider catalog. It is validated once, at module load, so a duplicate id, a duplicate alias
 * or a malformed entry stops the gateway instead of reaching a request. Every consumer reads the catalog
 * through this module: no layer imports a family file directly.
 */
export const CATALOG: readonly ProviderCatalogEntry[] = validateCatalogEntries([
  ...API_KEY_PROVIDERS,
  ...LOCAL_PROVIDERS,
  ...NO_AUTH_PROVIDERS,
]);

/**
 * The providers whose protocol is the provider itself, validated against the catalog so no identifier is
 * owned twice. They are served like any other provider and carry no declared model.
 */
export const STANDALONE_PROVIDERS: readonly StandaloneProvider[] = validateStandaloneProviders(
  STANDALONE_PROVIDER_DATA,
  CATALOG,
);

const BY_IDENTIFIER: ReadonlyMap<string, ProviderCatalogEntry> = new Map(
  CATALOG.flatMap((entry) => [
    [entry.id, entry] as const,
    // The id and the alias of one entry never collide: validation owns that rule.
    [entry.alias, entry] as const,
  ]),
);

export function findCatalogEntry(providerId: string): ProviderCatalogEntry | undefined {
  return BY_IDENTIFIER.get(providerId);
}

export function listCatalog(): readonly ProviderCatalogEntry[] {
  return CATALOG;
}

export function findStandaloneProvider(providerId: string): StandaloneProvider | undefined {
  return STANDALONE_PROVIDERS.find((provider) => provider.providerId === providerId);
}

