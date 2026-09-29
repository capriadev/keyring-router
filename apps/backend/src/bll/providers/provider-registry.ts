import { Inject, Injectable } from '@nestjs/common';
import { CATALOG, findCatalogEntry } from '../../integrations/catalog/catalog.js';
import type { ProtocolAdapter, ProtocolRequestTarget } from '../../integrations/providers/protocol-adapter.js';
import type {
  AdapterTarget,
  AuthKind,
  DiscoveredModelRecord,
  ProviderAdapter,
  ProviderId,
  ValidationResult,
} from '../../types/provider.js';
import type { ProviderCatalogEntry, ProviderFormat } from '../../types/provider-catalog.js';
import { UnsupportedProviderError } from '../errors.js';

export const PROVIDER_ADAPTERS = Symbol('PROVIDER_ADAPTERS');

/**
 * What the module registers: a protocol adapter, or the one-provider adapter contract of spec 001, which is
 * bound to a provider id instead of a catalog entry.
 */
export type RegisteredAdapter = ProtocolAdapter | ProviderAdapter;

interface NormalizedAdapter {
  readonly format?: ProviderFormat;
  readonly providerId?: string;
  /** What a one-provider adapter accepts; a protocol adapter answers to the catalog instead. */
  readonly authKinds?: readonly AuthKind[];
  validateCredential(target: ProtocolRequestTarget): Promise<ValidationResult>;
  discoverCatalog(target: ProtocolRequestTarget): Promise<DiscoveredModelRecord[]>;
}

/**
 * The single place the core reads the adapter set, and the single place a provider id becomes an adapter.
 *
 * Resolution is by format, never by provider id: a catalog entry declares its `format`, the registry picks
 * the one adapter that speaks it, and the adapter receives the catalog data plus the credential in a request
 * target. Ollama is the one protocol that is also its own provider id and has no catalog entry (spec 001
 * wires it directly), so its format doubles as the id it is looked up by.
 */
@Injectable()
export class ProviderRegistry {
  private readonly byFormat: ReadonlyMap<ProviderFormat, NormalizedAdapter>;

  private readonly byProviderId: ReadonlyMap<string, NormalizedAdapter>;

  private readonly bound = new Map<string, ProviderAdapter>();

  /** Formats no catalog entry declares: the protocol itself is the provider, as Ollama is. */
  private readonly standaloneFormats: ReadonlySet<string>;

  constructor(@Inject(PROVIDER_ADAPTERS) adapters: readonly RegisteredAdapter[]) {
    const byFormat = new Map<ProviderFormat, NormalizedAdapter>();
    const byProviderId = new Map<string, NormalizedAdapter>();

    for (const adapter of adapters) {
      const normalized = normalize(adapter);

      if (normalized.format !== undefined && normalized.providerId === undefined) {
        if (byFormat.has(normalized.format)) {
          throw new Error(`the protocol adapter list holds duplicate formats: ${normalized.format}`);
        }

        byFormat.set(normalized.format, normalized);
        continue;
      }

      const providerId = normalized.providerId ?? normalized.format;

      if (providerId === undefined) {
        throw new Error('a registered adapter must declare a format or a provider id');
      }

      if (byProviderId.has(providerId)) {
        throw new Error(`the provider adapter list holds duplicate provider ids: ${providerId}`);
      }

      byProviderId.set(providerId, normalized);
    }

    this.byFormat = byFormat;
    this.byProviderId = byProviderId;
    this.standaloneFormats = new Set(
      [...byFormat.keys()].filter((format) => !CATALOG.some((entry) => entry.format === format)),
    );
  }

  /** The protocol adapter that serves a format; there is exactly one per format. */
  resolveFormat(format: ProviderFormat): ProtocolAdapter {
    return toProtocolAdapter(format, this.resolveNormalized(format));
  }

  /** Adapters reachable without a catalog entry: the native Ollama protocol and spec 001 test doubles. */
  list(): readonly ProviderAdapter[] {
    const standalone = [...this.standaloneFormats].flatMap((providerId) => {
      const adapter = this.byFormat.get(providerId as ProviderFormat);

      return adapter === undefined ? [] : [this.bind(adapter, undefined, providerId)];
    });

    return [
      ...[...this.byProviderId.entries()].map(([providerId, adapter]) =>
        this.bind(adapter, undefined, providerId),
      ),
      ...standalone,
    ];
  }

  get(providerId: ProviderId): ProviderAdapter {
    const entry = findCatalogEntry(providerId);

    if (entry !== undefined) {
      return this.boundEntry(entry);
    }

    const adapter = this.byProviderId.get(providerId) ?? this.standaloneFormatAdapter(providerId);

    if (adapter === undefined) {
      throw new UnsupportedProviderError(providerId);
    }

    return this.bind(adapter, undefined, providerId);
  }

  private standaloneFormatAdapter(providerId: string): NormalizedAdapter | undefined {
    return this.standaloneFormats.has(providerId) ? this.byFormat.get(providerId as ProviderFormat) : undefined;
  }

  private boundEntry(entry: ProviderCatalogEntry): ProviderAdapter {
    const cached = this.bound.get(entry.id);

    if (cached !== undefined) {
      return cached;
    }

    const adapter = this.byFormat.get(entry.format) ?? this.byProviderId.get(entry.format);

    // A catalog entry whose protocol has no adapter is a provider the gateway cannot serve, which is what
    // every caller already handles.
    if (adapter === undefined) {
      throw new UnsupportedProviderError(entry.id);
    }

    const bound = this.bind(adapter, entry, entry.id);
    this.bound.set(entry.id, bound);

    return bound;
  }

  private resolveNormalized(format: ProviderFormat): NormalizedAdapter {
    const adapter = this.byFormat.get(format) ?? this.byProviderId.get(format);

    if (adapter === undefined) {
      throw new Error(`no protocol adapter is registered for format ${format}`);
    }

    return adapter;
  }

  /**
   * A catalog entry plus a credential, seen as one provider. `authKinds` answers what a credential may store
   * for this provider: `none` for a keyless provider, `api_key` for one whose catalog entry declares a
   * credential placement.
   */
  private bind(
    adapter: NormalizedAdapter,
    entry: ProviderCatalogEntry | undefined,
    providerId: string,
  ): ProviderAdapter {
    return {
      id: providerId,
      authKinds: entry === undefined ? (adapter.authKinds ?? ['none']) : storableAuthKinds(entry),
      validateCredential: (target: AdapterTarget) =>
        adapter.validateCredential(toRequestTarget(providerId, entry, target)),
      discoverCatalog: (target: AdapterTarget) =>
        adapter.discoverCatalog(toRequestTarget(providerId, entry, target)),
    };
  }
}

/**
 * What a credential may store for a catalog entry: `none` when the entry declares no credential, `api_key`
 * when it declares where a credential goes. The single place this mapping exists, so the credential
 * boundary, the listing and the registry cannot disagree.
 */
export function storableAuthKinds(entry: ProviderCatalogEntry): readonly AuthKind[] {
  return entry.authType === 'none' ? ['none'] : ['api_key'];
}

/** Registers both shapes as one internal contract, so resolution has a single code path. */
function normalize(adapter: RegisteredAdapter): NormalizedAdapter {
  if ('format' in adapter) {
    return {
      format: adapter.format,
      validateCredential: (target) => adapter.validateCredential(target),
      discoverCatalog: (target) => adapter.discoverCatalog(target),
    };
  }

  return {
    providerId: adapter.id,
    authKinds: adapter.authKinds,
    validateCredential: (target) => adapter.validateCredential(toAdapterTarget(target)),
    discoverCatalog: (target) => adapter.discoverCatalog(toAdapterTarget(target)),
  };
}

function toProtocolAdapter(format: ProviderFormat, adapter: NormalizedAdapter): ProtocolAdapter {
  return {
    format,
    validateCredential: (target) => adapter.validateCredential(target),
    discoverCatalog: (target) => adapter.discoverCatalog(target),
  };
}

/** A one-provider adapter sees the credential exactly as the caller passed it, secret included. */
function toAdapterTarget(target: ProtocolRequestTarget): AdapterTarget {
  return {
    baseUrl: target.baseUrl,
    authKind: target.authKind,
    ...(target.auth.secret === undefined ? {} : { secret: target.auth.secret }),
  };
}

/** The credential owns the base URL; the catalog entry supplies the protocol details around it. */
function toRequestTarget(
  providerId: ProviderId,
  entry: ProviderCatalogEntry | undefined,
  target: AdapterTarget,
): ProtocolRequestTarget {
  return {
    providerId,
    label: entry?.displayName ?? providerId,
    authKind: target.authKind,
    baseUrl: target.baseUrl,
    ...(entry?.urlSuffix === undefined ? {} : { urlSuffix: entry.urlSuffix }),
    ...(entry?.headers === undefined ? {} : { headers: entry.headers }),
    ...(entry?.requestDefaults === undefined ? {} : { requestDefaults: entry.requestDefaults }),
    auth: {
      authType: entry?.authType ?? 'none',
      ...(entry?.authHeader === undefined ? {} : { authHeader: entry.authHeader }),
      ...(entry?.authPrefix === undefined ? {} : { authPrefix: entry.authPrefix }),
      ...(target.secret === undefined ? {} : { secret: target.secret }),
    },
  };
}

