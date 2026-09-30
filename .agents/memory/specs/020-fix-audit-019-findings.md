# Fix: the audit findings of spec 019

Spec ID: 020
Status: pending
Branch: feature/v1-gateway
Origin: the audit of spec 019 (`run_00024` round, report in `temp/audit-019-report.md`). No blocking or important finding, three minor ones, and all three are the same shape as the ones before: the code is right where it was fixed and the claim written next to it is bigger than the code.

## Objective

Close the class instead of the instance, and make three claims say what the code does.

## Design

### N2 (minor): the class behind H1 is still alive in three callers

Spec 019 fixed `readFirst` reading its key once. The audit measured the same double read in three other places, because each of them checks the array with one read and then hands the field to a reader that reads it again:

- `openai.codec.ts:109` and `:113` (`Array.isArray(record.choices)` then `readFirst(record, 'choices')`), measured as `choices=2` with the value deciding the outcome coming from the second read.
- `gemini.codec.ts:272` and `:279`, measured as `candidates=3`.
- `claude.codec.ts:210` and `:214` (`Array.isArray(record.content)` then `readItems(record, 'content')`), measured as `content=2`.

The fix is the same in all three and it removes the shape rather than the symptom: the field is read once into a constant, the check runs on that constant, and the constant is what the reader receives. `payload.ts` gains `firstRecord(items, field, report)`, which takes the array already read, and `readFirst` becomes the read plus a call to it.

### N1 (minor): the rule closes four classes, and the comment says every one

The rule refuses `Cc`, `Cf`, `Zl` and `Zp`; a `Co` (private use), a `Cn` (unassigned) and a `Cs` (a lone surrogate) pass it, and the audit measured a `Co` reaching the router's resolved line raw with a 200. It also noted that a `Zs` (a space) passes, which is only arguably non-printable.

The rule becomes `[^\p{C}\p{Zl}\p{Zp}]`, which is every character of the Unicode control categories (`Cc`, `Cf`, `Co`, `Cs`, `Cn`) plus the two separators, and the comment and the spec stop saying "every non-printable character" while it means four of them. A printable space stays accepted on purpose: it is not invisible, and refusing it could reject an identifier a provider declared.

### N3 (minor): the word describes a smaller mutant than the number

Specs 018 and 019 say that emptying the forward in `pairs.ts` turns two cases red. The audit reconciled it: with the mutant the run actually used, the forward dropping the `report` argument, two cases go red, and with a literal emptying (`() => []`) twenty-two do. The number is right and the wording is what has to change.

## Acceptance criteria

- [x] A test asserts that each of the three callers reads its field once, with a counted accessor, and that the field being read once cannot change the outcome: red before the fix, recorded. Reverting the three to the shape that reads the field through a reader turns exactly three cases red, one per caller.
- [x] A test asserts that `Co`, `Cn` and `Cs` are refused at the v1 boundary on both facades, that a printable space is accepted, and that a normal identifier still passes. The red run with the class narrowed back to four families fails exactly the three new cases, and the space case passes in both states, which is what makes the exception deliberate.
- [x] The wording of specs 018 and 019 is corrected where it is written, and spec 019's design no longer claims a class it does not close.
- [x] Spec 015 registers the space as a deliberate exception of the rule, so a future reader does not read it as an oversight.
- [x] The suites of specs 001 to 019 keep passing, and the end to end run keeps passing. 381 backend tests, 19 command line tests, 17 interface tests, the build of the four workspaces and the 27 case end to end run, all green.
- [ ] An independent audit reproduces every criterion. Dispatched with the commit that closes this spec.

## Risks

- Refusing `Cs` is only meaningful for a string that carries a lone surrogate, which JSON can express; the test uses one and the rule is what makes the behaviour deliberate instead of incidental.
- Widening the class again risks refusing something legitimate; the exception for a printable space is written and asserted, which is the shape a rule of this kind should have.

## Status

implemented on 2026-09-30. The three callers read their field once, `payload.ts` exposes `firstRecord` so the shape cannot come back, the boundary refuses the whole `C` group plus the two separators with a printable space left alone on purpose, and the three claims that overstated what the code does are corrected where they were written.

The evidence: reverting the three callers to the shape that reads through a reader and narrowing the class back turns exactly six cases red, three per change, with all four files restored byte identical, verified by hash. The gate afterwards: 381 backend tests, 19 command line tests, 17 interface tests, the build and the 27 case end to end run, all green.

## A decision about the audit chain

Five audits in a row have found the same shape: the code is right where it was fixed, and the sentence written next to it claims more than the code does, or a fix closed the instance and left the class. Each round costs an hour of an independent lane and has not found a blocking or important defect since spec 014.

This spec keeps its own audit, because the rule of this repository is that every spec closes with one. From here, however, findings of that same shape are registered in spec 015 and fixed when their own subject is touched, instead of being chained into a new fix spec round after round. An important or blocking finding always opens its own spec, whatever its shape. This is a judgement call, it is written here so it can be argued with, and the user owns it.