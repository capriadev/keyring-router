# Routing: candidates, lockout, quota and fallback

Spec ID: 004
Status: pending
Branch: feature/v1-gateway
Depends on: spec 002 (catalog), spec 003 (request router) and spec 005 (secrets).

## Objective

Turn `request-router` from "one namespace, one credential" into a decision: given a requested model, choose among the credentials that can serve it, respect priority, skip the ones in lockout, respect quota windows, and fall back down a declared chain when the first choice fails. This is what makes several accounts of the same provider useful instead of confusing.

## Scope

In scope:

- Candidate resolution: every credential that can serve the requested model, in the caller's namespace or across credentials when the exposed model is a combo name.
- Priority order, with a documented and visible tie breaker.
- Lockout: after N consecutive failures a credential is skipped for a cooldown, with recovery on the first success after the window.
- Quota: per credential request and token windows, when the provider reports limits; unknown limits are stated as unknown, never guessed.
- Degradation reporting so the UI can show which credential carried the request and why the others were skipped.
- Persistence of routing state in `dal/`, with the shape of that state owned by KR and not borrowed.
- `GET /api/routing/state` for observability, secret free.

Out of scope: money accounting per request, benchmark driven automatic combos, provider health autopilot, and cross provider semantic equivalence claims.

## Design

- `bll/routing/`: `candidates.ts` (who can serve), `verdict.ts` (the decision), `lockout.ts`, `quota.ts`, `state.ts`.
- The verdict is a pure function over candidates, state and a passed in clock, so it is order independent where possible and fully testable without timers.
- `dal/` gains `routing_state`, `credential_lockouts` and `quota_usage`. KR's persistence, not a port of anyone else's.
- References, adapted with attribution: OmniRoute `src/domain/policyEngine.ts`, `fallbackPolicy.ts`, `lockoutPolicy.ts`, `degradation.ts` and `quotaCache.ts` (MIT). Behavioural reference only, no code: `free-claude-code` `providers/request_recovery.py` and `providers/stream_recovery.py` (AGPL).

## Acceptance criteria

- [ ] Two credentials of the same provider rotate deterministically according to the documented rule, proven by a test.
- [ ] A credential that fails N times consecutively is skipped for the cooldown and returns to service afterwards.
- [ ] A quota exhausted credential is skipped, and a credential with unknown quota is used instead of being treated as exhausted.
- [ ] The fallback chain is respected in order and its exhaustion produces one clear error naming every attempt.
- [ ] A mid stream failure after the first byte does not re route silently; it is reported, and this behaviour is tested.
- [ ] `GET /api/routing/state` exposes no secret and no model payload.
- [ ] Specs 001, 002, 003 and 005 suites keep passing.
- [ ] An independent audit reproduces every criterion above, including one induced failure per branch of the verdict.

## Risks

- Silent re routing after a stream started would duplicate output. The rule is explicit: no re route once bytes were sent.
- Quota windows are per provider and often undocumented. The design treats an unknown limit as unknown and never invents one.
- Lockout thresholds that are too eager turn a healthy provider into an outage. Defaults stay conservative and configurable.

## Status

pending
