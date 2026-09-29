# Own API: OpenAI compatible facade with protocol translation

Spec ID: 003
Status: pending
Branch: feature/v1-gateway
Depends on: spec 002 for the catalog formats and spec 005 for cloud credentials.

## Objective

Give Keyring Router the endpoint a client actually points at: `POST /v1/chat/completions` and `GET /v1/models`, so any OpenAI shaped tool works against the namespaced models the policy exposes, and a Claude shaped client works through `POST /v1/messages`. The protocol is translated per provider, so a client never has to know which upstream answers.

## The rule that shapes it

The facade is a projection, not a second catalog. `/v1/models` serves the same policy filtered set as `/api/models`, and a request resolves one namespace to one credential. No second listing, no second policy evaluation, ever.

## Scope

In scope:

- `GET /v1/models` in OpenAI shape, sourced from the existing policy filtered listing.
- `POST /v1/chat/completions`, non streaming and streaming with SSE.
- `POST /v1/messages` for Claude shaped clients.
- Translation both ways between `openai`, `claude` and `gemini`, including tool calls, images and the parameters the catalog declares per model.
- Unsupported parameter handling driven by the catalog `unsupportedParams`: the parameter is removed because the provider would reject it, and the response names it in a `kr_warnings` field. Nothing is flattened silently.
- Error mapping to the OpenAI error shape, with a stable code and a secret free message.
- Client disconnect aborts the upstream request instead of burning tokens.
- One routing decision log line per request, with non secret identifiers only.

Out of scope: rotation, fallback and quota (spec 004), embeddings, images, audio and rerank endpoints, `/v1/responses`, provider side web search, and server side conversation state.

## Design

- HTTP surface in `gateway/` (controllers plus zod validation, zero business logic).
- `bll/routing/request-router.ts`: resolves namespaced model to credential, catalog entry, format and adapter. This spec resolves a single candidate; choosing among several is spec 004.
- `bll/translation/`: `registry.ts` (a `from:to` map where duplicate registration fails loudly), `openai-to-claude.ts`, `claude-to-openai.ts`, `openai-to-gemini.ts`, `gemini-to-openai.ts` and `stream.ts` for chunk level translation. Pattern adapted from the OmniRoute translator registry, MIT, attributed in `THIRD_PARTY_NOTICES.md`.
- Adapters gain `chatCompletions(target, request)` plus a streaming variant, still behind the contract frozen in spec 001. No provider detail leaks into the core.
- Streaming: provider frames are normalized to the shape the client asked for, `[DONE]` and usage frames included. A mid stream provider failure ends the stream with an error frame, never a silent truncation.

## Acceptance criteria

- [ ] `/v1/models` returns exactly the same identifier set as `/api/models`, proven by a test that compares both.
- [ ] A non streaming completion against a loopback stub provider returns a well formed OpenAI response.
- [ ] A streaming completion emits a valid SSE sequence, and the test asserts the frame sequence, not just the concatenated text.
- [ ] Tool calls survive a translation round trip in both directions.
- [ ] A parameter listed in the model `unsupportedParams` is removed from the upstream body and named in `kr_warnings`.
- [ ] A provider failure maps to the documented error shape with the provider failure code and no secret.
- [ ] A client disconnect aborts the upstream request, proven with a stub that records its abort signal.
- [ ] `/v1/messages` accepts a Claude shaped request and answers in Claude shape.
- [ ] No log line carries a model payload, a secret or an authorization header.
- [ ] Spec 001 and spec 005 suites keep passing, and the end to end flow over a real socket still works.
- [ ] An independent audit reproduces every criterion above.

## Risks

- Streaming translation is where subtle bugs live: chunk boundaries, tool call deltas, usage frames. Tests assert sequences.
- Parameter drift per provider shows up as an upstream 400. The error mapping must name the offending field so the catalog can be corrected instead of guessed at.
- Two protocols in, two out, so the translator matrix grows fast. The registry keeps it explicit and the unsupported pairs fail loudly instead of passing through mangled.

## Status

pending
