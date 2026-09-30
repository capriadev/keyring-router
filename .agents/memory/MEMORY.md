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
- M9 started: passes 1 and 2 of spec 008 are committed, pass 3 is running; the interface has its own test script and the rotation of a secret reached the screen.

## Next up
- M9 pass 3 (contrast measured with a script, truncation of long identifiers, number and date formatting, reduced motion, no layout shift), then the independent audit over the three passes.
- M9 owns spec 013's open question in writing: why reading a live API stays out of scope for this version.
- M7 routing (spec 004) closes the code; M10 live discovery has no spec yet.
- User only: `kr service install` (elevation), the first run against a real provider key, the remote URL update (GitHub still answers `This repository moved` although the push succeeds), then merge into `main`.

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).