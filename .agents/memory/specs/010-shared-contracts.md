# Shared API contracts

Spec ID: 010
Status: pending
Branch: feature/v1-gateway
Origin: audit finding N-1. `apps/frontend/src/types/api.ts` declared `ProviderDescriptor` with two fields while the API already served eight, and the provider list of the form still offered a single provider.

## Objective

The wire shapes the API serves and the UI consumes live in one place, so a change on one side cannot leave the other stale. Today the frontend keeps a hand written mirror and the backend keeps its own; the second provider already arrived (135 catalog entries) and the mirror is wrong.

## Design

A new workspace `packages/contracts` (`@keyring-router/contracts`) that owns the wire shapes only: plain structural types with no import from the backend, no runtime code, and no zod (the backend keeps its own validation at the boundary).

- The backend keeps `types/api.ts` as the place its layers import, but its exported types become re-exports plus type assertions against the shared package.
- A type level test asserts that the backend's domain shapes still satisfy the shared wire shapes, so drift fails the build instead of the browser.
- The frontend imports the shared package and its `types/api.ts` mirror is deleted.

## Scope

In scope: the workspace and its tsconfig, the shared wire types for `/api/*` (health, providers, credentials, catalog, models, policies, error body) and for `/v1/*` (models, chat completions, messages, error body), the backend re-export and its compatibility test, the frontend adoption, and the line in `architecture.md` that documents the new workspace.

Out of scope: generating types from an OpenAPI document, sharing zod schemas, and publishing the package anywhere.

## Acceptance criteria

- [ ] `packages/contracts` typechecks on its own and is part of the workspace scripts (`tsc` and `build`).
- [ ] The backend's `types/api.ts` re-exports the shared shapes and the compatibility test fails when a field is removed or renamed on either side.
- [ ] The frontend imports the shared package and no longer declares its own copy of any wire type.
- [ ] No wire type is declared twice anywhere in the repository.
- [ ] `GET /api/providers` in the frontend consumes the real shape, and the credential form offers the providers the API reports instead of a hardcoded list.
- [ ] `architecture.md` documents the workspace and its ownership rule (wire shapes only).
- [ ] The full bar still passes: typecheck, tests, build and the end to end run.
- [ ] An independent audit verifies the criteria and reports what it could not check.

## Risks

- A third workspace adds wiring to the scripts; the acceptance bar includes the build for exactly that reason.
- The compatibility check must be compile time, not a runtime sample, or it becomes a test that passes while the browser breaks.

## Status

pending
