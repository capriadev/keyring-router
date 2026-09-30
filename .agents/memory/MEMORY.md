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
- Spec 014 fixed the two findings of 013 (a client abort reported as an unreachable provider, a dropped frame that vanished) with tests proved red before green; its audit, and the one owed for M9, are blocked on authentication.
- M7 routing (spec 004) is blocked on a decision rather than on code: nothing defines how a client asks for a model that several credentials can serve, and neither the priority nor the fallback chain has anywhere to live.
- Specs 008 and 014 close, and their lines leave `features.md`, only after their audits run.
- User only: re-authenticate Cline so the lanes work again (both audits are waiting on it), `kr service install` (elevation), the first run against a real provider key, the remote URL update (GitHub still answers `This repository moved` although the push succeeds), then merge into `main`.

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).
- How a client asks for a model that several credentials can serve: spec 004 calls it a combo name and never defines it, and with one namespace per credential there is nothing to rotate among. The same spec gives priority and the fallback chain nowhere to live, because it names only three new tables and none of them holds an order. Blocks M7.