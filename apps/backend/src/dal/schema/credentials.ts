import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AuthKind, ProviderId } from '../../types/provider.js';

export const credentials = sqliteTable(
  'credentials',
  {
    id: text('id').primaryKey(),
    namespace: text('namespace').notNull(),
    providerId: text('provider_id').$type<ProviderId>().notNull(),
    baseUrl: text('base_url').notNull(),
    authKind: text('auth_kind').$type<AuthKind>().notNull(),
    /**
     * Encrypted at rest with AES-256-GCM. All four values land together and are useless alone: the
     * key is derived from the `.env` pepper and the per install salt in `install_keys`.
     */
    secretCiphertext: text('secret_ciphertext'),
    secretIv: text('secret_iv'),
    secretTag: text('secret_tag'),
    secretVersion: integer('secret_version'),
    /** Last four characters of the secret, for the UI only. Never enough to rebuild it. */
    secretHint: text('secret_hint'),
    lastValidatedAt: integer('last_validated_at'),
    lastRefreshAt: integer('last_refresh_at'),
    lastRefreshError: text('last_refresh_error'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('credentials_namespace_unique').on(table.namespace)],
);

export type CredentialRow = typeof credentials.$inferSelect;

export type NewCredentialRow = typeof credentials.$inferInsert;
