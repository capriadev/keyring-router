# Fix: the audit findings of spec 018

Spec ID: 019
Status: pending
Branch: feature/v1-gateway
Origin: the audit of spec 018 (`run_00023`, report in `temp/audit-018-report.md`). It verified the four criteria, found no blocking or important defect, and left six findings. Three are code and one is a wording that fails to say what it closes; the rest are registered in spec 015.

## Objective

Close the two code findings and correct the two claims of spec 018 that the audit measured as wrong, because a spec that overstates its own evidence is what a future auditor will read literally.

## Design

### H1 (minor): `readFirst` reads its key twice

`payload.ts` reads `source[key]` and then calls `readItems`, which reads `source[key]` again; the audit measured `choices=2` with a counter, and in one of its probes the value that decided the outcome came from the second read and the frame disappeared with no report. It is the same defect as F2-1, one function away. The key is read once and the rest of the function works from that value.

### H2 and H3 (minor): the rule closes `Cc`, not what its name says

The rule was `[^\\p{Cc}]` and its message said "control characters". The audit measured a `Cf` (U+202E, a bidirectional override) reaching the router's resolved line raw and Zl/Zp passing the boundary to be stopped later by the policy's anchored pattern, not by the boundary. So the rule closes one Unicode class and its name claims a property.

The class becomes every non-printable character: `Cc`, `Cf`, `Zl` and `Zp`. The narrowest rule that closes the hole is the one that refuses what cannot be a model id, and an invisible formatting character cannot be part of an identifier a provider declares. The message names the classes it refuses instead of a word that has to be interpreted, and the test asserts one character of each class plus a normal identifier passing on both facades.

### H4 and H5 (minor): two claims of spec 018 corrected

- H4: spec 018 says the red run failed three cases, one per fix. The audit measured four: emptying the forward in `pairs.ts` turns two cases red, the composition case of the service and the pair case of spec 017. The correction is written where the claim is.
- H5: spec 018 justified the boundary rule by saying an id with a line break forges a second log line. Measured with the rule off, it does not: the policy's anchored pattern cannot match such an id, so the request is refused and the only line written is the refusal. The rule is still worth having, because it turns a confusing 404 into a clear 400 before the router, and the premise is corrected to what the audit measured.

## Acceptance criteria

- [x] A test asserts that a field answering differently on each read is read once, so the outcome cannot come from a second read: red before the fix, recorded. With `readFirst` reading its key twice, the case fails with the frame yielding the chunk the second read returned; with the fix it yields nothing and the count of reads is 1.
- [x] A test asserts that each of the four classes is refused at the v1 boundary, that a normal identifier passes, and that both facades refuse it, by calling both schemas rather than asserting it in a comment. The red run with the class narrowed back to `Cc` fails exactly the four cases of `Cf` (twice), `Zl` and `Zp`, while the control character case still passes.
- [x] Spec 018's two claims are corrected where they are written: the number of cases its red run turned red, and the premise of the boundary rule.
- [x] Spec 015 registers what the audit left (the id echoed raw in the body of a 404) and the observations it did not turn into findings.
- [x] The suites of specs 001 to 018 keep passing, and the end to end run keeps passing. 374 backend tests, 19 command line tests, 17 interface tests, the build of the four workspaces and the 27 case end to end run, all green.
- [ ] An independent audit reproduces every criterion. Dispatched with the commit that closes this spec.

## Risks

- Widening the class could refuse a legitimate identifier. The four classes it now refuses are all non-printable, and the test asserts a normal identifier with slashes, dots, digits and a colon passes.
- The boundary is not the only layer: the policy also refuses these ids today, and saying so is part of the honest record, not a reason to leave the boundary loose.

## Status

implemented on 2026-09-30. `readFirst` reads its key once, the v1 boundary refuses every non-printable class instead of `Cc` alone, and the two claims of spec 018 that the audit measured as overstated are corrected where they were written.

The evidence: with `readFirst` reading twice and the class narrowed back to `Cc`, five cases fail, one for the reader and four for the classes the narrow rule left open, while the rest stay green; both files were restored byte identical, verified by hash. The gate afterwards: 374 backend tests, 19 command line tests, 17 interface tests, the build and the 27 case end to end run, all green.

The audit of this spec is dispatched with this commit and its outcome is ticked when it returns.