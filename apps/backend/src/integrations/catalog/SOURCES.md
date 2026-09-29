# Provider catalog: the source batch

This is the batch report the provider catalog owes: how many provider folders were read, how many entries
were kept, and why each dropped category was dropped. It covers the extraction of spec 002 and the removals
of spec 009 (F4 and F5). The data it describes lives in `providers/*.ts`, next to this file.

## Source and reuse rule

- Source: `diegosouzapw/OmniRoute`, MIT, Copyright (c) 2026 diegosouzapw.
- Read from `open-sse/config/providers/registry/<provider>/index.ts` and the family files under
  `src/shared/constants/providers/`.
- Allowed families only: API key (`apikey/**`, `local.ts`, `noauth.ts`). Every other family is out of the
  batch before it is read as a candidate, and the reason is the same for all of them: this gateway
  authenticates with a credential the user owns, over HTTP, in a documented protocol.
- No file is copied: entries are re-typed into our own contract (`ProviderCatalogEntry`), keeping the factual
  fields (`format`, `baseUrl`, `urlSuffix`, `authType`, `authHeader`, `authPrefix`, `headers`,
  `requestDefaults` and the model list with its capability flags) and dropping the fields that only mean
  something inside their runtime (`executor`, `oauth`, test key endpoints, reasoning transport internals).
- Every kept entry carries `source: 'OmniRoute (MIT) open-sse/config/providers/registry/<id>/index.ts'`.

## Numbers of the batch

| Measure | Count |
|---|---|
| Provider folders read (read from the registry) | 257 |
| Provider ids declared by the three allowed families | 266 |
| Provider ids left out by the family rule before the batch | 94 |
| Entries kept by spec 002 | 140 |
| Entries kept today (after spec 009 F5) | 135 |
| Entries dropped from the allowed families | 131 |
| Declared models kept today | 896 |

Kept today, by family: `apikey` 130, `local` 2, `noauth` 3.
Kept today, by format: `openai` 128, `claude` 6, `gemini` 1.
Kept today, by `authType`: `bearer` 119, `none` 8, `x-api-key` 8.

The 94 ids outside the batch, by family file: `web-cookie.ts` 34, `oauth.ts` 25, `search.ts` 17,
`audio.ts` 12, `cloud-agent.ts` 3, `upstream-proxy.ts` 2, `system.ts` 1.


## Dropped from the allowed families: 131, with the reason

| Category | Count | Reason it is refused |
|---|---|---|
| Declares no model list | 49 | An entry declares at least one model, so a client can name one. These registry entries are passthrough shells (`models: []`) or declare no model at all. |
| Media or audio service | 25 | Image, video, audio and embedding endpoints. Spec 002 leaves media out of scope: the gateway serves chat completions under its own policy. 15 of them have no registry entry at all, 10 do. |
| Local server with no registry entry | 12 | LM Studio, vLLM, llama.cpp, ComfyUI and peers. The registry declares no static endpoint for them, and a local server is reached through a credential that carries its own base URL. |
| API key id with no registry entry | 27 | Declared in the family constants only: regional and cloud variants (Azure, Vertex partner, SAP, Watson), specialised gateways, and plan targets with no endpoint of their own. Nothing to read. |
| Executor that is not a plain HTTP chat call | 8 | `cloudflare-ai`, `bedrock`, `vertex`, `freebuff`, `duckduckgo-web`, `cloudflare-playground`, `veoaifree-web`, `auggie`: a runtime that drives an SDK, a browser session or a local CLI over stdio, all of which spec 002 refuses. |
| Format not ported | 2 | `clova-studio` (format `clova`) and `codex-app-server` (format `openai-responses`). Only `openai`, `claude`, `gemini` and `ollama` have an adapter. |
| Declares no chat path, only an API root | 1 | `regolo`: its `baseUrl` is `https://api.regolo.ai` with no chat path. A later batch may readmit it, now that a bare host is completed with the documented path of its format. |
| Anonymous relay | 5 | Removed by spec 009 F5. Listed below, one by one. |
| Custom wire format that needs their executor | 1 | `oneminai`: its API takes a single prompt string and answers framed SSE, so a data driven OpenAI compatible adapter cannot speak it. |

## Refused by spec 009

Anonymous relays removed (F5). Their traffic is served by a third party that owns no credential of the user,
which is the reason spec 002 refuses harvested free tokens:

| Removed entry | Endpoint it pointed at | Declared models |
|---|---|---|
| `g4f-gemini` | `https://g4f.space/api/gemini/v1/chat/completions` | 2 |
| `g4f-groq` | `https://g4f.space/api/groq/v1/chat/completions` | 2 |
| `g4f-nvidia` | `https://g4f.space/api/nvidia/v1/chat/completions` | 3 |
| `g4f-ollama` | `https://g4f.space/api/ollama/v1/chat/completions` | 1 |
| `g4f-pollinations` | `https://g4f.space/api/pollinations/v1/chat/completions` | 2 |

Client identity removed by the sweep (F4), out of every field that could carry one: headers, `urlSuffix`,
`authHeader`, `authPrefix` and display names.

| Entry | What it carried | What was done |
|---|---|---|
| `anthropic` | a beta header with a CLI flag, and `urlSuffix: '?beta=true'` | The beta header and the suffix are gone. `Anthropic-Version: 2023-06-01` stays: it is protocol metadata, not client identity. |
| `zai` | `urlSuffix: '?beta=true'` | The suffix is gone. `Anthropic-Version` stays. |
| `api-airforce` | the referer and title headers of the source runtime | Both headers are gone. |
| `openrouter` | the referer and title headers of the source runtime | Both headers are gone. |
| `orcarouter` | the referer and title headers of the source runtime | Both headers are gone. |

After the sweep the catalog declares no URL suffix at all, and its five remaining header blocks carry
`Anthropic-Version` only. `catalog.spec.ts` asserts both facts, and scans every entry for CLI, fingerprint and
impersonation markers.

One inspected item stays, with the reason: 18 model labels of the `command-code` entry end in `(CC)`. It is
display data of a model the vendor's plan exposes, like the model ids the vendor publishes; it is not a
header, a suffix or a prefix, so it never travels with a request. It is reported here so the decision is
visible instead of implicit.

## Reviewed and kept: the gray zone

Reported for the product decision the audit asked for, with the facts as they stand. None of these passes
traffic through a third party relay: each one needs a credential the user owns, except the keyless ones,
whose endpoint is the provider's own free surface.

| Entry | Credential | Endpoint | Declared models |
|---|---|---|---|
| `xkiro` | `bearer` | `https://api.xkiro.com/v1/chat/completions` | 39, most of them `:free` |
| `token-kiosk` | `bearer` | `https://agent-router.gaib.ai/v1/chat/completions` | 5 |
| `bailian-coding-plan` | `x-api-key` | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic/v1/messages` | 6 |
| `qwen-cloud-token-plan` | `bearer` | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions` | 7 |
| `xiaomi-mimo-token-plan` | `bearer` | `https://token-plan-sgp.xiaomimimo.com/v1/chat/completions` | 2 |
| `glm` | `bearer` | `https://api.z.ai/api/coding/paas/v4/chat/completions` | 21 |
| `pollinations` | none | `https://gen.pollinations.ai/v1/chat/completions` | 31 |
| `kilo-gateway` | none | `https://api.kilo.ai/api/gateway/chat/completions` | 6 |
| `ovhcloud` | none | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions` | 3 |
| `aihorde` | none | `https://oai.aihorde.net/v1/chat/completions` | 3 |
| `opencode` | none | `https://opencode.ai/zen/v1/chat/completions` | 6 |
| `uncloseai` | none | `https://hermes.ai.unturf.com/v1/chat/completions` | 1 |

The four coding plan entries point at the vendor's own subscription endpoint, and `glm` at the vendor's own
coding plan: a key for them is a credential of that vendor. The keyless entries are a provider's own service.
All of them are kept, and a later product decision can remove any of them without touching code, because a
provider is data.

## How these numbers were measured

- Folders read: `Get-ChildItem open-sse/config/providers/registry -Directory` on the source clone, 257.
- Family ids: the quoted and bare object keys of each family file under `src/shared/constants/providers/`.
- Kept entries and their fields: `listCatalog()` of `apps/backend/src/integrations/catalog/catalog.js`.
- Dropped entries per category: each id declared by the three allowed families that is not in our catalog,
  classified by the `format`, `executor`, `models` and `baseUrl` of its registry entry. The measuring script
  is a throwaway run in `temp/`, not part of the tree; the numbers above are what it reports.
- What is not verifiable today: the per id decision of the spec 002 batch itself. That batch left no log, which
  is why one id (`uc-direct`) is reported as unreviewed instead of being given a reason it may not have had.

| Dropped in the first batch without a recorded reason | 1 | `uc-direct`. Flagged for review instead of guessed: it declares an OpenAI compatible chat path, an `x-api-key` placement and a model list, so nothing in the rule refuses it. |
