import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { RoutingOutcome } from '../../types/routing.js';
import { DATABASE, type KrDatabase } from '../client.js';
import { credentialLockouts, quotaUsage, routingState } from '../schema/routing.js';

/** What the lockout table holds for one credential, without the timestamp of the write. */
export interface LockoutRecord {
  readonly credentialId: string;
  readonly consecutiveFailures: number;
  readonly lockedUntil: number | null;
}

/** The last quota window reported for one credential. A null is an unknown, never a zero. */
export interface QuotaRecord {
  readonly credentialId: string;
  readonly remainingRequests: number | null;
  readonly remainingTokens: number | null;
  readonly resetAt: number | null;
}

/** The last thing that happened to one credential, as the observability endpoint reports it. */
export interface OutcomeRecord {
  readonly credentialId: string;
  readonly lastOutcome: RoutingOutcome;
  readonly lastReason: string | null;
  readonly updatedAt: number;
}

/**
 * The routing state the gateway derives between requests. Every write is an upsert keyed by the
 * credential, so one credential has exactly one row in each table and a second failure updates the
 * count instead of appending a row. One credential, one state: the alternative is a history nobody
 * reads and a table that grows with every request.
 */
@Injectable()
export class RoutingRepository {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  listLockouts(): LockoutRecord[] {
    return this.db
      .select({
        credentialId: credentialLockouts.credentialId,
        consecutiveFailures: credentialLockouts.consecutiveFailures,
        lockedUntil: credentialLockouts.lockedUntil,
      })
      .from(credentialLockouts)
      .orderBy(asc(credentialLockouts.credentialId))
      .all();
  }

  saveLockout(record: LockoutRecord, updatedAt: number): void {
    this.db
      .insert(credentialLockouts)
      .values({ ...record, updatedAt })
      .onConflictDoUpdate({
        target: credentialLockouts.credentialId,
        set: {
          consecutiveFailures: record.consecutiveFailures,
          lockedUntil: record.lockedUntil,
          updatedAt,
        },
      })
      .run();
  }

  listQuotas(): QuotaRecord[] {
    return this.db
      .select({
        credentialId: quotaUsage.credentialId,
        remainingRequests: quotaUsage.remainingRequests,
        remainingTokens: quotaUsage.remainingTokens,
        resetAt: quotaUsage.resetAt,
      })
      .from(quotaUsage)
      .orderBy(asc(quotaUsage.credentialId))
      .all();
  }

  saveQuota(record: QuotaRecord, observedAt: number): void {
    this.db
      .insert(quotaUsage)
      .values({ ...record, observedAt })
      .onConflictDoUpdate({
        target: quotaUsage.credentialId,
        set: {
          remainingRequests: record.remainingRequests,
          remainingTokens: record.remainingTokens,
          resetAt: record.resetAt,
          observedAt,
        },
      })
      .run();
  }

  listOutcomes(): OutcomeRecord[] {
    return this.db
      .select()
      .from(routingState)
      .orderBy(asc(routingState.credentialId))
      .all();
  }

  /** The outcome of the credential that served, or the reason one was skipped or failed. */
  recordOutcome(record: OutcomeRecord): void {
    this.db
      .insert(routingState)
      .values(record)
      .onConflictDoUpdate({
        target: routingState.credentialId,
        set: {
          lastOutcome: record.lastOutcome,
          lastReason: record.lastReason,
          updatedAt: record.updatedAt,
        },
      })
      .run();
  }

  findOutcome(credentialId: string): OutcomeRecord | undefined {
    return this.db.select().from(routingState).where(eq(routingState.credentialId, credentialId)).get();
  }
}