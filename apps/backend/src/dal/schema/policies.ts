import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PolicyEffect } from '../../types/policy.js';
import { credentials } from './credentials.js';

export const policies = sqliteTable(
  'policies',
  {
    id: text('id').primaryKey(),
    credentialId: text('credential_id').references(() => credentials.id),
    pattern: text('pattern').notNull(),
    effect: text('effect').$type<PolicyEffect>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('policies_credential_id_idx').on(table.credentialId)],
);

export type PolicyRow = typeof policies.$inferSelect;

export type NewPolicyRow = typeof policies.$inferInsert;
