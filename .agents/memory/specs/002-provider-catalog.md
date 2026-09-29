# Provider catalog with hybrid adapters (reuse from OmniRoute)

Spec ID: 002
Status: pending
Branch: feature/v1-gateway

## Objective

Give Keyring Router a real provider catalog: many providers with their protocol, endpoint, authentication shape and model capabilities, instead of the single hardcoded Ollama provider of spec 001. The catalog is built by adapting the declarative provider registry of OmniRoute, so the effort goes into Keyring Router's own contract and policy instead of re-deriving 250 provider endpoints by hand.

## Sources and reuse rules

Source 1, adapt and attribute: `diegosouzapw/OmniRoute`, MIT, Copyright (c) 2026 diegosouzapw.

- Read from `open-sse/config/providers/registry/<provider>/index.ts` (257 provider folders) and `open-sse/config/providers/shared.ts` (`interface RegistryEntry`).
- Allowed families only: API key providers (`src/shared/constants/providers/apikey/**`), local (`local.ts`) and no auth (`noauth.ts`).
- Attribution is part of the definition of done: the OmniRoute MIT text in `THIRD_PARTY_NOTICES.md` plus an origin note in every adapted data file.

Source 2, reference only, no code: `Alishahryar1/free-claude-code`, AGPL-3.0-only.

- Read to validate behaviour and to cross-check endpoints: `application/routing.py`, `providers/admission.py`, `providers/request_recovery.py`, `providers/stream_recovery.py`, `api/routes.py`.
- Never copy, never port, never vendor files from it. Incorporating AGPL-3.0 code would relicense the whole of Keyring Router, and deleting it later does not undo a published copy.

Explicitly out of reuse, from OmniRoute: `src/mitm/**`, web cookie providers (`providers/web-cookie.ts`, 28 entries), CLI identity and fingerprint spoofing (`cliFingerprints.ts`, `claudeWebFingerprint.ts`, `codexIdentity.ts`, `codexClient.ts`), harvested free token providers, `open-sse/vendor/**` (no license found), and their persistence layer (`src/lib/db/**`). The reason is product honesty and legal exposure, not effort. Record it in `.agents/memory/discarded/` before implementing.

## The decision this spec makes

Hybrid adapter model, one adapter per protocol plus catalog data:

- A data driven `openai-compatible` adapter serves every provider whose protocol is OpenAI chat completions. It is configured by the catalog fields `baseUrl`, `authType`, `authHeader`, `authPrefix`, `headers` and `requestDefaults`.
- Dedicated adapters exist for native protocols that are not OpenAI shaped: `ollama` (already implemented in spec 001), `claude` and `gemini`.
- A catalog entry declares its `format`, and the registry resolves the adapter by `format`, never by provider id. One adapter per protocol, N catalog entries. Writing one near identical file per provider is the alternative and is rejected: it repeats the same module 250 times.

## Scope

In scope:

- `ProviderCatalogEntry` contract plus zod validation at boot, with loud failure on duplicate id or alias.
- Catalog data for the allowed families, stored as versioned typed data under `apps/backend/src/integrations/catalog/`, one file per family.
- Registry resolution by `format`, keeping `ProviderRegistry.get(providerId)` as the single entry point used by `bll/`.
- Auth header construction per `authType` (bearer, x-api-key, query, none) as one tested module.
- Adaptation of the existing Ollama adapter to the catalog shape without changing its behaviour.
- `THIRD_PARTY_NOTICES.md` with the OmniRoute MIT text.

Out of scope: the OpenAI compatible facade endpoints (spec 003), routing, rotation, fallback and quota (spec 004), credential encryption and `api_key` storage (spec 005), media endpoints (image, video, audio) and any provider that needs a browser session.

## Contract (`apps/backend/src/types/provider-catalog.ts`)

```ts
export type ProviderFormat = 'openai' | 'claude' | 'gemini' | 'ollama';
export type CatalogAuthType = 'none' | 'bearer' | 'x-api-key' | 'query';

export interface CatalogModel {
  readonly id: string;
  readonly displayName: string;
  readonly contextLength?: number;
  readonly maxOutputTokens?: number;
  readonly supportsReasoning?: boolean;
  readonly supportsVision?: boolean;
  readonly unsupportedParams?: readonly string[];
}

export interface ProviderCatalogEntry {
  readonly id: string;
  readonly alias: string;
  readonly displayName: string;
  readonly format: ProviderFormat;
  readonly baseUrl: string;
  readonly urlSuffix?: string;
  readonly authType: CatalogAuthType;
  readonly authHeader?: string;
  readonly authPrefix?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly requestDefaults?: Readonly<Record<string, unknown>>;
  readonly models: readonly CatalogModel[];
  /** Where the entry came from, so attribution survives refactors. */
  readonly source: string;
}
```

Rules:

- `ProviderId` stops being a one item union and becomes a string validated against the catalog at boot.
- `AuthKind` keeps `none` as the only storable kind. The catalog may declare `bearer` or `x-api-key`, but storing such a credential still requires spec 005.
- The catalog never carries a credential value, and no entry may contain a token, cookie or session.

## Layout

- `apps/backend/src/integrations/catalog/providers/<family>.ts`: the data, one file per family.
- `apps/backend/src/integrations/catalog/catalog.ts`: aggregation plus zod validation at module load.
- `apps/backend/src/integrations/catalog/auth-headers.ts`: the single place that turns an `authType` plus a secret into headers.
- `apps/backend/src/integrations/providers/openai-compatible/openai-compatible.adapter.ts`: the data driven adapter.
- `bll/providers/provider-registry.ts`: resolves the adapter by `format`.

## Extraction procedure

1. For each allowed provider folder, read the OmniRoute `RegistryEntry`.
2. Keep the factual fields: `format`, `baseUrl`, `urlSuffix`, `authType`, `authHeader`, `authPrefix`, `headers`, `requestDefaults`, and the model list with its capability fields.
3. Drop OmniRoute specific fields: `executor`, `oauth`, `testKeyBaseUrl`, `testKeyModelsUrl`, reasoning transport internals, and any field whose meaning depends on their runtime.
4. Map formats: `openai` stays `openai`, `claude` stays `claude`, `gemini` stays `gemini`. Anything else leaves the batch and gets counted in the report.
5. Add `source: 'OmniRoute (MIT) open-sse/config/providers/registry/<id>/index.ts'` to every entry.
6. Report the batch size before and after the filter, so the dropped providers stay visible and reviewable.

## Acceptance criteria

- [ ] The catalog validates at boot and a duplicate id or alias fails loudly.
- [ ] Every entry has `format`, `baseUrl`, a valid `authType` and at least one model.
- [ ] Only allowed families are present: no web cookie, OAuth, MITM or harvested token provider.
- [ ] Adapter resolution by format works for `openai`, `claude`, `gemini` and `ollama`.
- [ ] Auth header construction is unit tested per `authType`, including the `none` case.
- [ ] The data driven OpenAI compatible adapter is tested against a loopback stub with no external network.
- [ ] Spec 001 behaviour is unchanged: its 83 tests and its end to end flow keep passing.
- [ ] `THIRD_PARTY_NOTICES.md` carries the OmniRoute MIT notice with its copyright line, and every adapted data file carries its `source` note.
- [ ] A grep proves no file from `free-claude-code` was copied and no secret appears in the catalog.
- [ ] The final report states the batch count: providers read, kept and dropped, with the reason.

## Open decisions

- Keyring Router has no license file and no `license` field in `package.json`. Proposal: MIT, which matches the permissive reuse this spec depends on. It blocks only the attribution file, not the extraction.
- Whether `api_key` credentials become storable in spec 005 with Argon2 based encryption. That is what unlocks the cloud providers this catalog declares.

## Risks

- Endpoint drift: provider APIs change. The catalog is versioned data, and a later discovery path should report drift instead of trusting the entry forever.
- Catalog size: one file per family, validated, so a review stays readable.
- Attribution hygiene: a notice in a single file decays. The per entry `source` field is what keeps it verifiable.

## Status

completed on 2026-09-29
