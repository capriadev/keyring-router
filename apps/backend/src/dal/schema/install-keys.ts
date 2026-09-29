import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Per install material that cannot be derived from the environment. Today it holds the Argon2id
 * salt of the credential secret key; the pepper that completes it lives in `.env`, so the two
 * halves never sit in the same place.
 */
export const installKeys = sqliteTable('install_keys', {
  id: text('id').primaryKey(),
  value: text('value').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type InstallKeyRow = typeof installKeys.$inferSelect;

export type NewInstallKeyRow = typeof installKeys.$inferInsert;
