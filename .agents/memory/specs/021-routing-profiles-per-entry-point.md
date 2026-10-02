# Routing profiles per entry point

Spec ID: 021
Status: pending
Branch: feature/v1-gateway
Depends on: spec 004 (routing), spec 003 (the request router), spec 010 (shared contracts).
Origin: spec 004 left "the entry point and its profile" open and recommended shipping the profile without opening the authentication question. The mode and the cascade live today in `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE`, an interim whose default is `normal`.

## Objective

Give the mode and the cascade a home per entry point. The owner wants several client facing profiles, one for an agent and one for a service, each with its own mode and its own cascade, instead of one global setting. This spec turns the interim configuration into the named profiles the owner asked for, selected by the client on the surface the gateway already serves, and leaves the client facing key to a later decision.

## Scope

In scope:

- The entry point entity: a name, a mode and a cascade, persisted in `dal/` and served by `/api` and the CLI, the same way a credential and a policy are.
- Selection on the client surface: a client selects its profile by name, and a request that names none is served by the default entry point, which reproduces today's behaviour.
- The router reads the profile instead of the global configuration. `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE` seed the default entry point on a fresh database and are ignored afterwards.
- Validation of a profile: the mode is one of the three, each cascade entry is a non empty provider model id, and the entries are unique.
- Observability: the routing state and the resolved log line name the entry point and the mode that served.

Out of scope:

- The client facing key. A name is not a secret, and the key is the first client facing authentication the product would have: a separate, later decision. This spec ships the profile without it.
- Per request overrides of the mode or the cascade.
- Rate limiting, per entry point quotas, or multi user concerns.

## Decisions

### Taken: the profile belongs to the entry point, and the client selects it by name

The owner wants "several APIs", one per consumer. The first version expresses that as named profiles on the one surface the gateway serves, which is shippable without a new authentication mechanism: the gateway stays on loopback, where a name is enough to select a policy and nothing about it is a secret. The recommendation of spec 004 is followed: the profile belongs to the entry point.

### Recommended, to confirm while implementing: selection by a path segment

The cleanest fit for "several APIs" is a distinct base URL per entry point: a client points at `http://127.0.0.1:4310/v1/<name>` and appends the protocol path it already appends (`/chat/completions`, `/messages`, `/models`). The default entry point serves `/v1/...` unchanged, so nothing a client uses today moves. Names that would collide with the protocol paths (`chat`, `messages`, `models`) are refused. The alternative, a header the client sends, is named here so the choice is visible; it is worse for a tool whose base URL is configured once.

### Open: whether the entry point also carries its own key

The reading that fits "one for an agent, one for a service" is a key per consumer, and it is the first client facing authentication this product would have, which is a security decision of its own. It is not taken here. If the owner wants it, it opens as its own spec, on top of this one.

## Design

- `dal/`: an `entry_points` table (id, name unique, mode, cascade as JSON text, is_default, created_at), a repository, and one additive migration. No `DROP`, no `RENAME`, no table rebuild.
- `bll/routing/`: `entry-point.ts` validates a profile (the mode against the three, the cascade against the same rules `candidates.ts` already assumes). The router takes the profile as an input instead of reading `AppEnv`, so the decision stays pure and testable.
- `bll/routing/`: `ChatService` resolves the selected entry point's profile and passes it to `plan()`. The global configuration stops being read on the request path.
- `gateway/`: `GET`, `POST` and `DELETE /api/entry-points`; the client surface resolves the name from the path (or the header, per the recommendation above) and falls back to the default.
- `config/`: the seed of the default entry point from `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE`, applied once when the table is empty.
- `cli`: `kr entry-point list`, `add`, `remove`, going through the same API as the panel.

## Acceptance criteria

- [ ] A request served under entry point A uses A's mode and A's cascade; under B, B's.
- [ ] A request that names no entry point is served by the default, which reproduces today's behaviour (`normal`, the named account and nothing else).
- [ ] An unknown entry point name is refused the same way an unknown model is: one answer, with no hint of which names exist.
- [ ] Once entry points exist, the mode and the cascade are no longer read from the global configuration on the request path.
- [ ] On a fresh database, `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE` seed the default entry point; an installation that had set them keeps behaving the same.
- [ ] The migration is additive: a database created by spec 004 migrates without losing credentials, catalog rows, policies or routing state.
- [ ] `GET /api/routing/state` names the entry point and the mode that served a request.
- [ ] Specs 001 to 004 and 022 suites keep passing.
- [ ] An independent audit reproduces every criterion above.

## Risks

- A profile selected by a name the client sends is not authentication. The gateway must stay on loopback until the key spec, and this must be said where a reader will see it.
- Moving the mode out of the configuration can change behaviour for an installation that set it. Seeding the default entry point from the configuration is what keeps it stable, and it is an acceptance criterion.
- The default entry point's cascade is the one that already ships; the seed copies it rather than asking for it again.

## Status

pending. Not started. The mode and the cascade live in `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE` until this spec gives them their home; the change is deliberately inert by default, so nothing a client uses today moves until an entry point is created.