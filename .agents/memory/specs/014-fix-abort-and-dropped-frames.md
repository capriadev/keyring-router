# Fix: a client abort is not an unreachable provider, and a dropped frame is not silence

Spec ID: 014
Status: pending
Branch: feature/v1-gateway
Origin: spec 013, items H-B7 and H-B8. Both were deferred by decision to a fix spec of their own, and its criterion asks for three things this spec delivers: the error contract change decided in writing, one test per fix that fails without it, and no invented behaviour.

## Objective

Two silences that make the gateway say something untrue.

A client that closes the connection while a provider call is in flight is reported as `unreachable`: the same failure a provider that is down produces, with a message that claims the provider did not answer. The information needed to tell them apart is already there, because the composed signal carries the client's own abort.

A stream frame that parses to a primitive or an array disappears without a trace: `payload.ts` answers `null` and the stream continues as if the provider had sent nothing, so a provider answering `data: 42` ends the stream with no frame and no failure.

## Design

### The contract decision (H-B7)

`ProviderErrorKind`, in `apps/backend/src/types/provider.ts`, gains a fourth value beside `unreachable`, `unauthorized` and `unknown`: `aborted`, meaning the client stopped the call and nobody is waiting for an answer.

The alternatives were considered and rejected in writing, because spec 001 froze this union and 013 asked for the decision to be explicit:

- An `aborted` flag beside the kind. Rejected: the kind would keep claiming `unreachable`, the message would keep saying the provider did not answer, and a consumer could ignore the flag without anything pointing it out.
- A new error class for the abort. Rejected: every place that catches a `ProviderFailure` would need a second branch for the same event, and the information belongs to the same failure, not to a different one.
- A new kind that also covers the timeout. Rejected: a provider that does not answer inside the budget is genuinely unreachable, and merging the two would hide the one case the user can act on (the call was cancelled) inside the one they cannot.

The classification lives in `send()`, the single place where a provider call is issued and caught: a failure raised while the client's own signal is aborted is `aborted` with the message "the client stopped <operation>"; every other failure keeps the current `unreachable` message, character for character, so the existing transport tests stay valid. The timeout path is not touched, and no message names a duration.

No API surface changes, and that is a decision too: a client that aborted has no reader. The gateway keeps answering 502 `provider_failure` for any `ProviderFailure`, and there is nobody left to receive it. The interface therefore needs no copy for a cancelled request, which closes the second half of the sentence 013 left open. Cancelling from the panel is a different thing and already exists: M9's confirmation is answered locally, and a request abandoned by navigation is the browser's own abort.

The streaming path already tells the two apart and stays as it is: `ChatService` races every frame against the client signal and reports `ClientDisconnectedError`, so a mid-stream disconnect is never a provider failure.

### The dropped frame (H-B8)

`parseFrame` and `parseFrameText` in `bll/translation/payload.ts` are the only lines where a frame that parsed to a primitive or an array disappears. They gain an optional reporter, a `FrameReport` port: `(code: FrameDropCode, detail: string) => void` with the single stable code `frame_dropped`. A frame is reported as dropped only when it arrived carrying something that is not an object; `null`, `undefined`, an empty frame and `[DONE]` keep answering `null` without a report, because those genuinely carry nothing.

The translator contract carries the same optional second argument (`translateChunk(payload, report?)`), and the codecs pass it down. `ChatService` owns the only implementation: it counts the drops of one request and logs one warning when the stream ends, with the request id, the stable code and the count. One line per request, not one per frame: a provider that sends garbage must not flood the log, and the count is the fact worth having.

It is deliberately not a failure and deliberately not a client warning. Not a failure, by 013's decision: one stray frame must not break a stream that is otherwise fine. Not a client warning: the response has already started, so the client cannot be told; the honest place is the log now, and spec 004's degradation report is where a skipped credential or a dropped frame will surface to a user.

The non-streaming path needs nothing: a response that is not an object already fails loudly through `asRecord`.

## Acceptance criteria

- [x] A test asserts that a call whose client signal aborted fails as `aborted`, with a message that names the operation and carries no secret, and the same test run before the fix is recorded as evidence. `integrations/providers/http.spec.ts`, three cases: the abort, the provider that failed, and a budget that ran out without a client abort. Evidence of the red run: reverting the classification makes `reports the client that stopped the call as aborted, not as an unreachable provider` fail, with the other eleven cases green and both files restored byte identical, verified by hash.
- [x] A test asserts that a stream frame carrying a primitive or an array is reported exactly once with the code `frame_dropped` and the count of the request, and that a frame which is an object but carries nothing for the client is not reported. `bll/translation/payload.spec.ts`, nine cases over both shapes, the text case, the empty cases and the codec path. Evidence of the red run: the four reporting cases fail with the report disabled.
- [x] The warning the gateway logs carries the request id, the code and the count, and never a frame content: asserted, not assumed, because a dropped frame is provider data. The line is asserted by exact equality, `route request=abc outcome=frame_dropped frames=2`, which is what proves nothing else is in it, and one case asserts a dropped frame's content never reaches the report. The audit corrected this tick in two ways, both registered in spec 015: the assertion covers the pure half, and nothing asserts that `ChatService` logs it once per request (H-3); and the promise that the detail cannot carry a payload is a comment, not something the type enforces (H-2, the one sub criterion this spec got wrong).
- [x] `unreachable` keeps its exact message for every failure that is not a client abort, proved by the transport suites that already assert it. The three adapter suites and the two transport suites keeping their exact strings are the proof, and the new case for a provider that refused the connection is the explicit one.
- [x] The suites of specs 001 to 013 keep passing, and the end to end run keeps passing. 357 backend tests, 19 command line tests, 17 interface tests, the build of the four workspaces and the 27 case end to end run, all green.
- [x] Spec 013's first criterion is ticked with the commit that closes this one.
- [x] An independent audit reproduces both criteria, including one induced failure per path. RUN on 2026-09-30 (`run_00008`, report in `temp/audit-014-report.md`). It verified criteria 1, 2 and 4 with its own commands, reproduced the red run exactly as written down (5 of 12, the same five cases: four of the report and one of the classification), restored both files with matching SHA256 and matching git blobs, confirmed that `sse.ts` hands a primitive over untouched so the chain closes, and refuted one sub criterion of criterion 3 while calling the absolute reading of the "only place a frame disappears" claim exaggerated. Findings H-2, H-3 and H-4 are registered in spec 015, and H-5 was fixed the same day.

## Risks

- Turning a stray frame into a failure would be worse than the silence it fixes: a stream that is otherwise readable would break. The report is a warning by construction, and the test that asserts an object frame carrying nothing stays silent is what keeps the report narrow.
- A classification that read the composed signal instead of the client's own would report a timeout as an abort. The fix reads the client's signal only.
- An abort that lands at the same instant as a provider failure is reported as `aborted`. That is honest rather than wrong: the client stopped the call, and it is not waiting for the answer.

## Out of scope, and registered elsewhere

A mid-stream provider failure, a socket that dies after the first byte, surfaces as a raw error rather than as a `ProviderFailure` (`sse.ts` iterates the body with no catch around it, and `ChatService` forwards the rejection). It is the same family as this spec, it is not one of the two items 013 decided, and it is registered there as N-7 rather than fixed here.

## Status

implemented on 2026-09-30. `ProviderErrorKind` gained `aborted` with the decision written above; `send()` classifies the client's own abort apart from a provider that did not answer; `payload.ts` reports a frame it had to drop through a `FrameReport` port that the codecs, the pairs and `ChatService` carry, and `frame-report.ts` counts the drops of one request and writes the single line that reports them.

The red run that backs the two fixes: with the classification reverted and the two report calls disabled, 5 of the 12 new cases fail and the other 7 stay green; both files were restored byte identical, verified by hash. Afterwards the whole gate is green again: typecheck of the four workspaces, 357 backend tests, 19 command line tests, 17 interface tests, the build and the 27 case end to end run.

Still owed, and honestly open: the independent audit of the two criteria, blocked on the same account level `Unauthorized` that stopped the audit of spec 008 (runs run_00004, run_00005 and run_00006). Nothing here is marked verified by an independent reader.

That audit ran on 2026-09-30 (`run_00008`, report in `temp/audit-014-report.md`). It verified criteria 1, 2 and 4 with its own commands, reproduced the red run exactly as this status writes it down (5 of 12, the same five cases), and restored both files with matching hashes and matching git blobs. It refuted one sub criterion of the third: the `FrameReport` detail is a free string, so the promise its comment makes is a promise the type does not enforce. It also judged the claim about `parseFrame` true in its strict sense and exaggerated as an absolute, because two codecs still drop object frames the client never sees. That residue, and the one test the audit asked for on the streaming path, are in spec 015; the test is already written.
