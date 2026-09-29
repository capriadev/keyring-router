# Roadmap - Keyring Router

Program of record for the road to a product that can be handed over. This bank holds goals and milestones. State lives in `MEMORY.md`, decisions in `architecture.md`, atomic objectives in `specs/`.

## Goal

A self-hosted local gateway that a user installs on Windows, that starts on its own, that is managed from a local UI, that exposes one endpoint their tools point at, and that routes across many providers and several credentials per provider under an explicit, visible policy.

## Milestones

| # | Milestone | Spec | Status |
|---|---|---|---|
| M1 | First vertical slice: Ollama credential, catalog, policy, model listing | 001 | done |
| M2 | Provider catalog: many providers behind hybrid adapters | 002 | done |
| M3 | Credential secrets encrypted at rest, so `api_key` providers become usable | 005 | done |
| M4 | Own API: OpenAI compatible facade with protocol translation | 003 | done |
| M5 | `kr` CLI: serve, service install, credential and policy commands | 006 | done |
| M6 | Windows startup service | 007 | done (install pending on the user machine) |
| M7 | Routing: rotation, fallback, quota and lockout | 004 | next |
| M8 | Shared API contracts: one source for the wire shapes the UI and the API share | 010 | pending |
| M9 | UI: minimalist, micro detailed, complete flow | 008 | pending |
| M10 | Live provider discovery for the 42 catalogued providers that declare no static models | 011 | pending |

## Order note

The CLI and the Windows service moved ahead of routing on purpose: a gateway the user cannot start, install and inspect is not a product yet, while rotation and fallback only matter once several credentials of the same provider are loaded. The evidence bar does not change for either.

## Critical path

M3 unblocks every cloud provider. M4 is the product promise: one local endpoint in front of many credentials. M5 and M6 are the install story. M8 is what the client actually sees and judges.

## Constraints

- No shortcuts and no hacks. Every boundary validated, every secret encrypted, nothing simulated in place of real behaviour.
- Automated tests never depend on an external service. The user tests with real keys at the end, loading different providers, filtering models, renaming, and using several credentials of the same account.
- Changes stay inside this repository.

## Verification rule

Every milestone closes with the same evidence bar as spec 001: typecheck, tests, build, an end to end run over a real socket, and an independent audit before the next milestone starts.
