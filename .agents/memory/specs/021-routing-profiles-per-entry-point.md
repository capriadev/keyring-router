# Routing profiles per model

Spec ID: 021
Status: pending
Branch: feature/v1-gateway
Depends on: spec 004 (routing), spec 003 (the request router), spec 010 (shared contracts).
Origin: spec 004 left the profile of a request open and put the mode and the cascade in KR_ROUTING_MODE and KR_ROUTING_CASCADE as an interim. The owner settled the selection question on 2026-10-02: there is no new selector. The client always sends model "name/model" like any OpenAI client, and the profile hangs from the model the client asks for, not from the name. The same name can ask for models with a different mode and cascade.

## Objective

Give the mode and the cascade a home per model, instead of one global setting. A client keeps sending model "name/model" and nothing else changes: the router resolves the name to a credential (spec 004) and reads the profile of that model to route with it. The profile is the mode plus the ordered cascade the user wrote, the exact shape the router of spec 004 already consumes.

## Scope

In scope:

- A routing profile per model: the model it keys on, a mode and a cascade, persisted in dal/ and served by /api and the CLI, the same way a credential and a policy are.
- Selection: implicit. The client names name/model; the router looks the profile up by the model part. No path, no header, no key.
- The fallback when a model has no profile: the global default (normal today, from the configuration), so an installation that never creates a profile behaves exactly as it does now.
- Validation of a profile: the mode is one of the three, each cascade entry is a non empty model id, and the entries are unique.
- Observability: the routing state and the resolved log line name the model and the mode that served.

Out of scope:

- Client facing authentication (a key): a separate, later decision. A name is not a secret and the gateway stays on loopback.
- Per request overrides of the mode or the cascade.
- Profiles keyed by namespace or by consumer.

## Decisions

### Taken by the owner on 2026-10-02: the profile is a property of the model

The client always sends model "name/model" and the backend routes. The profile hangs from the model the client asks for, not from the name: the same name can ask for models with a different mode and cascade. The earlier wording, "profiles per entry point, one per consumer", is retired: there is no entry point entity and no consumer key. A second reading, a profile per namespace, was offered and refused.
Consequence, written so it is not a surprise later: two namespaces that ask for the same model share that model profile. If that ever needs to differ, the key becomes the namespaced id, which is a change to the key of one table, not a redesign.

### Retired: selection by a path segment or a header

Both were offered and refused. Nothing new is added to the request; the model field is the only selector, which is what a router does.

## Design

- `dal/`: a `routing_profiles` table (id, provider_model_id unique, mode, cascade as JSON text, created_at), a repository, and one additive migration. No `DROP`, no `RENAME`, no table rebuild.
- `bll/routing/`: `profile.ts` validates a profile and resolves the profile for a requested model (its model part), falling back to the global default. The router takes the resolved profile as an input instead of reading `AppEnv`, so the decision stays pure and testable.
- `bll/routing/`: `ChatService` resolves the profile for the requested model and passes it to `plan()`.
- `gateway/`: `GET`, `POST` and `DELETE /api/routing/profiles`; the routing state names the model and the mode that served.
- `cli`: `kr profile list`, `add`, `remove`, going through the same API as the panel.
- `config/`: `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE` remain the default of a model with no profile (`normal`, empty cascade), so nothing changes unless a profile is created.

## Acceptance criteria

- [ ] A request for a model that has a profile uses its mode and cascade; a request for a model without one behaves as today (`normal`, the named account and nothing else).
- [ ] The profile is looked up by the model part of `name/model`, independent of the name; two namespaces asking for the same model share its profile (the decision, proven by a test).
- [ ] An invalid profile (unknown mode, empty entry, duplicate entry) is refused with a clear message and not stored.
- [ ] The migration is additive: a database created by spec 004 migrates without losing credentials, catalog rows, policies or routing state.
- [ ] `GET /api/routing/state` names the model and the mode that served.
- [ ] Specs 001 to 004 and 022 suites keep passing.
- [ ] An independent audit reproduces every criterion above.

## Risks

- Sharing a profile across namespaces for the same model is the confirmed decision; it is in the criteria so it is not rediscovered as a surprise.
- Model ids differ per provider, so a profile written for one provider's id does not apply to another's id for the same concept; the cascade is written in ids the user registered, which spec 004 already requires.
- The cascade must not invent a target: only the entries the user wrote are tried, the rule of spec 004, unchanged.

## Status

in progress since 2026-10-02. Two slices implemented, each with the red run recorded and the gate green:

1. `types/routing.ts` gains `RoutingProfile`, and `bll/routing/profile.ts` holds the pure core: `profileProblem` for what can be stored (a model, a known mode, a cascade whose entries are neither empty nor repeated) and `resolveProfile` for what a requested model gets (the stored profile, or the fallback when none exists), looked up by the model id alone. 9 tests.
2. `dal/schema/routing.ts` gains `routing_profiles` and migration `0003_tired_wiccan.sql`, reviewed in full before applying: one `CREATE TABLE` and one `CREATE UNIQUE INDEX`, no `DROP`, no `RENAME`, no table rebuild, no foreign key. `dal/repositories/routing-profiles.repository.ts` reads, inserts and deletes by id, wired into `DalModule`. 6 tests, plus the migration specs updated for the new table and the new count.
3. `bll/routing/request-router.ts` resolves the profile for the requested model (its model part) against the profiles the caller passes, falling back to the installation default; `ChatService` reads the profiles from the store and passes them to `plan()`. 3 tests, including that a model asked under two names shares its profile and that a namespaced key is not a profile.

Left: the `GET/POST/DELETE /api/routing/profiles` surface, the `kr profile` commands, and a service that validates a profile before storing it. The change is inert by default: nothing a client uses today moves until a profile is created.