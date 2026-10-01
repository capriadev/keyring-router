import type { ProviderErrorKind } from '../../types/provider.js';

/** What the gateway knows about one credential's failures and its cooldown. */
export interface LockoutState {
  readonly consecutiveFailures: number;
  readonly lockedUntil: number | null;
}

/**
 * When a credential is taken out of service. Conservative on purpose: a threshold that is too eager
 * turns a healthy provider into an outage, so five consecutive failures and a one minute cooldown is
 * the default, and both numbers are policy rather than constants of the rule.
 */
export interface LockoutPolicy {
  readonly threshold: number;
  readonly cooldownMs: number;
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = { threshold: 5, cooldownMs: 60_000 };

/** The state of a credential that has never failed. */
export const IN_SERVICE: LockoutState = { consecutiveFailures: 0, lockedUntil: null };

/**
 * Whether a failed call counts against the credential. Everything counts except the client's own
 * abort: that is not the credential's fault, and counting it would let a user who cancels their own
 * requests take their own account out of service. Spec 014 made the two failures distinguishable so
 * this rule can exist at all.
 */
export function countsAsFailure(kind: ProviderErrorKind): boolean {
  return kind !== 'aborted';
}

/**
 * One failed call. Below the threshold only the count moves; at the threshold the credential is locked
 * for the cooldown, and a lock already in the future is never shortened by a later failure, so the
 * window always ends at the last time it was determined to be down.
 */
export function recordFailure(
  state: LockoutState,
  policy: LockoutPolicy,
  now: number,
  kind: ProviderErrorKind,
): LockoutState {
  if (!countsAsFailure(kind)) {
    return state;
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  const carried = state.lockedUntil !== null && state.lockedUntil > now ? state.lockedUntil : null;

  if (consecutiveFailures < policy.threshold) {
    return { consecutiveFailures, lockedUntil: carried };
  }

  return { consecutiveFailures, lockedUntil: Math.max(now + policy.cooldownMs, carried ?? 0) };
}

/**
 * One successful call. Recovery is immediate and total: the count returns to zero, because the point
 * of the rule is to notice a credential that is down, not to hold a grudge against one that answered.
 */
export function recordSuccess(): LockoutState {
  return IN_SERVICE;
}