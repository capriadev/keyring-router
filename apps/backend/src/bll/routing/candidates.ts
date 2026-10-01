import type { RoutingAttempt, RoutingCandidate, RoutingMode } from '../../types/routing.js';

export interface AttemptsInput {
  readonly mode: RoutingMode;
  /** The model the client asked for, already split into its two parts by the caller. */
  readonly requested: { readonly namespace: string; readonly providerModelId: string };
  /**
   * The ordered list of fallbacks the user wrote, as provider model ids. An entry is matched against
   * `providerModelId` exactly and is never split on a slash: provider model ids carry slashes of their
   * own (`meta/llama-3`), so reading one as a namespace would resolve the wrong candidate. Pinning an
   * exact account inside an entry is a later feature, not an implicit reading of this one.
   */
  readonly cascade: readonly string[];
  /**
   * Every exposed (credential, model) pair, in the order the caller decided. The order is preserved
   * and is what makes two credentials that expose the same model deterministic: the repository returns
   * them by registration, then by id.
   */
  readonly exposed: readonly RoutingCandidate[];
}

/** One candidate as an attempt, keyed so the same credential and model are never tried twice. */
function keyOf(candidate: RoutingCandidate): string {
  return `${candidate.credentialId}:${candidate.providerModelId}`;
}

/**
 * The ordered list of attempts for one request, which is the whole of the mode difference:
 *
 * - `normal`: the named candidate and nothing else, so the request behaves like a direct API call.
 * - `auto_model`: the named candidate first, then every candidate that exposes each cascade entry in
 *   the order the user wrote, which is how another provider holding the same model gets a turn. It
 *   never invents a target: only the requested model and the written entries are tried, so the cost
 *   order is the user's.
 * - `auto_general`: the same list, plus everything else the user exposed, which is what lets it reach
 *   beyond the list when nothing in it works.
 *
 * Pure: it reads no clock, no database and no state, so the order a request would take is testable
 * without timers and without a gateway running.
 */
export function buildAttempts(input: AttemptsInput): readonly RoutingAttempt[] {
  const attempts: RoutingAttempt[] = [];
  const seen = new Set<string>();

  const add = (
    candidate: RoutingCandidate,
    origin: RoutingAttempt['origin'],
    cascadeIndex: number | null,
  ): void => {
    const key = keyOf(candidate);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    attempts.push({ ...candidate, origin, cascadeIndex });
  };

  for (const candidate of input.exposed) {
    if (
      candidate.namespace === input.requested.namespace &&
      candidate.providerModelId === input.requested.providerModelId
    ) {
      add(candidate, 'requested', null);
    }
  }

  if (input.mode === 'normal') {
    return attempts;
  }

  input.cascade.forEach((entry, index) => {
    for (const candidate of input.exposed) {
      if (candidate.providerModelId === entry) {
        add(candidate, 'cascade', index);
      }
    }
  });

  if (input.mode === 'auto_general') {
    for (const candidate of input.exposed) {
      add(candidate, 'beyond', null);
    }
  }

  return attempts;
}