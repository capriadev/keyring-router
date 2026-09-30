# Residue of the audits of the interface and of the abort fix

Spec ID: 015
Status: pending
Branch: feature/v1-gateway
Origin: the two independent audits that ran on 2026-09-30, `run_00007` over spec 008 and `run_00008` over spec 014. Their reports are in `temp/audit-m9-report.md` and `temp/audit-014-report.md`. Both reproduced the red-before-green evidence the specs claim, both contradicted nothing that mattered, and neither found a blocking defect. What they did find is recorded here: what was cheap and verifiable was fixed in the same session, and what needs a decision or a browser is written down instead of carried in silence.

## Fixed in the same session, with the audit as the source

- H1 (important), focus returned by script: `CredentialRow.tsx:68-74` closes the confirmation and focuses the rotate trigger, which only carried the global `:focus-visible` ring, so with a pointer the returned focus could be invisible. The pattern was already solved for the confirmation's own buttons (`DestructiveConfirm.module.css:33-40`); the same rule now guards the row's action buttons, with the reason written next to it.
- H2 (minor), the contrast test measured 30 pairs and the claim was "the pairs the interface paints": the hover and active pairs were outside it, so a future change to those tokens would not fail the suite. Six pairs were added (button text on hover and active for the two filled variants, and the pressed accent over the three surfaces), 36 pairs now.
- H3 (minor), the disabled control boundary: the pair was declared decorative while measured against a surface the control never uses. The two real pairs are now measured against `--color-surface-inset` and `--color-surface`, and the WCAG 1.4.11 exemption for inactive components is written in the pair itself instead of hidden in a decorative one that measured something else.
- H5 (minor), a false number in evidence: spec 008 cited 66 source files; the audit reproduced 73. Corrected in place, with the correction visible.
- H-5 (minor), the streaming path was classified by construction and asserted by nothing: `http.spec.ts` now exercises `requestStream` with an aborted client signal and asserts `aborted`.
- H-2, H-3 and H-4 were closed by spec 016 the same day: the detail of a drop is a closed union the compiler enforces instead of a free string, the line `ChatService` writes is asserted by a spec of its own, and the two codecs report a field that is present with a shape they do not model while staying silent about a field that is simply absent. The decisions and their evidence are in that spec.

## Open, and each with its reason

- A16-4 (minor), the class "an object frame whose content vanishes in silence" is still open beyond the five fields spec 016 closed. The audit of 016 measured silent paths in `openai.codec.ts:136,142,145` (`delta.content`, `tool_calls`, `finish_reason` in a shape the codec does not model), `gemini.codec.ts:234-240,329,335` (`part.text`, `functionCall`, `finishReason`, `usageMetadata`) and `claude.codec.ts:294,333,339,357` (`content_block.text`, `delta.text`, `partial_json`, `message_delta`), plus the part fields the codec never models (`inlineData`, `executableCode`, unknown fields). Closing them needs the closed `FrameField` widened, which is a decision about how far the reporting reaches.
- A16-5 (minor), spec 016 describes OpenAI's final chunk as carrying no `choices`, and that is a provider fact no run here can verify: no real provider and no documentation reachable from this environment. What is asserted is the gateway's behaviour in both forms, which is what the wording should say.
- A16-6 (minor), no test runs socket to SSE to codec to line: `chat.service.spec.ts` doubles both the frame source and the router, and the end to end stub provider only sends healthy frames (`e2e/harness.ts:58,69,147`). A case in the end to end run with one unreadable frame between two readable ones is the honest place to close it, because that is where the socket is real.
- A16-7 (minor, observation), content fabricated instead of reported: `gemini.codec.ts:245` turns an unreadable `functionCall.name` into an empty string and `content.ts:38` turns absent arguments into `{}`, so a client receives an invented tool call it cannot tell from a real one. It is the opposite of silence and still a lie.
- F2-3 (minor, of the second round of the audit of 017), the same family as A16-7, measured again: `stringifyToolArguments` returns `{}` when the provider sent no arguments, and a missing `name` becomes an empty string, while Claude and OpenAI omit the key instead. The asymmetry lives inside the translation module, and which side is right is the decision, not whether to fix it.
- F2-6 (minor, observation), one run of the backend suite failed at file level with no diagnostic and never reproduced. Nothing to fix until it happens again with its output kept.
- The audit's observation about a 502 body: the codecs do put provider text into an error message (`claude.codec.ts:260,265,318,350` interpolate the provider's own `type`), `mapTranslationFailure` passes it through `redact` and it reaches the client in the body of a 502. It is the client's own provider, so it has a right to know why it failed, and what is worth noting is that `redact` (`redaction.ts:55-67`) bounds nothing: it masks secret patterns, it does not bound text. A decision for its own change.
- F2-5's decision, taken in spec 018: the committed form of `apps/frontend/next-env.d.ts` is now the one a build writes, so the gate leaves the tree clean; a dev run flips it to the other form and that flip is committed the same way if it happens. Untracking it stays open as the user's call, with the caveat noted above.
- The audit of 018 measured that the id the client sent comes back raw in the body of a 404 (`model_not_found`, whose message reads `no model is served under the id <id>`). That is another surface than the log and the boundary rule does not cover it. A decision: whether the facade names the id it did not find, which is what it does today, or answers without echoing it.
- The same audit observed that two layers stop a non-printable id, the boundary and the policy's anchored pattern. Spec 019 widened the boundary so it stops them on its own, and the policy stays as it is; the observation is recorded so nobody reads the policy as the only guard.
- The boundary rule leaves a printable space accepted, and that is deliberate: it is not invisible, and refusing it could reject an identifier a provider declared (spec 020 asserts it). Recorded here so a future reader does not read it as an oversight.
- The class of defect behind `readFirst` was closed in spec 020 with `firstRecord`, which takes the array already read. A future reader that takes a field name and reads it again is the shape to refuse in review, because that is what three audits in a row have found.
- F1 (important, of the audit of spec 017), a lane that dies mid flight can leave a product file dirty: `pairs.ts` was found with the emptied forward applied, the audit restored it to HEAD and kept the as-found bytes, and the round was spent on that instead of on the criteria. The process lesson is in `errors/agent-lane-died-mid-write.md`. What it leaves open is a round: spec 017's criteria still have no independent read.
- `apps/frontend/next-env.d.ts` is rewritten by Next and flips between `.next/dev/types` and `.next/types` depending on whether a dev run or a build ran last, which dirties the tree and once broke an audit baseline. It is tracked today. Deciding whether it becomes untracked belongs to its own small change, with the caveat that a fresh clone needs Next to generate it before `tsc` can see its references.

- H4 (minor), the layout shift half of spec 008 criterion 8: the reserved space covers the table region, but the search field and the closing note mount only when rows exist, and the reservation (8rem) is smaller than a populated table. The half that needs no browser could be improved; the criterion cannot be closed without one.
- H6 (minor), the before and after evidence of passes 1 and 2 is narrative; only pass 3 left a reproducible measurement. Making the first two reproducible means re-measuring work already merged, with no defect behind it.
- H7 (minor), three empty folders held by `.gitkeep` (`components`, `events`, `theme/presets`) that nothing uses. Removing them deletes files, which this project does not do without the user's word, so it waits for one.
- The race the audit could not reproduce (observation, not a finding): in a non streaming call, `ChatService.withAbort` rejects with `ClientDisconnectedError` while `send()` rejects with `ProviderFailure('aborted')`, and whichever wins decides what the gateway reports. Only `ClientDisconnectedError` is swallowed by the HTTP surface, so in the other order a 502 for `aborted` is written to a dead socket. Nothing is delivered to a client that is gone either way; confirming it needs a real socket.

## What no run can close without a browser

Spec 008 criteria 3, 4 and 8 keep structural evidence only, and the audit repeated why: the keyboard walk, the live tab order, the visible ring under both inputs, the real layout shift and the operating system's reduced motion are not observable from this environment. They need a person with the panel open, or a browser driver this project does not have.

## Acceptance criteria

- [ ] Every item above is either fixed with a test, or registered here with the decision it needs.
- [x] A new spec decides and implements the `FrameReport` detail shape (H-2), and the frames the codecs drop (H-4). Spec 016, implemented on 2026-09-30: the detail is a closed union of reasons, fields and shapes that the compiler enforces, and the two codecs report a field that is present with a shape they do not model while a field that is absent says nothing.
- [ ] Removing the three empty folders (H7) happens only with the user's confirmation, because it deletes files.
- [ ] A16-4, A16-5, A16-6 and A16-7 of the audit of spec 016 are each fixed by the spec that owns their decision, or decided against in writing.
- [ ] The browser-dependent checks of spec 008 are walked by a person with the panel running, and the result is written in spec 008.
- [ ] Specs 008 and 014 close only when their own criteria say so, not before.

## Status

pending