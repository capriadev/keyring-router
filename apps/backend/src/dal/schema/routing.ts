import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { RoutingOutcome } from '../../types/routing.js';
import { credentials } from './credentials.js';

/**
 * How a credential is doing, one row per credential that has failed at least once. It is state the
 * gateway derives, not user data: it is written by the router and read to decide whether to skip a
 * credential, so it cascades away with the credential it describes.
 */
export const credentialLockouts = sqliteTable('credential_lockouts', {
  credentialId: text('credential_id')
    .primaryKey()
    .references(() => credentials.id, { onDelete: 'cascade' }),
  consecutiveFailures: integer('consecutive_failures').notNull(),
  /** Epoch ms until which the credential is skipped, or null when it is in service. */
  lockedUntil: integer('locked_until'),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * The last quota window a provider reported for one credential. Every number is nullable for the same
 * reason the rule treats them as such: providers report limits unevenly, and a missing number must
 * stay missing.
 */
export const quotaUsage = sqliteTable('quota_usage', {
  credentialId: text('credential_id')
    .primaryKey()
    .references(() => credentials.id, { onDelete: 'cascade' }),
  remainingRequests: integer('remaining_requests'),
  remainingTokens: integer('remaining_tokens'),
  resetAt: integer('reset_at'),
  observedAt: integer('observed_at').notNull(),
});

/**
 * The last thing that happened to one credential, for the observability endpoint: which credential
 * served and, when one did not, the reason it was skipped or the failure that took it down. It holds
 * identifiers and a stable reason, never a payload.
 */
export const routingState = sqliteTable(
  'routing_state',
  {
    credentialId: text('credential_id')
      .primaryKey()
      .references(() => credentials.id, { onDelete: 'cascade' }),
    lastOutcome: text('last_outcome').$type<RoutingOutcome>().notNull(),
    lastReason: text('last_reason'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('routing_state_outcome_idx').on(table.lastOutcome)],
);

export type CredentialLockoutRow = typeof credentialLockouts.$inferSelect;
export type QuotaUsageRow = typeof quotaUsage.$inferSelect;
export type RoutingStateRow = typeof routingState.$inferSelect;