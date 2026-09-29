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
- Base remains a skeleton: no specs (`last_id: 0`), no drizzle config, no provider integration.

## Next up
- Spec 001 for the first vertical slice: credential registry, provider adapter, policy, model listing. Blocked until the first provider is decided.
- Decide `CLAUDE.md`: restore the pointer to `AGENTS.md` or commit the deletion deliberately.
- Local `main` is stale versus `origin/main` (PR #3 already merged remotely); refresh before any merge.

## Open decisions (unresolved, blocking or not)
- First provider adapter and OpenAI-compatible API surface: blocks spec 001 (full catalog in `architecture.md`).
