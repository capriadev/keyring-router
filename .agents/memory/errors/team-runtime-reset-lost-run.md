# team-runtime-reset-lost-run

## Summary
The whole team runtime can be replaced mid-session: teammates, task board and mission log disappear and a queued run never executes.

## Context
After dispatching a run to `kr-ui` (queued as run_00020, team `team-gvLkg` / t_dtjpc6b6n0, 6 completed tasks, 1085 mission log entries), the next `team_status` answered with a different and empty team (`team-1p9BF` / t_fyoy78vqo7, 0 tasks, 0 mission log entries, 0 runs), and `team_await_runs run_00020` answered `Run "run_00020" was not found`. The working tree was clean, so the lane had not started writing: the run was queued and died with the runtime, it was not a lane failure.

## Solution
- Treat a dispatch as best effort, never as a durable commitment. After dispatching, confirm with `team_list_runs` that the run exists and is running; if it is not there, the work was not done and is not in flight.
- A `dispatched: true` answer and a `runId` are not proof of life. Second incident, same session: after the runtime had already been replaced, a dispatch to `kr-audit` was accepted and queued as run_00004, and awaiting it answered `Run "run_00004" failed: Teammate "kr-audit" was not found`. The teammate of that name belonged to the old runtime, so the run was born dead. Check `team_status` for the member list, not just the run id.
- Keep durable state in the repository (`.agents/memory/**`). The team runtime holds none of it: mission log, task board and run history can vanish together.
- Before re-dispatching, run `git status --short`: if the tree is clean, nothing needs undoing.
- To resume: spawn the teammate first with its role prompt, wait for the `spawned` answer, and only then dispatch. Verify with `team_status` that the member is listed.
- Never report a lane's work as done on the strength of a `queued` answer alone.

## Tags
teams runs mission-log recovery windows