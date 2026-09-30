# Fix: the drop detail cannot carry provider data, the log is asserted, and a wrong shaped field is not silence

Spec ID: 016
Status: pending
Branch: feature/v1-gateway
Origin: spec 015, the residue of the audit of spec 014 (`run_00008`). Three items H-2, H-3 and H-4, each with the decision it needed now written and implemented here.

## Objective

Close the three gaps that audit left in the fix of H-B7 and H-B8, none of them a defect in behaviour but all of them defects in what the code promises.

## Design

### H-2: the detail of a drop is closed, not a free string

`FrameReport` was `(code, detail: string) => void`, and its comment promised that the detail never carries the content of a frame while the type allowed anything. One implementation of the port ignoring its parameter is not a guarantee: the day a second implementation logs the detail, a codec that passed the payload would leak provider data into a log, which is exactly what this project forbids.

The port now takes a `FrameDrop`: a reason from a closed union (`not_an_object`, `parsed_not_an_object`, `unexpected_field_shape`), the field it concerns from a closed union (`choices`, `delta`, `candidates`, `content`, `parts`) and the shape that arrived from a closed union (`array`, `number`, `string`, `boolean`, `null`, `other`). Every value of that shape is written by this repository about a value it inspected; none of them can carry a value from the provider, and the compiler is what enforces it, not a comment.

The audit of this spec measured the limit of that sentence and spec 017 records the correction: the type stops every direct value (five probes fail with `TS2322` and `TS2345`), and it does not stop a codec that types its own parameter with `any`, a value that arrives as `any`, or an explicit cast. The type raises the cost of a leak; what closes it is the runtime check spec 017 added to the log line, which writes `unrecognized` instead of anything it does not recognize.

### H-3: the log line is asserted where it is written

`payload.spec.ts` asserted the line that `countFrameDrops` builds and nothing asserted that `ChatService` writes it. The claim "asserted, not assumed" was therefore half true, and spec 014 records the correction.

A new `chat.service.spec.ts` builds the service over a router double and a frame double, consumes a stream that carries two frames the translator drops, and asserts the captured warning: one line for the whole request, carrying the request id and the count, written once no matter how many frames were dropped. Capturing uses `Logger.overrideLogger`, which Nest puts there for exactly this, and which is confined to that test process.

Carrying the reasons into the line is the other half of H-2: a line that says only how many frames were lost does not say why, and the reasons are the diagnosis. The line becomes `route request=<id> outcome=frame_dropped frames=<n> reasons=<a,b>`, with distinct reasons sorted. Everything spec 014's criterion required of the line is still there (the request, the stable code, the count) and nothing of a frame is.

### H-4: a field that is present with the wrong shape is reported

`parseFrame` reports the frames that are not objects, and two codecs still answered nothing for an object frame carrying a field in a shape they do not model: `choices` that is not an array of objects, a `delta` that is not an object, a `candidates` whose `content` is not an object, `content.parts` that is not an array, or a part that is not an object. The client saw a stream that simply ended.

The rule that separates the two cases, and the decision this spec makes:

- A field that is **absent** is a frame that carries nothing for the client. It is not a drop and it is not reported. OpenAI's final usage chunk has no `choices`, and reporting it would make every healthy stream warn.
- A field that is **present with the wrong shape** is a frame the codec could not read. It is reported as `unexpected_field_shape` with the field and the shape, and the codec still answers nothing, because one unreadable frame must not break a stream that is otherwise fine.

## Acceptance criteria

- [x] A test proves the compiler, not the comment, keeps provider data out of the port: passing a value that is not one of the closed reasons, fields or shapes does not compile, and the case is recorded by the typecheck failing. Proven on 2026-09-30: with `{ reason: 'invented_reason' }` in `parseFrame`, `tsc` answers `error TS2322: Type '"invented_reason"' is not assignable to type 'FrameDropReason'`, and the file was restored byte identical, verified by hash.
- [x] A test asserts that an absent field is not reported, twice: a frame with no `choices` and a frame with `choices` empty. The first is OpenAI's final usage chunk, which the case asserts carries the usage and no drop; the same pair is asserted for Gemini's `usageMetadata` and for a candidate whose `content` holds no `parts`.
- [x] A test asserts that each of the wrong shaped fields named above is reported with its field and its shape, in both codecs, and that red-before-green holds: with the reporting disabled, those cases fail. The red run gives exactly three failures: the two codec cases and the log line below.
- [x] A test asserts the line `ChatService` writes: one per request, with the request id, the count and the distinct reasons, and never a frame content. `chat.service.spec.ts` consumes a stream of three frames over the real openai codec, asserts the single line `route request=req-1 outcome=frame_dropped frames=2 reasons=not_an_object,unexpected_field_shape`, that the readable frame still reached the client, and that a stream whose frames all read writes nothing.
- [x] The suites of specs 001 to 015 keep passing, and the end to end run keeps passing. 363 backend tests, 19 command line tests, 17 interface tests, the build of the four workspaces and the 27 case end to end run, all green.
- [x] Spec 015 ticks H-2, H-3 and H-4 with the commit that closes this one.
- [x] An independent audit reproduces every criterion, including the induced red run. RUN on 2026-09-30 (`run_00011`, report in `temp/audit-016-report.md`). It reproduced the compiler probes with five of its own variants, verified criteria 2, 3 and 5 with its own commands and its own red run, confirmed the capture of the log is isolated per process, and refuted the scope of criterion 4: the assertion covers `ChatService` to codec, not the production pair in `pairs.ts`, and emptying that forward left the whole suite green. It also measured that the closed type can be bypassed without a cast and that a payload forced into `reason` reached the line literally. Three findings were fixed in spec 017 the same day (A16-1, A16-2 and A16-3) and four are registered in spec 015 (A16-4, A16-5, A16-6 and A16-7). The claim about the compiler in the design above is corrected with what the audit measured.

## Risks

- Reporting a legitimate empty frame would turn every healthy stream into a warning, which is why the absent case has its own test in both directions.
- A closed union in the port is a contract change; the codecs are the only callers and the compiler lists them, so the change cannot leave one behind silently.
- Capturing the Nest log globally in a test could leak into other tests of the same process; the suite runs one file per process, and the capture is installed and removed inside the file.

## Out of scope, and why

The same wrong shaped field inside a non streaming response: no port reaches `decodeResponse`, the answer arrives whole, and an unreadable inner field produces an empty answer the client can see, which is not the same silence as a stream that ends with no frame and no failure. Registering it in spec 015 is the honest place if it is ever worth a port of its own.

## Status

implemented on 2026-09-30. The port takes a `FrameDrop` of closed values instead of a free string, the log line carries the count and the distinct reasons, and the two codecs report a field that is present with a shape they do not model while staying silent about a field that is simply absent.

The evidence: the compiler rejects an invented reason (`TS2322`, file restored byte identical and verified by hash), and disabling the reporting in the two codecs plus the warning in `ChatService` makes exactly three of the new cases fail while the rest stay green, with all three files restored byte identical. The gate afterwards: 363 backend tests, 19 command line tests, 17 interface tests, the build and the 27 case end to end run, all green.

One expectation of the coordinating session was wrong and the test says so instead: a frame with no `choices` is not empty for the client, because OpenAI's final chunk carries the usage. The case asserts the usage chunk and the absence of a drop, which is the fact that matters.

## Status of the audit

Dispatched to an independent lane with the commit that closed this spec. Nothing here is marked verified by an independent reader until it returns, and the criterion stays unticked until then.