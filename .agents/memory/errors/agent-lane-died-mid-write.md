# Agent lane dies mid write and leaves a truncated file

## Summary

A delegated lane that loses authorization while writing stops where it stood, so the file it was rewriting stays half written and the failure reads as a technical one.

## Context

Team lanes running against the Cline account. The run ends with `Unauthorized: please make sure you are using the latest version of Cline and re-authenticate your Cline account`, and it can end in the middle of a file rewrite. The coordinator then sees an unexplained diff, or a component that imports something no longer there, instead of an error at the point of failure. Seen while building the provider transports: `chat-transport.ts` and `sse.ts` arrived incomplete and had to be finished by hand.

The same session showed a second, easier to confuse signal: an edit call reporting success while no file was written at all (`tsconfig.build.json` was reported created and did not exist). A silent write failure and a dead lane look alike from the outside.

A third appearance, on 2026-09-30, added a datum worth keeping: a freshly spawned lane failed 0.8 s after dispatch with the same message, so respawning does not clear it and the outage is at the account level rather than in the lane. The audit of M9 could not run at all because of it, twice, and its criterion stays open instead of being downgraded to a self review.

## Solution

1. Read the suspect file before touching anything: a truncated tail, a stray marker comment or a half written function is the signature.
2. Rewrite the short files whole from the intended content instead of patching around the damage; verify presence and length after every write.
3. Prefer insertions by line number over large multi line block replacement when the file carries non ASCII art (tree layouts, tables): matching fails while writing works.
4. Never commit what a dead lane left behind without running the full bar: typecheck of every workspace, tests, build and the end to end run.
5. Re-authenticate before spawning lanes again. Until then the work continues in the coordinating session, and every file written without an independent read is recorded as open scrutiny.
6. A failed dispatch is visible at once: read `team_list_runs` instead of waiting on an await, and treat a run that never left `iteration_2_started` as never started.
7. A lane that dies mid flight can leave the tree dirty, not only a file truncated: seen on 2026-09-30, a lane backing up a product file and applying its own red state died with `Unauthorized` and left `pairs.ts` emptied, which cost the next audit its whole round (it found the dirty tree first and reported it instead of the criteria). Check `git status --short` immediately before dispatching an audit and again after any lane dies, and never trust a check made before the lane ran.
8. A generated file can dirty the tree on its own: `apps/frontend/next-env.d.ts` is rewritten by Next on a dev run and again on a build, flipping between `.next/dev/types` and `.next/types`. It broke an audit baseline once. Registering or untracking it is a tooling decision, not a silent commit.
9. The countermeasure for a dying lane is to keep it away from the product: instruct the auditor to run its red states on a copy of the repository in `temp/` (a recursive copy or a `git worktree`) instead of editing the working tree. Seen twice now (runs 00015 and 00019, both dying with `Unauthorized` right after applying a red state to `pairs.ts`), which cost one audit round and one interrupted audit. Check `git status --short` before every dispatch and, if a lane died, save the as-found bytes to `temp/` and restore the file from HEAD rather than patching it by hand.
10. A re-authentication does not stick immediately: five dispatches failed with `Unauthorized` in a row across two lanes after the account had been re-authenticated, and a later retry of the same task succeeded without anything changing on this side. Retry the dispatch a couple of times before concluding the lanes are down, and never report work as unattempted when what happened is that the lane could not start.

## Tags

agents lanes tooling windows truncation
