/**
 * What a provider told us about the remaining window of one credential. Every field is nullable
 * because providers report limits unevenly and often not at all, and an unknown number must stay
 * unknown instead of becoming a guess.
 */
export interface QuotaObservation {
  readonly remainingRequests: number | null;
  readonly remainingTokens: number | null;
  /** Epoch ms the window resets at, when the provider says so. */
  readonly resetAt: number | null;
}

/**
 * How long a credential is held when the provider says the window is out but not when it reopens. It
 * is the one default in this file, and it exists because "zero remaining, reset unknown" cannot be
 * turned into a decision without one. It is deliberately short: being wrong on the optimistic side
 * costs one refused call, being wrong on the pessimistic side takes a working credential out.
 */
export const DEFAULT_QUOTA_HOLD_MS = 60_000;

/**
 * Until when the credential should be skipped for quota, or null when it is usable. Zero remaining in
 * either dimension is what counts as exhausted; a missing number is not zero, so a provider that
 * reports nothing never marks its own credential as out.
 */
export function quotaExhaustedUntil(
  observation: QuotaObservation,
  now: number,
  holdMs: number = DEFAULT_QUOTA_HOLD_MS,
): number | null {
  const exhausted = observation.remainingRequests === 0 || observation.remainingTokens === 0;

  if (!exhausted) {
    return null;
  }

  if (observation.resetAt !== null) {
    // A reset at or before now means the window already reopened, whatever the counter said.
    return observation.resetAt > now ? observation.resetAt : null;
  }

  return now + holdMs;
}