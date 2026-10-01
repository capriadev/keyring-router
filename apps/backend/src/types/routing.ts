/**
 * Routing vocabulary, shared by the router, its state and the reports that explain a decision.
 *
 * Nothing here is a secret: a candidate names a credential id and a model id, never a value, so a type
 * of this module can travel to a response body or a log line without redaction.
 */

/**
 * How a request may be served. `normal` is the default and behaves like any API: the account the name
 * points at fails and the request fails. The two automatic modes walk the cascade the user wrote; the
 * general one may also reach beyond it.
 */
export type RoutingMode = 'normal' | 'auto_model' | 'auto_general';

/**
 * One way a request can be served: the credential and the model its provider knows. `namespacedId` is
 * the value a policy pattern was matched against, kept so a report can name what was decided.
 */
export interface RoutingCandidate {
  readonly credentialId: string;
  readonly namespace: string;
  readonly providerId: string;
  readonly providerModelId: string;
  readonly namespacedId: string;
}

/** Why an attempt is on the list, so the order can be explained instead of guessed. */
export type AttemptOrigin = 'requested' | 'cascade' | 'beyond';

/** A candidate the router will try, with the reason it is being tried. */
export interface RoutingAttempt extends RoutingCandidate {
  readonly origin: AttemptOrigin;
  /** Position of the cascade entry that produced it, or null for the requested model and beyond. */
  readonly cascadeIndex: number | null;
}

/**
 * What is known about one credential's ability to serve right now. A null bound means "not in that
 * state", and an absent entry means the gateway knows nothing about it, which is not the same as
 * something being wrong: an unknown quota is used, never treated as exhausted.
 */
export interface CredentialServiceState {
  /** Epoch ms until which the credential is skipped, or null when it is in service. */
  readonly lockedUntil: number | null;
  /** Epoch ms until which its quota window is exhausted, or null when unknown or available. */
  readonly quotaExhaustedUntil: number | null;
}

export interface RoutingState {
  readonly services: ReadonlyMap<string, CredentialServiceState>;
}

export type RoutingSkipReason = 'locked_out' | 'quota_exhausted';

/** The last thing that happened to a credential, as the observability endpoint reports it. */
export type RoutingOutcome = 'served' | 'skipped' | 'failed';

export interface SkippedAttempt {
  readonly attempt: RoutingAttempt;
  readonly reason: RoutingSkipReason;
}