import type { LockoutRecord, QuotaRecord } from '../../dal/repositories/routing.repository.js';
import type { CredentialServiceState, RoutingState } from '../../types/routing.js';
import { quotaExhaustedUntil } from './quota.js';

export interface ServiceStateInput {
  readonly lockouts: readonly LockoutRecord[];
  readonly quotas: readonly QuotaRecord[];
  /** Passed in, because a quota window is only exhausted relative to an instant. */
  readonly now: number;
}

/**
 * Turns the stored rows into the state the verdict reads. A credential that appears in neither table
 * is simply absent, which is what makes "the gateway knows nothing about it" different from "something
 * is wrong with it": the two tables only hold credentials that have failed or reported a window, so an
 * untouched credential never invents a reason to be skipped.
 */
export function toRoutingState(input: ServiceStateInput): RoutingState {
  const services = new Map<string, CredentialServiceState>();

  for (const lockout of input.lockouts) {
    services.set(lockout.credentialId, {
      lockedUntil: lockout.lockedUntil,
      quotaExhaustedUntil: null,
    });
  }

  for (const quota of input.quotas) {
    const until = quotaExhaustedUntil(
      {
        remainingRequests: quota.remainingRequests,
        remainingTokens: quota.remainingTokens,
        resetAt: quota.resetAt,
      },
      input.now,
    );

    services.set(quota.credentialId, {
      lockedUntil: services.get(quota.credentialId)?.lockedUntil ?? null,
      quotaExhaustedUntil: until,
    });
  }

  return { services };
}