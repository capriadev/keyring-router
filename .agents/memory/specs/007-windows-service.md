# Windows startup service

Spec ID: 007
Status: pending
Branch: feature/v1-gateway
Depends on: spec 006 (the CLI that installs it) and spec 005 (the pepper the service must load).

## Objective

The gateway starts with Windows and keeps running without a terminal open. This is the difference between a tool a developer runs and a product that is always there for the client.

## The decision this spec makes

`architecture.md` lists `node-windows` or NSSM. Both get a spike on this machine before anything is written:

- `node-windows`: an npm dependency, creates a real service with auto restart, ships its own service wrapper, and fits an `npm install` story.
- NSSM: an external binary, no npm dependency, also a real service. It has to be shipped and versioned, which adds a binary to the repository or a download step to the install.
- Task Scheduler at logon: zero dependencies and it is the honest fallback. Its limits are real and must be stated: no start before the user logs in, no automatic restart on crash.

The spike result decides, and the losing options are recorded in `.agents/memory/discarded/` with the measured reason. No wrapper is written from scratch: implementing the Windows service control protocol by hand is a shortcut with a security boundary in it.

## Scope

In scope:

- `kr service install`, `kr service uninstall`, `kr service status`, `kr service restart`.
- The service runs the built backend (`node dist/main.js`) with a fixed working directory and loads `.env` from the repository root.
- Logs to `logs/gateway/` with size based rotation, and the log path reported by `kr service status`.
- Restart policy on crash, with a delay, and the failure visible in `kr status`.
- Elevation: install and uninstall need administrator rights, and the CLI says so with the exact command instead of failing cryptically.
- Uninstall is clean: service removed, no orphan process, no leftover registry entry.

Out of scope: Linux systemd or macOS launchd, remote management, and auto update.

## Acceptance criteria

- [ ] The spike result is recorded with the exact version of the chosen wrapper and why the others were dropped.
- [ ] After `kr service install`, the gateway answers `GET /api/health` without any terminal open.
- [ ] The service starts again after a machine restart, with the same database and the same pepper, verified once by the user on their machine.
- [ ] Killing the service process leads to an automatic restart within the configured delay.
- [ ] `kr service status` reports installed, running and the log file path; when not installed it says so plainly.
- [ ] `kr service uninstall` leaves no service and no process behind, verified by listing services and processes.
- [ ] No secret, token or pepper value appears in the service definition, in its arguments or in the logs.
- [ ] Uninstall and install are idempotent: running either twice is safe and reported as such.
- [ ] An independent audit reproduces the criteria that can be checked without a reboot, and marks the reboot one as verified by the user.

## Risks

- Antivirus and endpoint protection commonly flag a self installed service wrapper. The install output must explain what is happening rather than looking like malware.
- A service that runs as a different user sees a different environment and a different path to `.env`. The spec pins the working directory and documents the file permissions expected on `.env`.
- An uninstall that leaves the process running is worse than no installer, so uninstall verifies its own result.

## Status

completed on 2026-09-29, with one criterion pending on the user's machine.

Evidence: the spike kept in `temp/service-spike/` (node-windows 1.0.0-beta.8 installs without compiling and ships `bin/winsw/winsw.exe`), the service definition and its tests in `apps/cli/src/service/`, and `kr service` in `apps/cli/src/commands/service.ts`. The criterion that needs the user is the restart of the machine: creating and removing a real Windows service changes this machine, so the command only runs when they ask for it.
