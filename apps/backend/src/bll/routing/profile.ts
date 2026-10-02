import type { RoutingMode, RoutingProfile } from '../../types/routing.js';

/** The three modes, so a stored value can be checked without importing the cascade builder. */
const MODES: readonly RoutingMode[] = ['normal', 'auto_model', 'auto_general'];

/** What a plan needs: a mode and a cascade, with no model attached. */
export interface RoutingPlanProfile {
  readonly mode: RoutingMode;
  readonly cascade: readonly string[];
}

export interface ProfileInput {
  readonly providerModelId: string;
  readonly mode: string;
  readonly cascade: readonly string[];
}

/**
 * Reason a profile cannot be stored, or null when it can. It names the field, never the value: the model
 * ids a user writes are their own data, so a message a client can read quotes the field and lets the
 * wrong entry be corrected without echoing what was typed. Same style as `patternProblem` for a policy.
 */
export function profileProblem(input: ProfileInput): string | null {
  if (input.providerModelId.trim() === '') {
    return 'providerModelId must not be empty';
  }

  if (!MODES.includes(input.mode as RoutingMode)) {
    return `mode must be one of ${MODES.join(', ')}`;
  }

  const seen = new Set<string>();

  for (const entry of input.cascade) {
    if (entry.trim() === '') {
      return 'a cascade entry must not be empty';
    }

    if (seen.has(entry)) {
      return 'a cascade entry must not repeat';
    }

    seen.add(entry);
  }

  return null;
}

/**
 * The profile that applies to one requested model, or the fallback when none is stored. The lookup is by
 * the model id alone, which is the confirmed decision: the name the client used takes no part, so two
 * namespaces asking for the same model route the same way. Pure: no clock, no store, no state, which is
 * what makes the fallback testable without a gateway running.
 */
export function resolveProfile(
  providerModelId: string,
  profiles: readonly RoutingProfile[],
  fallback: RoutingPlanProfile,
): RoutingPlanProfile {
  const profile = profiles.find((candidate) => candidate.providerModelId === providerModelId);

  return profile === undefined ? fallback : { mode: profile.mode, cascade: profile.cascade };
}