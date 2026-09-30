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
- M1 to M6 and M8 complete; the two audit passes over specs 010 and 012 are closed and spec 013 keeps the residue that needs a decision, now including the mirrored secret bounds (N-6).
- M9 implemented: the three passes of spec 008 are committed and the gate is green; the independent audit is owed, and no self review was substituted for it.

## Next up
- M9 is implemented: the three passes are committed (`04a7f5b`, `4704211`, `6e978ec`) and the gate is green; the independent audit is owed and blocked on authentication.
- M7 routing (spec 004) closes the code; M10 live discovery has no spec yet.
- Spec 008 closes, and its line leaves `features.md`, only after the audit re-checks its ten criteria.
- User only: re-authenticate Cline so the lanes work again (the audit of M9 could not run), `kr service install` (elevation), the first run against a real provider key, the remote URL update (GitHub still answers `This repository moved` although the push succeeds), then merge into `main`.

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).