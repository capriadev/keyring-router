import type { RoutingAttempt, RoutingState, SkippedAttempt } from '../../types/routing.js';

export interface VerdictInput {
  /** Attempts already ordered by the cascade, in the order they would be tried. */
  readonly attempts: readonly RoutingAttempt[];
  readonly state: RoutingState;
  /** Passed in, so the same state and the same instant always decide the same way. */
  readonly now: number;
}

export interface RoutingVerdict {
  /** What will be tried, in order, with the ones out of service removed. */
  readonly attempts: readonly RoutingAttempt[];
  /** What was removed and why, so a report can explain the decision instead of hiding it. */
  readonly skipped: readonly SkippedAttempt[];
}

/**
 * Removes the candidates that cannot serve right now, which is all the verdict does to the order: it
 * never reorders, so the user's preference is preserved, and it never adds, so nothing the user did
 * not list is tried.
 *
 * A credential the gateway knows nothing about is kept: an unknown quota is unknown, not exhausted.
 * A credential still inside its cooldown, or one whose window is exhausted, is skipped with its
 * reason; lockout is checked first because it is the state a user can act on.
 */
export function applyServiceState(input: VerdictInput): RoutingVerdict {
  const attempts: RoutingAttempt[] = [];
  const skipped: SkippedAttempt[] = [];

  for (const attempt of input.attempts) {
    const service = input.state.services.get(attempt.credentialId);
    const locked = service?.lockedUntil != null && service.lockedUntil > input.now;
    const exhausted = service?.quotaExhaustedUntil != null && service.quotaExhaustedUntil > input.now;

    if (locked) {
      skipped.push({ attempt, reason: 'locked_out' });
      continue;
    }

    if (exhausted) {
      skipped.push({ attempt, reason: 'quota_exhausted' });
      continue;
    }

    attempts.push(attempt);
  }

  return { attempts, skipped };
}

/** An empty state: nothing is known about any credential, so everything is in service. */
export function emptyRoutingState(): RoutingState {
  return { services: new Map() };
}