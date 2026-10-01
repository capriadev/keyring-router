# Routing: candidates, lockout, quota and fallback

Spec ID: 004
Status: pending
Branch: feature/v1-gateway
Depends on: spec 002 (catalog), spec 003 (request router) and spec 005 (secrets).

## Objective

Turn `request-router` from "one namespace, one credential" into a decision that accounts for health: the name the client used keeps selecting one exact account, and what routing adds is respecting priority, skipping an account that is in lockout or out of quota, and falling back when the first choice fails. Several accounts of one provider are expressed by giving them different names, which is what makes them useful instead of confusing. How far the fallback goes is the open decision recorded below.

## Scope

In scope:

- Candidate resolution: the first segment of the model id is the namespace the client used, and it resolves to one account with its provider and base URL. Producing more than one candidate depends on the open decision recorded below.
- Priority order, with a documented and visible tie breaker.
- Lockout: after N consecutive failures a credential is skipped for a cooldown, with recovery on the first success after the window.
- Quota: per credential request and token windows, when the provider reports limits; unknown limits are stated as unknown, never guessed.
- Degradation reporting so the UI can show which credential carried the request and why the others were skipped.
- Persistence of routing state in `dal/`, with the shape of that state owned by KR and not borrowed.
- `GET /api/routing/state` for observability, secret free.

Out of scope: money accounting per request, benchmark driven automatic combos, provider health autopilot, and cross provider semantic equivalence claims.

## Decisions

### Taken, and confirmed by the product owner on 2026-10-01: the first segment is the custom namespace

The name a client uses in `name/model` is the namespace the user chose when registering the credential, and it points to one account: one provider, one base URL, one secret. Three OpenAI accounts for three different uses are three names (`openai-x`, `openai-trabajo`, `openai-personal`) and the client asks for the one it wants.

The earlier wording of this spec, "across credentials when the exposed model is a combo name", is retired: there is no second syntax and no group alias. A combo name was always this, the namespace, and the router already resolves it (one namespace to one credential, unique index `credentials_namespace_unique`).

Consequence for the rest of the spec: with one name per account, candidate resolution yields one candidate, so "which of several accounts serves this name" does not arise. What routing still adds is health (lockout, quota and observability) plus the failure behaviour below.

### Open: what happens when the named account fails

Not decided. The options and their cost:

1. Explicit selection and nothing more: the name picks one account and, if it fails, the request fails with a clear error. This spec reduces to lockout, quota when a provider reports it, and observability, with no rotation and no chain. Smallest change, and the client keeps control of which account is used.
2. Explicit selection plus optional failover: a name still belongs to one account, and the user may declare that two or more accounts share a public name to rotate and be prioritised among them. That is where priority and the chain live, and it relaxes the unique index, which is a schema decision.
3. Automatic rotation inside one provider although the name belongs to one account: request `openai-personal/model` and, if that account is down, the gateway uses another OpenAI account without asking. Most convenient, and it breaks the explicit control this product is built on.

Recommendation: option 1 for v1 with lockout and observability, and option 2 as the shape of a later version if the need appears. `lockout.ts`, `quota.ts` and `state.ts` are identical under all three; only `candidates.ts` and `verdict.ts` differ.

## Design

- `bll/routing/`: `candidates.ts` (who can serve), `verdict.ts` (the decision), `lockout.ts`, `quota.ts`, `state.ts`.
- The verdict is a pure function over candidates, state and a passed in clock, so it is order independent where possible and fully testable without timers.
- `dal/` gains `routing_state`, `credential_lockouts` and `quota_usage`. KR's persistence, not a port of anyone else's.
- References, adapted with attribution: OmniRoute `src/domain/policyEngine.ts`, `fallbackPolicy.ts`, `lockoutPolicy.ts`, `degradation.ts` and `quotaCache.ts` (MIT). Behavioural reference only, no code: `free-claude-code` `providers/request_recovery.py` and `providers/stream_recovery.py` (AGPL).

## Acceptance criteria

- [ ] Two accounts of the same provider rotate deterministically according to the documented rule, proven by a test. Conditional on the open decision: under option 1 this criterion retires, because a name selects one account and there is nothing to rotate among; under option 2 it is written against the shared public name.
- [ ] A credential that fails N times consecutively is skipped for the cooldown and returns to service afterwards.
- [ ] A quota exhausted credential is skipped, and a credential with unknown quota is used instead of being treated as exhausted.
- [ ] The fallback chain is respected in order and its exhaustion produces one clear error naming every attempt. Conditional on the open decision: the chain only exists if option 2 is chosen.
- [ ] A mid stream failure after the first byte does not re route silently; it is reported, and this behaviour is tested.
- [ ] `GET /api/routing/state` exposes no secret and no model payload.
- [ ] Specs 001, 002, 003 and 005 suites keep passing.
- [ ] An independent audit reproduces every criterion above, including one induced failure per branch of the verdict.

## Risks

- Silent re routing after a stream started would duplicate output. The rule is explicit: no re route once bytes were sent.
- Quota windows are per provider and often undocumented. The design treats an unknown limit as unknown and never invents one.
- Lockout thresholds that are too eager turn a healthy provider into an outage. Defaults stay conservative and configurable.

## Status

pending, and blocked on one decision rather than on code: what happens when the named account fails, recorded under Decisions. The naming itself is settled. Everything that does not depend on that answer (lockout, quota when a provider reports it, and `GET /api/routing/state`) can be planned and built while it is decided.
