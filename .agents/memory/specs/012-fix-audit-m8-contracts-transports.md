# Fix: audit of the shared contracts and the provider transports

Spec ID: 012
Status: active
Branch: feature/v1-gateway
Origin: independent audit by the `kr-audit` lane (run_00018) over `9b74d65`. It reproduced the seven criteria of spec 010 against the repository with literal output, and reviewed the two transport files the coordinating agent wrote (`chat-transport.ts`, `sse.ts`), which spec 010 never covered. Every finding below carries the audit's own execution evidence: the review and the coordinator produced none.

## Objective

Fix what the audit proved broken, and leave the repository claiming only what it tests. Two criteria of spec 010 do not hold today (the CLI keeps seven partial copies of wire shapes, and `ApiErrorCode` is declared twice with nothing joining the copies), and the transports carry three defects that no test looks at: neither file has a single direct test.

## Findings

| Id | Severity | Proved by the audit | Decision |
|---|---|---|---|
| A-4a | important | The CLI declares seven partial copies of wire shapes, with `as` over the response body, and `status.ts` already diverges (`status: string` against `status: 'ok'`) | The CLI consumes `@keyring-router/contracts` and its copies are deleted |
| A-4b | important | `ApiErrorCode` is declared twice (`gateway/api-errors.ts` and the package) with nothing joining them: a new backend code fails nowhere | The two are bound by subset assertions, so adding a code on one side fails the typecheck of the other |
| A-4c | minor | The error bodies type `code` as `string`, so the documented union is not connected to the body that is really served | Both error bodies type `code` as the union |
| A-1b | minor | Neither app declares the dependency: it resolves through the workspace link npm creates | Both apps declare it |
| A-6b | minor | The superseded layout block in `architecture.md` does not mention `packages/` | Registered there too |
| H-B1 | important | `timeoutMs` is inert on every chat call: `signal ?? AbortSignal.timeout(...)` lets the client signal replace the budget instead of combining with it. Measured: 60 ms ignored, still pending at 503 ms | The two signals combine with `AbortSignal.any`, and a test measures the budget with a client signal present |
| H-B2 | important | `chat-transport` never applies `auth.query`, so a `query` scheme sends no credential at all. Latent: no catalog entry declares it yet | The transport applies `withQuery`, as the three adapters already do, with a test that reads the URL the provider received |
| H-B3 | important | The SSE reader accumulates without a ceiling: 64 MB fed produced zero frames and 422 MB of heap, failing only when the body closed | A ceiling on the pending buffer fails loudly, and a test feeds past it |
| H-B4 | minor | An empty `data:` or a `data` line without a colon cuts the stream with `invalid_response` | Both are legal: a block that carries no data is skipped, not fatal |
| H-B5 | minor | A lone CR terminator, legal in the format, breaks the stream | The boundary accepts CR as a terminator |
| H-B6 | minor | `displayUrl` is computed on every call and never read | Removed |
| H-B7 | minor | Inside the transport a client abort is reported as `unreachable` | Deferred: it needs a decision on the adapter error contract, which spec 001 froze, so it lands in its own fix |
| H-B8 | minor | A JSON frame that is not an object is discarded with no notice (`payload.ts`, `openai.codec.ts`) | Deferred: outside the two files this spec audits |
| S-1 | important | The end to end harness comment claims a frame split across two reads is exercised, while every write carries a whole frame, so that coverage does not exist | The harness performs the split for real, and the comment describes what the code does |

## Out of scope

- The interface running against a live API: `apps/frontend` has no test script and the end to end run does not start Next. Criterion A.5 stays verified by types and reading until the interface milestone.
- A real provider and a real client disconnect over a socket: everything runs against loopback stubs with an injected fetch.
- CI execution: the workflow commands were read and reproduce locally, but Actions was not run.

## Acceptance criteria

- [x] Every fixed finding has a test that fails without the fix.
- [x] The CLI imports the wire shapes from the package and declares none of its own.
- [x] Adding a code to either `ApiErrorCode` declaration fails the typecheck of the other.
- [x] The four workspace typechecks, the backend and command line suites, the build and the end to end run pass.
- [ ] An independent audit re-reads the fixes and reports what it could not check.

## Risks

- Touching `http.ts` reaches every adapter: the transport is shared by four protocols, so the adapter suites are the guard and they run before the commit.
- The SSE ceiling has to be generous. It bounds the pending buffer, not the stream: a provider may send an answer as large as it likes as long as frames keep being closed.
- The CLI adoption touches six files that no test covers as wire shapes; its 19 tests read responses through those types, so a wrong import shows up as a failing assertion rather than at compile time.

## Status

fixes applied on 2026-09-29, in two commits: `a294795` (the three transport defects, with the first direct tests those two files have ever had, and the end to end harness now splitting a frame for real) and `6134c59` (the error code binding, the command line adoption, the declared dependency in the three apps). Every fixed finding carries a test, and the two that mattered most were proved red before being proved green: with the old `signal ?? budget` line restored, the transport suite fails one case and passes four, and with a code added only to the package, the backend typecheck fails on the binding assertion.

Still owed, and honestly open:

- The re-read by the independent lane (run dispatched after the commits). Until it lands, everything in the two commits is coordinator written and only self verified.
- H-B7 and H-B8 stay deferred by decision: both need a contract change of their own (`ProviderErrorKind` is frozen by spec 001, and the frame handling lives outside the two files this spec audits).
- The three unverifiable items of the first pass are unchanged: no interface running against a live API, no real provider, no CI execution.
