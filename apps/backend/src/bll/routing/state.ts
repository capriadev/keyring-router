import type { LockoutRecord, QuotaRecord } from '../../dal/repositories/routing.repository.js';
import type { CredentialServiceState, RoutingState } from '../../types/routing.js';
import { quotaExhaustedUntil } from './quota.js';

export interface ServiceStateInput {
  readonly lockouts: readonly LockoutRecord[];
  readonly quotas: readonly QuotaRecord[];
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
    // The window is held from the instant it was observed, never from the instant it is read: a hold
    // recomputed at read time would slide forward on every request and never expire. The verdict is
    // what compares the resulting absolute bound against the request's own clock.
    const until = quotaExhaustedUntil(
      {
        remainingRequests: quota.remainingRequests,
        remainingTokens: quota.remainingTokens,
        resetAt: quota.resetAt,
      },
      quota.observedAt,
    );

    services.set(quota.credentialId, {
      lockedUntil: services.get(quota.credentialId)?.lockedUntil ?? null,
      quotaExhaustedUntil: until,
    });
  }

  return { services };
}