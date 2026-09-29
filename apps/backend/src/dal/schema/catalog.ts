import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { PolicyEffect } from '../../types/policy.js';
import { credentials } from './credentials.js';

/** Derived data: a refresh replaces the rows of one credential, user data is never rewritten here. */
export const catalogModels = sqliteTable(
  'catalog_models',
  {
    id: text('id').primaryKey(),
    credentialId: text('credential_id')
      .notNull()
      .references(() => credentials.id, { onDelete: 'cascade' }),
    providerModelId: text('provider_model_id').notNull(),
    displayName: text('display_name').notNull(),
    sizeBytes: integer('size_bytes'),
    family: text('family'),
    providerModifiedAt: text('provider_modified_at'),
    discoveredAt: integer('discovered_at').notNull(),
  },
  (table) => [
    uniqueIndex('catalog_models_credential_model_unique').on(table.credentialId, table.providerModelId),
  ],
);

export type CatalogModelRow = typeof catalogModels.$inferSelect;

export type NewCatalogModelRow = typeof catalogModels.$inferInsert;
