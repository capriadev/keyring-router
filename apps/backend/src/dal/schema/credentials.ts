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
    lastValidatedAt: integer('last_validated_at'),
    lastRefreshAt: integer('last_refresh_at'),
    lastRefreshError: text('last_refresh_error'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('credentials_namespace_unique').on(table.namespace)],
);

export type CredentialRow = typeof credentials.$inferSelect;

export type NewCredentialRow = typeof credentials.$inferInsert;
