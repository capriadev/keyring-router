# Fix: the audit findings of spec 016

Spec ID: 017
Status: pending
Branch: feature/v1-gateway
Origin: the audit of spec 016 (`run_00011`, report in `temp/audit-016-report.md`). Seven findings: one important, six minor. Three are fixed here with their own tests, and four are registered in spec 015 with the decision each one needs.

## Objective

Close the important finding, which is a coverage gap the spec itself introduced, and the two minor ones that are code and naming rather than decisions.

## Design

### A16-1 (important): the production link is asserted

`pairs.ts` re-forwards the report to the codec, and it is the only thing that carries a drop from the translator the service actually holds down to the codec that drops it. The audit measured the gap: emptying that forward leaves the whole backend suite green (`363/363`) and the typecheck clean, so a regression that returns production drops to silence passes the gate. `chat.service.spec.ts` replaces the translator with an object, so it proves `ChatService` to codec, not the pair.

The assertion goes where the link lives: a case over the real pair (`createPairTranslator('openai', 'openai')`) hands a frame the codec cannot read together with a report, and asserts both that the frame yields nothing and that the drop arrives. With the forward removed, this case is the only one that fails, which is the red run recorded below.

### A16-2 (minor): the log is the last line of defence, not the type

The closed union stops direct values: the audit's own probes show five variants failing with `TS2322` and `TS2345`. It cannot stop everything, and the audit proved it twice: a codec that types its own parameter `(code, drop: any)`, a value that arrives as `any` (what `JSON.parse` returns), or an explicit `as` all compile, and there is no lint rule in this repository that forbids `any`. Worse, the audit forced a payload into `reason` and the line carried it literally (`reasons={"prompt":"sk-secret-value"}`), because the only production consumer reads that field.

Two changes follow. The line now writes a reason only when it is one of the three this repository defines, and writes `unrecognized` otherwise: whatever reaches the port at runtime, the log cannot carry provider data. And the claim in spec 016 that the compiler is what enforces the promise is corrected to what the audit measured: the type raises the cost of a leak, it does not make the leak impossible, and the runtime check is what closes it.

### A16-3 (minor): the count counts drops, not frames

The line said `frames=<n>` while counting reports, and one Gemini frame whose `parts` holds three unreadable elements is a single frame with three drops. The field is renamed to `drops=<n>`, which is what it always was, and a case records the three-drops-one-frame shape so the semantics do not have to be inferred from the code.

## Acceptance criteria

- [x] A test over the real pair asserts that a drop reaches the caller through `pairs.ts`, and it is the only case that fails when the forward is removed: red run recorded with its literal output. With only the forward in `pairs.ts:47` emptied, `pairs.spec.ts` gives 66 tests, 65 pass and exactly one failure, this case; the file was restored byte identical, verified by hash. Before this case existed, the audit measured the same revert with the whole suite green (363 of 363), which is the gap it closes.
- [x] A test asserts that a reason forced into the port is written as `unrecognized` and never as its content, with the forced value being a payload: red before the guard, recorded. With the guard disabled the line reads `drops=1 reasons={"prompt":"sk-secret-value"}`, which is the leak the audit demonstrated; with the guard it reads `reasons=unrecognized`.
- [x] The line reads `drops=<n>`, and a case asserts that one frame with three unreadable parts is three drops.
- [x] The suites of specs 001 to 016 keep passing, and the end to end run keeps passing. 366 backend tests, 19 command line tests, 17 interface tests, the build of the four workspaces and the 27 case end to end run, all green.
- [x] Spec 016's claim about the compiler is corrected where it is written, and spec 015 registers A16-4, A16-5, A16-6 and A16-7 with their severity and the decision each needs.
- [ ] An independent audit reproduces every criterion. RAN and did not finish: `run_00016` (2026-09-30, report in `temp/audit-017-report.md`) spent the round on a finding about the working tree and its report contains no criterion. The finding is real and is recorded in the Status below; the criteria keep no independent read, so this stays unticked and the round is not counted as the audit this spec asked for.

## Risks

- Renaming the field changes a line that two specs assert; both are updated in this commit, and the criterion spec 014 set on the line (the request, the stable code, the count) still holds.
- A runtime whitelist is defence in depth, not a type: it can only ever downgrade an unexpected reason to `unrecognized`, never validate a shape or a field, and it is written that way.

## Status

implemented on 2026-09-30. The forward in `pairs.ts` now has a case of its own over the real pair, the log line writes a reason only when it is one of the three this repository defines and `unrecognized` otherwise, and the count is named `drops` because that is what it counts.

The evidence: emptying the forward fails exactly one case of `pairs.spec.ts` (66 tests, 65 pass, 1 fail) where the audit had measured the whole suite green; disabling the guard makes the line carry the forced payload literally; both files were restored byte identical, verified by hash. The gate afterwards: 366 backend tests, 19 command line tests, 17 interface tests, the build and the 27 case end to end run, all green.

## Status of the audit, which ran and did not finish

The audit ran on 2026-09-30 (`run_00016`, report in `temp/audit-017-report.md`) and spent the round on a finding about the working tree rather than on the criteria. It is a real finding and it is worth writing down exactly:

- F1 (important): the tree was **not** clean when the round started. `pairs.ts` held the emptied forward, which is the red state of criterion 1. The cause is not the restores of this spec, which are verified: a lane that died mid flight (`run_00015`, `Unauthorized`) left the product file with its own red state applied after backing it up. The audit measured that the delivered tree then failed the whole suite (366 tests, 365 pass, 1 fail), and that the commit `de4f243` itself is correct: the emptied forward existed only in the working tree.
- The audit restored `pairs.ts` to the content of HEAD, byte for byte, with no git command that writes, and kept the as-found bytes in `temp/a17_audit_asfound_pairs.ts` so nothing was lost. It reported the decision instead of taking it silently.
- Criteria 1 to 4 of this spec have no independent read: the report does not contain them. The criterion above stays unticked for that reason, and the round is not counted as the audit this spec asked for.

What this teaches the process is in `.agents/memory/errors/agent-lane-died-mid-write.md`: the tree has to be checked immediately before dispatching an audit and again after any lane dies, because a dying lane can leave product files written and the failure reads as a technical one.