# Fix: the audit findings of spec 017

Spec ID: 018
Status: pending
Branch: feature/v1-gateway
Origin: the second round of the audit of spec 017 (`run_00018`, report in `temp/audit-017-report-round2.md`). Its four criteria hold with declared limits, it found no blocking or important defect, and it left six findings. Three are fixed here and four are registered in spec 015.

## Objective

Close the two findings that are code, and the limit the audit declared on its own criterion 1, so that the union of the two halves it measured becomes a case that runs.

## Design

### F2-1 (minor): the guard reads the reason twice

The runtime check reads `drop.reason` once inside `KNOWN_REASONS.includes(...)` and again in the true branch of the ternary. A value whose `reason` is an accessor answers a known reason to the first read and anything to the second, and the second read is what enters the set: the audit measured a line carrying `reasons=LEAKED-PROVIDER-TEXT` with two reads and not with one. A frame cannot produce an accessor, so this is only reachable from code that already ignores the type, which is why it is minor and why it is still worth one line: the reason is read once into a constant and that constant is what the check and the set use.

### F2-4 (minor): the model id reaches the router log line raw

`request-router.ts:136` interpolates the requested model id into the log line, and the client-facing schema bounds it by length only (`v1-schemas.ts:10`), so an invisible character can reach that line and change how it reads. The audit of spec 018 measured that the stronger version of this claim, "an id carrying a line break forges a second log line", was not reachable in this tree: the policy's anchored pattern cannot match such an id, so the request is refused before the router and the only line written is the refusal. The rule is still worth having, because it turns a confusing refusal into a clear 400 at the boundary, and spec 019 widened the class it refuses, since `Cc` alone left the format characters out.

### The limit the audit declared on criterion 1

It measured that the new case guards the forward in `pairs.ts`, and that the composition `pairs.ts` to `ChatService.log` is exercised by nobody: `chat.service.spec.ts` replaces the translator with an object, so the pair link is tested without the log and the log link without the pair. The same spec now builds its route over the real pair (`createPairTranslator('openai', 'openai')`) and its stream carries a frame with a wrong shaped field, so one case runs the whole chain and covers both kinds of reason.

## Acceptance criteria

- [x] A test asserts that a reason answering differently on each read is written as `unrecognized`, with the number of reads measured: red before the fix, recorded. With the double read restored, the case fails (the line then carries the second answer) and the case asserts `reads` is 1, which is what makes it safe.
- [x] A test asserts that the v1 chat schema refuses a model id carrying a control character, and that a normal id still passes. Red before the fix, recorded: with the character rule disabled the case fails.
- [x] The case that runs the whole chain asserts the line it produces, and it is the one that fails when the forward in `pairs.ts` is emptied: red run recorded. `chat.service.spec.ts` now builds its route over `createPairTranslator('openai', 'openai')` and its stream carries a frame with a wrong shaped field, so one case runs pair to codec to line for both kinds of reason.
- [x] The suites of specs 001 to 017 keep passing, and the end to end run keeps passing. 369 backend tests, 19 command line tests, 17 interface tests, the build of the four workspaces and the 27 case end to end run, all green.
- [x] Spec 015 registers F2-2, F2-3, F2-5, F2-6 and the observation about the provider text in a 502 body, and spec 017 ticks its audit criterion with this round's outcome and its declared limits.
- [ ] An independent audit reproduces every criterion. OWED: five dispatches failed with `Unauthorized` in a row (`run_00019`, `run_00020`, `run_00022` on `kr-audit` and `run_00021` on `kr-audit-m9`) between 2026-09-30 06:5x and 07:0x, three of them after the account had been re-authenticated, so the failure is intermittent rather than a setting. One of those failures left `pairs.ts` with its red state applied, which the coordinator caught with the pre-dispatch check and restored from HEAD, keeping the as-found bytes in `temp/pairs18-asfound.ts`. The baseline for the next attempt is `7f37218` with a clean tree, and the auditor is instructed to run its reds on a copy of the repository so a dying lane cannot touch the product.

## Risks

- Refusing control characters in a model id could refuse a legitimate id. The rule is the narrowest one that closes the hole: the characters that let a value forge a line are not part of any model id a provider declares, and the case proves a normal id still passes.
- Using the real pair in the service spec makes the case depend on the openai codec's behaviour; it already did, and now it also depends on the pair, which is the point.

## Status

implemented on 2026-09-30. The guard reads the reason once, the v1 schema refuses a control character in a model id, and the case that runs the chain whole now uses the pair the service receives in production.

The evidence: with the three fixes reverted in a single red run, four cases fail, one per fix except the forward, which turns two red (the composition case of the service and the pair case spec 017 added), while the rest stay green; the three files were restored byte identical, verified by hash. The audit of spec 018 measured the number, which this status first wrote as three, and the correction is here. The gate afterwards: 369 backend tests, 19 command line tests, 17 interface tests, the build and the 27 case end to end run, all green.

The audit of this spec is dispatched with this commit and its outcome is ticked when it returns.