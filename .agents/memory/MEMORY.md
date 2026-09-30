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
- M1 to M6, M8 and the fixes of spec 012 complete on `feature/v1-gateway`. The audits of M8 (specs 010 and 012, two independent passes) are closed; spec 013 holds what needs a decision.

## Next up
- Open scrutiny before merging is closed for M8: the provider transports and `packages/contracts` were read by an independent lane twice, and every finding it proved is fixed with a test (spec 012). The residue that needs a decision lives in spec 013 (H-B7, H-B8, the budget constant, the coverage asymmetry).
- M9 local interface (spec 008) is the chosen next milestone; M7 routing (spec 004) closes the code; M10 live discovery has no spec yet.
- M9 owns one open criterion from spec 013: the interface needs a test script, or its spec says in writing why reading a live API is out of scope.
- User only: `kr service install` (elevation), the first run against a real provider key, then merge `feature/v1-gateway` into `main`.

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).
- Order of the last two milestones: interface before routing, or routing before interface.