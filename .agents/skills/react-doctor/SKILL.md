---
name: react-doctor
description: Optional local quality scan for a React interface in Keyring Router. Use only after a React package and its scan command have been configured.
version: 1.2.0
---

# React Doctor

This skill is inactive until Keyring Router introduces a React interface and documents its package path and command. It must not cause an agent to assume an `apps/frontend` directory, a `doctor.config.ts` file or a specific telemetry configuration exists.

## Command

When a React package is introduced, record the exact local command here. Until then, do not run this tool.

## When to run

- After making React UI changes in the documented React package.
- Before committing UI code.
- When the user asks to scan or triage diagnostics.

## Flow

1. Run the documented scan command and read its output.
2. Triage findings by severity: true positives first, then warnings. Read the relevant code before confirming or suppressing each finding.
3. Fix genuine issues in the source. Do not disable rules or change config unless explicitly asked.
4. Re-run to confirm the score did not regress.

## Rules config

- Keep telemetry disabled if the chosen tool supports it.
- Do not disable rules or change configuration unless explicitly asked.

## Out of scope (Pyrite)

- No CI integration, runtime traces or external playbook fetching unless a feature spec explicitly introduces them.
