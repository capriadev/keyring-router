import { z } from 'zod';

/**
 * Provider catalog contract. The catalog is data: it names a protocol, an endpoint, the shape of the
 * credential the endpoint accepts and the models the provider declares. No adapter is chosen here, and no
 * credential value ever appears in this shape.
 */
export type ProviderFormat = 'openai' | 'claude' | 'gemini' | 'ollama';

export type CatalogAuthType = 'none' | 'bearer' | 'x-api-key' | 'query';

export interface CatalogModel {
  readonly id: string;
  readonly displayName: string;
  readonly contextLength?: number;
  readonly maxOutputTokens?: number;
  readonly supportsReasoning?: boolean;
  readonly supportsVision?: boolean;
  readonly unsupportedParams?: readonly string[];
}

export interface ProviderCatalogEntry {
  readonly id: string;
  readonly alias: string;
  readonly displayName: string;
  readonly format: ProviderFormat;
  readonly baseUrl: string;
  readonly urlSuffix?: string;
  readonly authType: CatalogAuthType;
  readonly authHeader?: string;
  readonly authPrefix?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly requestDefaults?: Readonly<Record<string, unknown>>;
  readonly models: readonly CatalogModel[];
  /** Where the entry came from, so attribution survives refactors. */
  readonly source: string;
}

export const PROVIDER_FORMATS: readonly ProviderFormat[] = ['openai', 'claude', 'gemini', 'ollama'];

export const CATALOG_AUTH_TYPES: readonly CatalogAuthType[] = ['none', 'bearer', 'x-api-key', 'query'];

/** Every entry is adapted from this source; an entry that does not say so cannot be attributed. */
export const CATALOG_SOURCE_PREFIX = 'OmniRoute (MIT) ';

/** A catalog failure is a build/boot failure: it names the entry and never quotes a value. */
export class CatalogError extends Error {
  readonly entryId: string;

  constructor(entryId: string, message: string) {
    super(message);
    this.name = 'CatalogError';
    this.entryId = entryId;
  }
}

const nonEmpty = z.string().min(1);

export const catalogModelSchema = z.object({
  id: nonEmpty,
  displayName: nonEmpty,
  contextLength: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  supportsReasoning: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  unsupportedParams: z.array(nonEmpty).optional(),
});

export const providerCatalogEntrySchema = z.object({
  id: nonEmpty,
  alias: nonEmpty,
  displayName: nonEmpty,
  format: z.enum(PROVIDER_FORMATS),
  baseUrl: z.string().regex(/^https?:\/\/\S+$/, 'baseUrl must be an absolute http or https URL'),
  urlSuffix: z.string().optional(),
  authType: z.enum(CATALOG_AUTH_TYPES),
  authHeader: nonEmpty.optional(),
  authPrefix: z.string().optional(),
  headers: z.record(nonEmpty, z.string()).optional(),
  requestDefaults: z.record(nonEmpty, z.unknown()).optional(),
  models: z.array(catalogModelSchema).min(1, 'an entry declares at least one model'),
  source: z.string().startsWith(CATALOG_SOURCE_PREFIX, 'every entry names its source'),
});

/**
 * Values that would turn catalog data into a leak. A credential value, a cookie or a session id must never
 * reach this file, so the guard refuses a prefixed secret and a known key shape. It is deliberately narrow:
 * a provider called `Token Kiosk` is data, a token is not.
 */
const CREDENTIAL_VALUE_PATTERNS: readonly RegExp[] = [
  /^(?:Bearer|Basic|Token|Key)\s+[A-Za-z0-9._~+/=:-]{12,}$/,
  /^(?:sk|rk|pk|ghp|gho|ghs|xoxb|xoxp)[-_][A-Za-z0-9_-]{8,}$/,
];

/** A header name is where a browser session would hide, so these never appear in catalog headers. */
const CREDENTIAL_HEADER_PATTERNS: readonly RegExp[] = [
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /(?:^|-)session(?:-|$)/i,
  /^(?:refresh|access)[-_]?token$/i,
];

function findLeak(entry: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'headers' && value !== null && typeof value === 'object') {
      for (const [name, header] of Object.entries(value as Record<string, unknown>)) {
        if (CREDENTIAL_HEADER_PATTERNS.some((pattern) => pattern.test(name))) {
          return `${key}.${name}`;
        }
        if (typeof header === 'string' && CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(header))) {
          return `${key}.${name}`;
        }
      }
      continue;
    }

    if (key === 'source' || key === 'models') {
      continue;
    }

    if (typeof value === 'string' && CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      return key;
    }
  }

  return null;
}

/**
 * Validates the whole catalog at load. A malformed entry, a duplicate id, a duplicate alias and an id that
 * collides with another entry alias all stop the process: two entries with one name would route a request to
 * whichever was read first.
 */
export function validateCatalogEntries(entries: readonly unknown[]): readonly ProviderCatalogEntry[] {
  const validated: ProviderCatalogEntry[] = [];
  const owners = new Map<string, string>();

  for (const candidate of entries) {
    const parsed = providerCatalogEntrySchema.safeParse(candidate);

    if (!parsed.success) {
      const id = readEntryId(candidate);
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'entry'}: ${issue.message}`)
        .join('; ');

      throw new CatalogError(id, `catalog entry ${id} is invalid (${detail})`);
    }

    const entry = parsed.data;
    const leak = findLeak(entry as unknown as Record<string, unknown>);

    if (leak !== null) {
      throw new CatalogError(entry.id, `catalog entry ${entry.id} carries a credential-like value in ${leak}`);
    }

    for (const identifier of new Set([entry.id, entry.alias])) {
      const owner = owners.get(identifier);

      if (owner !== undefined) {
        throw new CatalogError(
          entry.id,
          `catalog identifier ${identifier} is declared by both ${owner} and ${entry.id}`,
        );
      }

      owners.set(identifier, entry.id);
    }

    validated.push(entry);
  }

  return validated;
}

/** The id is read only to name the broken entry; the entry itself stays unread until zod accepts it. */
function readEntryId(candidate: unknown): string {
  if (candidate !== null && typeof candidate === 'object' && 'id' in candidate) {
    const { id } = candidate as { id: unknown };

    if (typeof id === 'string' && id !== '') {
      return id;
    }
  }

  return '<unknown>';
}


