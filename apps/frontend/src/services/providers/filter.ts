import type { ProviderDescriptor } from '../../types/api';

/**
 * How the catalog is narrowed. A null filter means "every value", which is what the two dropdowns send
 * when the user has not chosen one, so a filter that was never touched never hides anything.
 */
export interface ProviderFilters {
  readonly query: string;
  readonly format: string | null;
  readonly authType: string | null;
}

export const NO_PROVIDER_FILTERS: ProviderFilters = { query: '', format: null, authType: null };

/** Distinct values a filter can take, sorted, so the dropdowns come from the data and not a literal. */
export function distinctFormats(providers: readonly ProviderDescriptor[]): string[] {
  return [...new Set(providers.map((provider) => provider.format))].sort();
}

export function distinctAuthTypes(providers: readonly ProviderDescriptor[]): string[] {
  return [...new Set(providers.map((provider) => provider.authType))].sort();
}

/**
 * Whether one provider matches the query. The three names a user could know are searched: the display
 * name they see, the id a command line takes, and the alias a short form uses. Case-insensitive, and a
 * query of only spaces matches everything, so a stray space never empties the list.
 */
function matchesQuery(provider: ProviderDescriptor, query: string): boolean {
  const needle = query.trim().toLowerCase();

  if (needle === '') {
    return true;
  }

  return (
    provider.displayName.toLowerCase().includes(needle) ||
    provider.providerId.toLowerCase().includes(needle) ||
    provider.alias.toLowerCase().includes(needle)
  );
}

/** The providers that pass every filter that was set, in the order the gateway reported them. */
export function filterProviders(
  providers: readonly ProviderDescriptor[],
  filters: ProviderFilters,
): ProviderDescriptor[] {
  return providers.filter(
    (provider) =>
      matchesQuery(provider, filters.query) &&
      (filters.format === null || provider.format === filters.format) &&
      (filters.authType === null || provider.authType === filters.authType),
  );
}