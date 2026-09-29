import {
  findCatalogEntry,
  findStandaloneProvider,
  listCatalog,
  STANDALONE_PROVIDERS,
} from '../../integrations/catalog/catalog.js';
import type { ProviderDescriptor, ProviderDetailResponse } from '../../types/api.js';
import type { AuthKind } from '../../types/provider.js';
import type { ProviderCatalogEntry, StandaloneProvider } from '../../types/provider-catalog.js';
import { UnsupportedProviderError } from '../errors.js';
import { ProviderRegistry, storableAuthKinds } from './provider-registry.js';

/**
 * The discovery view of the provider set: the catalog entries plus the protocols that are their own
 * provider. It reads the catalog and the registry only, never a credential, so this listing can carry no
 * secret and can never duplicate the catalog discovered for a credential: that one is served by
 * `GET /api/catalog`, scoped to the credential that owns it.
 */
export function listProviderDescriptors(registry: ProviderRegistry): readonly ProviderDescriptor[] {
  return [
    ...listCatalog().map(describeEntry),
    ...STANDALONE_PROVIDERS.map((provider) =>
      describeStandalone(provider, standaloneAuthKinds(registry, provider.providerId)),
    ),
  ];
}

/** One provider with the models it declares. An unknown identifier fails like any unserved provider. */
export function readProviderDescriptor(
  registry: ProviderRegistry,
  providerId: string,
): ProviderDetailResponse {
  const entry = findCatalogEntry(providerId);

  if (entry !== undefined) {
    return { ...describeEntry(entry), models: entry.models };
  }

  const provider = findStandaloneProvider(providerId);

  if (provider !== undefined) {
    return {
      ...describeStandalone(provider, standaloneAuthKinds(registry, provider.providerId)),
      models: [],
    };
  }

  throw new UnsupportedProviderError(providerId);
}

function describeEntry(entry: ProviderCatalogEntry): ProviderDescriptor {
  return {
    providerId: entry.id,
    alias: entry.alias,
    displayName: entry.displayName,
    format: entry.format,
    authType: entry.authType,
    authKinds: storableAuthKinds(entry),
    baseUrl: entry.baseUrl,
    // The declared model count. The discovered catalog belongs to a credential, not to this listing.
    modelCount: entry.models.length,
  };
}

/**
 * A provider whose protocol is the provider itself declares no model and no credential: what a credential
 * may store for it comes from the adapter, not from a catalog entry it does not have.
 */
function describeStandalone(provider: StandaloneProvider, authKinds: readonly AuthKind[]): ProviderDescriptor {
  return {
    providerId: provider.providerId,
    alias: provider.providerId,
    displayName: provider.displayName,
    format: provider.format,
    authType: provider.authType,
    authKinds,
    baseUrl: provider.baseUrl,
    modelCount: 0,
  };
}

function standaloneAuthKinds(registry: ProviderRegistry, providerId: string): readonly AuthKind[] {
  const adapter = registry.list().find((registered) => registered.id === providerId);

  if (adapter === undefined) {
    throw new Error(`the registry exposes no adapter for the standalone provider ${providerId}`);
  }

  return adapter.authKinds;
}
