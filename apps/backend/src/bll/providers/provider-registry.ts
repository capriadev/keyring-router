import { Inject, Injectable } from '@nestjs/common';
import type { ProviderAdapter, ProviderId } from '../../types/provider.js';
import { UnsupportedProviderError } from '../errors.js';

export const PROVIDER_ADAPTERS = Symbol('PROVIDER_ADAPTERS');

/** The single place the core reads the adapter set. Adapters are composed in `bll.module.ts`. */
@Injectable()
export class ProviderRegistry {
  private readonly adapters: ReadonlyMap<ProviderId, ProviderAdapter>;

  constructor(@Inject(PROVIDER_ADAPTERS) adapters: readonly ProviderAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));

    if (this.adapters.size !== adapters.length) {
      throw new Error('the provider adapter list holds duplicate provider ids');
    }
  }

  list(): readonly ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  get(providerId: ProviderId): ProviderAdapter {
    const adapter = this.adapters.get(providerId);

    if (adapter === undefined) {
      throw new UnsupportedProviderError(providerId);
    }

    return adapter;
  }
}
