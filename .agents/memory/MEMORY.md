# Memory - Keyring Router (dynamic, session-to-session)

Update at session close. This is not a changelog: it is the state of the work.

<!-- Rules (agent-facing):
- Working state only: in flight, next, blocked, open decisions, and norms with no other owner.
- One line per item, no prose, no connectives, no history. If it is readable in git log, a PR, a spec or another bank, it does not go here.
- Norm (true next week regardless of the work) belongs to AGENTS.md or architecture.md; state (changes as work advances) belongs here.
- Caps: State <= 5, Next up <= 5, Open decisions <= 3. Overflow means wrong bank: move it, do not trim it.
- Session close: delete resolved, move escalated. Never duplicate another bank.
-->

## Last session
- M1 to M6 and M8 complete; the audits of specs 010 and 012 are closed and spec 013 keeps their residue, now including the mirrored secret bounds (N-6) and a mid stream failure that is not reported as a provider failure (N-7).
- M9 implemented and audited: seven of its ten criteria were verified by an independent lane and three need a browser. Spec 014 fixed H-B7 and H-B8, and its audit reproduced the red run exactly as written down. The residue of both audits is spec 015.

## Next up
- M7 routing (spec 004) is implemented end to end and independently audited: the pure core, the state tables and their writers, lockout and quota, the router wired to the attempts, the facade walking the cascade before the first byte, and `GET /api/routing/state`. The audit found no blocker and one major defect (the quota hold never expired), fixed in the same session; its one major and six minor residues are in spec 022.
- Feature 21 has spec 021 (`021-routing-profiles-per-entry-point.md`) implemented in four slices: the pure module, the `routing_profiles` table with migration `0003` and its repository, the router and `ChatService` resolving the profile by the requested model, and the `/api/routing/profiles` surface with the `kr profile` commands (verified live). Next: the independent audit the criteria ask for. The client facing key is still an open, separate decision.
- Spec 015 holds the residue of the five audits (the thirteen fields still read twice, the invisible characters outside the rule, the fabricated tool call, the 404 echoing the id, the layout reserve and the browser walk); the audit chain is closed by decision, and only an important or blocking finding opens a new fix spec.
- User only: the browser walk of the panel, `kr service install` (elevation), the first run against a real provider key, the remote URL update, then merge into `main`, plus the two small repository decisions (the empty folders, untracking `next-env.d.ts`).

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).
- Settled on 2026-10-01 by the product owner: the name a client uses is the custom namespace the user chose, one name per account, and the router maps it to that exact provider and credential. There is no combo syntax and no group alias; spec 004 records this under Decisions and retires its old "combo name" wording.
- M7 failure behaviour is implemented (three modes, `normal`, `auto model` and `auto general`, over an ordered cascade of model ids the user writes, so the cost order is the user's and never the gateway's); the mode and the cascade live in `KR_ROUTING_MODE` and `KR_ROUTING_CASCADE`, defaulting to `normal`. What is still open and registered as feature 21 is the profile of a request: the mode and the cascade per model, and probably a client facing key, which would be the first client facing authentication of the product. Spec 021 opens it as a profile of the model the client asks for, selected implicitly by `name/model`, with the key left as a separate decision not yet taken.
- The M7 audit (2026-10-01) left decisions in spec 022: whether a resolution failure of one candidate, or a mid stream break, should reach a later candidate; how far to feed quota (a provider header parser) and how far to surface the per request degradation report.