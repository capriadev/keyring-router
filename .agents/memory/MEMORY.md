# Memory - Keyring Router (dynamic, session-to-session)

Update at end of session / significant checkpoint. Prune what's stale - this is not a changelog, it's working state.

<!-- Pruning rules (respected each session):
- No section should grow unbounded. If "Watch" has > ~5 lines, something should have been promoted to `errors/` or to a spec.
- Never copy content from `architecture.md`, `AGENTS.md` or `PHILOSOPHY.md` - MEMORY.md doesn't duplicate sources of truth, only references by filename/spec.
- At session close: review if anything in "Next up" got resolved (delete) or if anything in "Watch" escalated to a documented error (move, don't copy).
-->

## Last session
- 2026-09-15: Rebased the inherited agent documentation on the Keyring Router product brief. The repository is an uncommitted architecture bootstrap; no runtime or provider integration exists yet.

## Next up
- Create the first implementation spec only after choosing the first vertical slice and resolving the affected open architecture decisions.

## Open decisions (unresolved, blocking or not)
- First provider and local API compatibility target.
- Fastify versus Hono, and Drizzle versus Prisma if persistence requires an ORM.
- Credential encryption and OS secret-storage approach.

## Watch / don't forget
- Never use emojis or em dashes (—) in anything written for the project (docs, READMEs, commits, UI copy). Plain ASCII punctuation only.
- Namespaces identify credentials, not merely providers. Never merge same-provider accounts.
- Catalog availability and policy exposure are separate; both model listing and routing must enforce the policy.
