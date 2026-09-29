import { findCatalogEntry, findStandaloneProvider } from '../../integrations/catalog/catalog.js';
import type { ProtocolRequestTarget } from '../../integrations/providers/protocol-adapter.js';
import type { AdapterTarget } from '../../types/provider.js';
import type { DeclaredModel, ProviderFormat } from '../../types/provider-catalog.js';
import { UnsupportedProviderError } from '../errors.js';

/**
 * What the chat facade reads from the provider catalog for one model: the protocol the provider
 * speaks, the entry's request defaults and, when the provider declares its models, the declaration of
 * the one being called. A catalog entry is data, so this module only reads it.
 */
export interface ProviderChatProfile {
  readonly providerId: string;
  readonly format: ProviderFormat;
  readonly requestDefaults?: Readonly<Record<string, unknown>>;
  /** Absent for a provider that declares no models, such as a local server a credential points at. */
  readonly declared?: DeclaredModel;
}

export function providerChatProfile(providerId: string, providerModelId: string): ProviderChatProfile {
  const entry = findCatalogEntry(providerId);

  if (entry !== undefined) {
    const declared = entry.models.find((model) => model.id === providerModelId);

    return {
      providerId,
      format: entry.format,
      ...(entry.requestDefaults === undefined ? {} : { requestDefaults: entry.requestDefaults }),
      ...(declared === undefined ? {} : { declared }),
    };
  }

  const standalone = findStandaloneProvider(providerId);

  if (standalone === undefined) {
    throw new UnsupportedProviderError(providerId);
  }

  return { providerId, format: standalone.format };
}

/**
 * The endpoint, the headers and the credential placement of one chat call.
 *
 * `ProviderRegistry` builds the same target for validation and discovery, but the chat transport
 * contract hands the router a `ProtocolRequestTarget` and the registry exposes no builder for it, so
 * the router builds it here from the same two inputs: the catalog entry of the provider and the
 * credential target. No provider detail is invented: every value comes from the catalog or from the
 * credential, and the credential value stays inside the target.
 */
export function chatRequestTarget(providerId: string, target: AdapterTarget): ProtocolRequestTarget {
  const entry = findCatalogEntry(providerId);
  const standalone = entry === undefined ? findStandaloneProvider(providerId) : undefined;

  if (entry === undefined && standalone === undefined) {
    throw new UnsupportedProviderError(providerId);
  }

  return {
    providerId,
    label: entry?.displayName ?? standalone?.displayName ?? providerId,
    authKind: target.authKind,
    baseUrl: target.baseUrl,
    ...(entry?.urlSuffix === undefined ? {} : { urlSuffix: entry.urlSuffix }),
    ...(entry?.headers === undefined ? {} : { headers: entry.headers }),
    ...(entry?.requestDefaults === undefined ? {} : { requestDefaults: entry.requestDefaults }),
    auth: {
      authType: entry?.authType ?? standalone?.authType ?? 'none',
      ...(entry?.authHeader === undefined ? {} : { authHeader: entry.authHeader }),
      ...(entry?.authPrefix === undefined ? {} : { authPrefix: entry.authPrefix }),
      ...(target.secret === undefined ? {} : { secret: target.secret }),
    },
  };
}
