# Routing: modes, cascade, lockout, quota and observability

Spec ID: 004
Status: pending
Branch: feature/v1-gateway
Depends on: spec 002 (catalog), spec 003 (request router) and spec 005 (secrets).

## Objective

Turn `request-router` from "one namespace, one credential" into a decision that accounts for health and for an ordered cascade: the name the client used selects one account, and the mode of its entry point decides what happens when that account fails, from failing with a clear message to walking a preference list of models the user wrote. Several accounts of one provider are expressed by giving them different names, which is what makes them useful instead of confusing.

## Scope

In scope:

- Candidate resolution: the first segment of the model id is the namespace the client used, and it resolves to one account with its provider and base URL. A cascade entry names a model instead, and its candidates are every credential that exposes that model.
- The three modes and the ordered cascade, recorded under Decisions.
- Priority order among the candidates of one entry, with a documented and visible tie breaker.
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

Consequence for the rest of the spec: asked by its name, a request resolves to one account, and what routing adds is health (lockout, quota and observability) plus the failure behaviour below. Asked by a cascade entry, the same resolution yields every credential that exposes that model, which is where rotation among them happens, ordered by priority.

### Decided by the product owner on 2026-10-01: three modes and an ordered cascade

Routing has three modes, chosen per entry point (see below), with `normal` as the default:

1. `normal`: exactly what an API does today. The named account fails and the request fails with a clear message. No rotation.
2. `auto model`: the intent of the request is kept and the cascade is followed. When the requested model fails or no credential exposes it, the gateway walks the ordered list and continues with the next entry that some credential exposes and that answers.
3. `auto general`: the same cascade, plus the freedom to rotate the credential or the provider for the same model, and to go beyond the list when nothing in it works.

The cascade is an ordered list of models the user already has registered, for example A = `gpt-6-luna`, B = `claude-sonnet-5.5`, C = `gpt-5.6-terra`. It is a preference order the user writes, and that is what keeps cost predictable: the router never invents a cheaper or a more expensive target, it walks the order it was given. The example the owner gave: a request for `raul/gpt-6-luna` fails, no other credential exposes `gpt-6-luna`, the list has C = `gpt-5.6-terra` and some credential exposes it, so the request continues there.

Two consequences worth writing down:

- A list entry is a model id, not a (credential, model) pair. Resolving it is the question the router already answers: which credentials expose this model. Rotation among several credentials of one provider therefore appears naturally, without a second syntax and without relaxing the unique index on the namespace.
- The cascade can only act before the first byte. Once a stream started, the rule of spec 003 holds: no silent re-route, the failure is reported.

### Open: the entry point and its profile

The owner wants several entry points, "several APIs", one used by an agent and another by a service, each with its own mode and its own cascade. Two things are not decided:

- What an entry point is exactly: its own client-facing key and endpoint, or a name the client selects on the one endpoint the gateway already serves. A key per consumer is the reading that fits "one for an agent, one for a service", and it is also the first client-facing authentication this product would have, which is a security decision of its own.
- Whether the mode and the cascade are only per entry point or also overridable per request.

Recommendation: the profile belongs to the entry point, and the entry point gets its own key. The first version of this can ship with a single entry point carrying the profile, which is what makes it shippable without opening the authentication question yet.

## Design

- `bll/routing/`: `candidates.ts` (who can serve), `verdict.ts` (the decision), `lockout.ts`, `quota.ts`, `state.ts`.
- The verdict is a pure function over candidates, state and a passed in clock, so it is order independent where possible and fully testable without timers.
- `dal/` gains `routing_state`, `credential_lockouts` and `quota_usage`. KR's persistence, not a port of anyone else's.
- References, adapted with attribution: OmniRoute `src/domain/policyEngine.ts`, `fallbackPolicy.ts`, `lockoutPolicy.ts`, `degradation.ts` and `quotaCache.ts` (MIT). Behavioural reference only, no code: `free-claude-code` `providers/request_recovery.py` and `providers/stream_recovery.py` (AGPL).

## Acceptance criteria

- [ ] `normal` keeps today's behaviour exactly: the named account fails and the request fails with a clear message, with nothing else tried.
- [ ] `auto model` walks the cascade in the order it was written and continues with the first entry that some credential exposes and that answers; when no entry works, one clear error names every attempt in order.
- [ ] `auto general` also rotates the credential or the provider for the same model, and reaches beyond the list when nothing in it works.
- [ ] The cascade never invents a target: only the entries the user wrote are tried, so the cost order is the user's and never the gateway's.
- [ ] Two credentials that expose the same model are ordered deterministically by the documented rule, proven by a test.
- [ ] A credential that fails N times consecutively is skipped for the cooldown and returns to service afterwards.
- [ ] A quota exhausted credential is skipped, and a credential with unknown quota is used instead of being treated as exhausted.
- [ ] A mid stream failure after the first byte does not re route silently; it is reported, and this behaviour is tested.
- [ ] `GET /api/routing/state` exposes no secret and no model payload.
- [ ] Specs 001, 002, 003 and 005 suites keep passing.
- [ ] An independent audit reproduces every criterion above, including one induced failure per branch of the verdict.

## Risks

- Silent re routing after a stream started would duplicate output. The rule is explicit: no re route once bytes were sent.
- Quota windows are per provider and often undocumented. The design treats an unknown limit as unknown and never invents one.
- Lockout thresholds that are too eager turn a healthy provider into an outage. Defaults stay conservative and configurable.

## Status

in progress since 2026-10-01. Eight slices implemented, each with the red run recorded and the whole gate green:

1. `bll/routing/candidates.ts` and `bll/routing/verdict.ts`: the ordered attempts of each mode (including the owner's example) and the candidates removed for being out of service, as pure functions, 14 tests.
2. `bll/routing/lockout.ts` and `bll/routing/quota.ts`: when a credential goes out of service (and the rule that a client abort never counts against it) and how long a reported window holds it, 15 tests.
3. `dal/schema/routing.ts` with migration `0002`, reviewed in full before applying: `credential_lockouts`, `quota_usage` and `routing_state`, all additive, no `DROP`, no `RENAME`, no table rebuild.
4. `dal/repositories/routing.repository.ts` (upsert per credential) and `bll/routing/state.ts` (rows into the state the verdict reads), 14 tests.
5. `bll/routing/request-router.ts`: `plan()` (mode, cascade and state into the ordered attempts plus the skipped ones) and `resolveAttempt()` (a credential by id, so a cascade entry may name another account), sharing `buildRoute()` with the direct path, 9 tests.
6. `bll/routing/chat.service.ts`: the facade walks the attempts and only advances before the first frame of the current one; one clear error names every attempt when the list is exhausted. The mode and the cascade live in `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE`, defaulting to `normal`. 8 tests.
7. `bll/routing/state.service.ts`: the single writer of the routing tables (the lockout rule applied in one place; a client abort never counts), wired into the facade. 6 tests.
8. `GET /api/routing/state` (no secrets) via `RoutingStateService.snapshot()`, reusing the same assembly the verdict reads. 2 `snapshot()` unit tests; the route itself has no controller spec and no end to end call yet.

Audited by an independent pass, which reproduced every acceptance criterion from this spec, induced a failure per branch of the verdict, and confirmed the core mechanics end to end over a real socket. It found no blocker, one major defect (the quota hold never expired; fixed in the same session) and corrected the ordering rule this spec had described wrongly. The rest is recorded in spec 022.

Still open, none blocking: a provider that reports its window in headers is not read, and no production path writes a quota row, so "quota exhausted is skipped" is exercised only by tests; the per-request degradation report is computed but not surfaced; and a failure while resolving a later attempt, or after a stream started, does not reach a later candidate. Spec 022 takes each one. The mode needs a home until feature 21 gives it one per entry point: the interim is a configuration value whose default is `normal`, which is today's behaviour, so nothing changes unless it is opted into.

The design below was agreed before this and is not edited now that it runs: the naming (the namespace is the custom name, one name per account) and the failure behaviour (three modes over an ordered cascade of model ids the user writes) are recorded under Decisions. What stays open is the entry point and its profile, feature 21: several client facing APIs, one per consumer, each with its own mode and cascade and probably its own key.
