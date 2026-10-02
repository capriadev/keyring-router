import { Inject, Injectable } from '@nestjs/common';
import type { RoutingStateEntry } from '@keyring-router/contracts';
import { RoutingRepository } from '../../dal/repositories/routing.repository.js';
import type { ProviderErrorKind } from '../../types/provider.js';
import {
  DEFAULT_LOCKOUT_POLICY,
  IN_SERVICE,
  recordFailure,
  recordSuccess,
  type LockoutPolicy,
} from './lockout.js';
import { toRoutingState } from './state.js';

/**
 * Turns what happened to a credential into the state the next request reads. It is the one writer of
 * the routing tables, so the lockout rule has a single application point and no caller reimplements it:
 * the transport and the facade only report an outcome, never compute a cooldown.
 *
 * The cooldown is policy (five failures, one minute by default); the rule itself lives in `lockout.ts`
 * as a pure function, so this service is the thin seam between a real failure and that rule.
 */
@Injectable()
export class RoutingStateService {
  constructor(
    @Inject(RoutingRepository) private readonly routing: RoutingRepository,
    private readonly policy: LockoutPolicy = DEFAULT_LOCKOUT_POLICY,
  ) {}

  /** A call the credential answered. Recovery is immediate and total. */
  recordServed(credentialId: string, now: number = Date.now()): void {
    this.routing.saveLockout({ credentialId, ...recordSuccess() }, now);
    this.routing.recordOutcome({ credentialId, lastOutcome: 'served', lastReason: null, updatedAt: now });
  }

  /**
   * A call the credential failed. The kind is what decides whether it counts: the client's own abort
   * never does, so a user who cancels their own requests cannot take their own account out of service.
   */
  recordFailed(credentialId: string, kind: ProviderErrorKind, now: number = Date.now()): void {
    const current = this.routing.listLockouts().find((row) => row.credentialId === credentialId) ?? IN_SERVICE;
    const next = recordFailure(current, this.policy, now, kind);

    this.routing.saveLockout({ credentialId, ...next }, now);
    this.routing.recordOutcome({ credentialId, lastOutcome: 'failed', lastReason: kind, updatedAt: now });
  }

  /**
   * The whole routing state, one entry per credential the gateway knows something about, for the
   * observability endpoint. It reuses the same assembly the verdict reads, so what a report shows is
   * exactly what the next request will act on, and it carries no secret: a credential id and a reason.
   */
  snapshot(): RoutingStateEntry[] {
    const state = toRoutingState({
      lockouts: this.routing.listLockouts(),
      quotas: this.routing.listQuotas(),
    });
    const outcomes = new Map(this.routing.listOutcomes().map((row) => [row.credentialId, row]));
    const known = [...new Set([...state.services.keys(), ...outcomes.keys()])].sort();

    return known.map((credentialId) => {
      const service = state.services.get(credentialId);
      const outcome = outcomes.get(credentialId);

      return {
        credentialId,
        lockedUntil: service?.lockedUntil ?? null,
        quotaExhaustedUntil: service?.quotaExhaustedUntil ?? null,
        lastOutcome: outcome?.lastOutcome ?? null,
        lastReason: outcome?.lastReason ?? null,
      };
    });
  }
}
