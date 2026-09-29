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
- Spec 001 complete and verified on `feature/001-first-vertical-slice`: config, Ollama adapter, dal with migration 0000, bll, gateway and the web panel.

## Next up
- Decide the merge of `feature/001-first-vertical-slice` and `chore/agent-docs-alignment`; neither branch was pushed.
- Spec 002: cloud credential storage (encryption) and the OpenAI-compatible facade over the existing policy-filtered listing.
- Close the two uncommitted leftovers: `CLAUDE.md` and the `discarded/` bank description.
- Keep the explicit `@Inject` decorators: `tsx` does not emit `design:paramtypes`, so they are load-bearing (audit finding W4).

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).
