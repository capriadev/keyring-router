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
- M1 to M6 and M8 complete on `feature/v1-gateway`: first slice, provider catalog, secrets, command line, Windows service, OpenAI compatible facade, shared contracts. Specs 001 to 003, 005 to 007, 009 and 010, all kept in `specs/`.

## Next up
- Open scrutiny before merging: `integrations/providers/chat-transport.ts`, `sse.ts` and `packages/contracts` were written by the coordinating agent, not by an independent lane, so they still owe an external read.
- M9 local interface (spec 008) is the chosen next milestone; M7 routing (spec 004) closes the code; M10 live discovery has no spec yet.
- Teammate lanes are unusable until the Cline account is re-authenticated: three runs failed with `Unauthorized` this session.
- User only: `kr service install` (elevation), the first run against a real provider key, then merge `feature/v1-gateway` into `main`.

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).
- Order of the last two milestones: interface before routing, or routing before interface.