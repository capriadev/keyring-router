# Roadmap - Keyring Router

Program of record for the road to a product that can be handed over. This bank holds goals and milestones. State lives in `MEMORY.md`, decisions in `architecture.md`, atomic objectives in `specs/`.

## Goal

A self-hosted local gateway that a user installs on Windows, that starts on its own, that is managed from a local UI, that exposes one endpoint their tools point at, and that routes across many providers and several credentials per provider under an explicit, visible policy.

## Milestones

| # | Milestone | Spec | Status |
|---|---|---|---|
| M1 | First vertical slice: Ollama credential, catalog, policy, model listing | 001 | done |
| M2 | Provider catalog: many providers behind hybrid adapters | 002 | in progress |
| M3 | Credential secrets encrypted at rest, so `api_key` providers become usable | 005 | next |
| M4 | Own API: OpenAI compatible facade with protocol translation | 003 | pending |
| M5 | Routing: rotation, fallback, quota and lockout | 004 | pending |
| M6 | `kr` CLI: serve, service install, credential and policy commands | 006 | pending |
| M7 | Windows startup service | 007 | pending |
| M8 | UI: minimalist, micro detailed, complete flow | 008 | pending |

## Critical path

M3 unblocks every cloud provider, because `api_key` is refused today. M4 is the product promise: one local endpoint in front of many credentials. M6 and M7 are the install story. M8 is what the client actually sees and judges.

## Constraints

- No shortcuts and no hacks. Every boundary validated, every secret encrypted, nothing simulated in place of real behaviour.
- Automated tests never depend on an external service. The user tests with real keys at the end, loading different providers, filtering models, renaming, and using several credentials of the same account.
- Changes stay inside this repository.

## Verification rule

Every milestone closes with the same evidence bar as spec 001: typecheck, tests, build, an end to end run over a real socket, and an independent audit before the next milestone starts.
