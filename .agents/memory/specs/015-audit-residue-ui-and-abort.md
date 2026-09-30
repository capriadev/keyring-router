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

## Open, and each with its reason

- H4 (minor), the layout shift half of spec 008 criterion 8: the reserved space covers the table region, but the search field and the closing note mount only when rows exist, and the reservation (8rem) is smaller than a populated table. The half that needs no browser could be improved; the criterion cannot be closed without one.
- H6 (minor), the before and after evidence of passes 1 and 2 is narrative; only pass 3 left a reproducible measurement. Making the first two reproducible means re-measuring work already merged, with no defect behind it.
- H7 (minor), three empty folders held by `.gitkeep` (`components`, `events`, `theme/presets`) that nothing uses. Removing them deletes files, which this project does not do without the user's word, so it waits for one.
- H-2 (minor, and a sub criterion of spec 014 genuinely REFUTED), the `FrameReport` port promises in its comment that the detail never carries frame content, and its type is a free `string`, so nothing enforces it. Today the only production consumer ignores the parameter, so there is no leak; the honest fix is a decision: narrow the detail to a closed set of shapes (the compiler then enforces the promise) or rewrite the comment to stop promising. Deferred because it changes a contract of a spec that is already implemented, and that is a new spec by this project's rule.
- H-3 (minor), the log wiring is asserted in its pure half only: `payload.spec.ts` asserts the line `countFrameDrops` writes, and nothing asserts that `chat.service.ts:116-120` logs it once per request with `route.requestId`, because there is no spec for `ChatService` and no decision on how to capture a Nest log. The code is correct by reading; the claim "asserted" was partial and is now corrected in spec 014.
- H-4 (minor), the claim that `payload.ts` is the only place where a frame disappears is true for the frames it names and exaggerated as an absolute: `openai.codec.ts:131-133` and `gemini.codec.ts:223-227` still drop object frames that carry content in a shape the codec does not model, silently. Whether that is a drop to report or a frame that genuinely carries nothing for the client is a decision.
- The race the audit could not reproduce (observation, not a finding): in a non streaming call, `ChatService.withAbort` rejects with `ClientDisconnectedError` while `send()` rejects with `ProviderFailure('aborted')`, and whichever wins decides what the gateway reports. Only `ClientDisconnectedError` is swallowed by the HTTP surface, so in the other order a 502 for `aborted` is written to a dead socket. Nothing is delivered to a client that is gone either way; confirming it needs a real socket.

## What no run can close without a browser

Spec 008 criteria 3, 4 and 8 keep structural evidence only, and the audit repeated why: the keyboard walk, the live tab order, the visible ring under both inputs, the real layout shift and the operating system's reduced motion are not observable from this environment. They need a person with the panel open, or a browser driver this project does not have.

## Acceptance criteria

- [ ] Every item above is either fixed with a test, or registered here with the decision it needs.
- [ ] A new spec decides and implements the `FrameReport` detail shape (H-2), and the frames the codecs drop (H-4).
- [ ] Removing the three empty folders (H7) happens only with the user's confirmation, because it deletes files.
- [ ] The browser-dependent checks of spec 008 are walked by a person with the panel running, and the result is written in spec 008.
- [ ] Specs 008 and 014 close only when their own criteria say so, not before.

## Status

pending