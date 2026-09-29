# Windows service wrapper alternatives

## What was tried

Two other ways to run the gateway as a Windows service, next to the one that was chosen: NSSM, an external service wrapper binary, and a Task Scheduler entry that runs the gateway at logon.

## Why it was discarded

NSSM is a binary the repository would have to vendor, or an installer step would have to download it: a supply-chain surface and a version to keep current, for behaviour the npm alternative already provides. Task Scheduler at logon needs no dependency at all, but it cannot start before a user logs in and it has no restart policy, so a gateway that dies stays dead until the next logon, which is not what a service is for.

## Alternative chosen

`node-windows` 1.0.0-beta.8, validated by spike on this machine: it installs from npm without compiling anything, bundles `bin/winsw/winsw.exe` so nothing is downloaded at runtime, exposes install, uninstall, start and stop, and carries a restart policy (`wait`, `grow`, `maxRestarts`). Its events are awaited by the command line through `firstEvent`, which accepts the already-satisfied variant of each operation so a second run does not hang. The wrapper is isolated in `apps/cli/src/service/windows.ts` behind a narrow local declaration, so replacing it later touches two files.

## Tags

windows service cli dependencies
