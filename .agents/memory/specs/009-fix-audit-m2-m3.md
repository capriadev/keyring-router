# Fix the M2 and M3 audit findings

Spec ID: 009
Status: active
Branch: feature/v1-gateway
Origin: independent audit of commit 5cafa8b, full report kept at `temp/m2-m3-report.md` (gitignored during the run).

## Objective

Close every finding the independent audit produced against the provider catalog (spec 002) and the encrypted secrets (spec 005), and close the two process gaps it exposed: the catalog had no read path in the API, and the end to end evidence of spec 001 lived in a gitignored script instead of the repository.

## Findings and fixes

### F1, high. The catalog has no read path, and its 906 models have no consumer

`GET /api/providers` only listed Ollama, because `ProviderRegistry.list()` walks adapters without catalog entries. A client could not discover which provider ids exist.

Fix: `GET /api/providers` serves the catalog: id, alias, display name, format, auth type, the auth kinds a credential may store, the default base URL and the declared model count. `GET /api/providers/:id` adds the declared models. Secret free, and never duplicating the discovered catalog of a credential.

### F2, high. The spec 001 end to end evidence is not in the repository

The flow lived in `apps/backend/data/verify-flow.mjs`, gitignored, so the repository cannot reproduce the claim, and nobody noticed when M3 changed a field name.

Fix: a versioned end to end runner, `npm run e2e --workspace apps/backend`, that boots the app on a real loopback socket with a temporary database, uses stub providers, and asserts the full flow. Its assertions are updated to the current contract: the credential listing may carry `authKind` and `secretHint`, and must never carry ciphertext, IV, tag or plaintext.

### F3, medium. A unicode secret is accepted and can never reach a provider

`fetch` rejects a header value outside Latin-1, the adapter translated that into `unreachable`, and the user read a message blaming the provider.

Fix: the credential boundary rejects a secret that cannot travel in a header, naming the reason. The crypto round trip keeps covering unicode at the unit level, where it belongs.

### F4, medium. The `anthropic` entry travels with Claude Code CLI identity

`Anthropic-Beta: claude-code-20250219,...` plus `urlSuffix: '?beta=true'` is exactly the CLI identity spoofing that spec 002 excludes and `discarded/web-cookie-mitm-and-cli-spoofing.md` records as rejected.

Fix: remove that beta value and the suffix, and sweep the whole catalog for any other identity, fingerprint or CLI marker.

### F5, medium. Anonymous relays pass the user's traffic through a third party

Five `g4f-*` entries point at a free relay that resells access to other providers' models.

Fix: remove them. Providers that resell access without a credential owned by the user do not belong in the catalog, even when their auth type is `none`. Each removal is listed in the batch report.

### F6, medium. The batch report the spec required does not exist

Fix: `apps/backend/src/integrations/catalog/SOURCES.md` with the numbers (folders read, entries kept, entries dropped per category) and the reason for each dropped category.

### F7, low. The secret fixture is copied in five spec files

Fix: every adapter spec imports the shared fixture module instead of declaring its own constant.

### F8, low. A bare host produces a wrong path and a misleading message

The claude and gemini adapters build `/messages` and `/models` from a host without a path, and the success detail names a path that may not be the one used.

Fix: when the base URL carries no path beyond the root, the adapter completes it with the catalog entry's documented path for that format; and every error and success detail names the full URL requested, never a bare path.

### F9, low. `AuthKindUnsupportedError` says the opposite of what happened

Fix: the message states that the auth kind is now storable and which kinds are expected.

## Acceptance criteria

- [ ] `GET /api/providers` lists every catalog entry with its model count, and `GET /api/providers/:id` lists its models, both secret free.
- [ ] `npm run e2e --workspace apps/backend` passes from a clean checkout, on a temporary database, with no external service.
- [ ] A secret outside Latin-1 is rejected at creation with a message that names the cause.
- [ ] No catalog entry carries a CLI identity, fingerprint or impersonation header; proven by a grep and by a test.
- [ ] No catalog entry points at an anonymous relay; the batch report lists every removal.
- [ ] `SOURCES.md` states the batch numbers and the dropped categories.
- [ ] The shared fixture module is the only place a test secret constant is declared.
- [ ] A bare host works for the four formats, and every detail names the full URL.
- [ ] The full bar passes again: typecheck, tests, build, e2e, and an independent re audit of the findings.

## Status

completed on 2026-09-29
