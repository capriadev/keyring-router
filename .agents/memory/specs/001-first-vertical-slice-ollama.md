# First vertical slice: Ollama credential, catalog, policy and model listing

Spec ID: 001
Status: active
Branch: `feature/001-first-vertical-slice`

## Objective

Deliver the first complete Keyring Router flow against a real provider: register a credential with an explicit namespace, validate it, discover the models that credential can access, decide exposure through the policy layer, and list the exposed models over the local API, with a minimal local UI on top. Ollama is the first provider because it is local, needs no API key and is verifiable without leaving the machine.

This slice makes the two product distinctions observable: a provider is not a credential, and a catalog is not a policy.

## Resolved open decisions (see `architecture.md`)

- **First provider adapter**: Ollama, base URL `http://127.0.0.1:11434`, auth kind `none`.
- **Client-facing API surface**: internal `/api/*` JSON only. The OpenAI-compatible facade (`/v1/models`, `/v1/chat/completions`) is deferred so that listing keeps one source of truth.
- **Persistence driver**: SQLite through `better-sqlite3` with `drizzle-orm`. Verified on this machine: `drizzle-orm@0.45.3` (`compatibilityVersion` 10) pairs with `drizzle-kit@0.31.10` (`requiredApiVersion` 10), `better-sqlite3@13.0.3` loads natively in ESM on Node `24.20.0`, and `drizzle-kit generate` produced a clean additive migration. The Node built-in `node:sqlite` driver was rejected: `drizzle-orm/node-sqlite` only exists in the unreleased 1.0 line.
- **Validation**: Zod at every boundary (HTTP input, env, provider responses).
- **Tests**: Node built-in test runner through `tsx` (already a devDependency). No new test framework.
- **Exposure default**: deny. A discovered model is exposed only when an `allow` rule matches it. Catalog and exposure stay visibly separate.
- **Migration flow**: `drizzle-kit generate` for the SQL, reviewed before applying, applied by an explicit script. No unreviewed schema push.

## Scope

In scope:

- Credential registry with explicit namespace, create and list only.
- Ollama adapter: credential validation and catalog discovery.
- Policy layer: allow/deny rules, matched against namespaced model ids, deny wins.
- Combined catalog listing that shows which discovered models are exposed.
- Local API under `/api/*` with Zod-validated boundaries.
- Minimal local UI: health, credential form, catalog list with allow action, exposed model list.
- SQLite schema and the first reviewed migration.

Out of scope (deliberately deferred):

- OpenAI-compatible facade, request routing, streaming, rotation, fallback and quotas.
- Credential secrets: `authKind: 'api_key'` is rejected until the security spec defines encryption. No secret column exists yet and no plaintext secret is ever stored.
- Credential edit, rename and delete.
- Login for the local UI.
- Second provider, PostgreSQL, i18n library, theme presets, fonts and sounds.
- Model caching or persistence of provider responses beyond the normalized catalog.

## Data model (`apps/backend/src/dal/schema/`, SQLite through Drizzle)

`credentials`

| Column | Type | Notes |
|---|---|---|
| `id` | text, primary key | uuid generated in `bll/` |
| `namespace` | text, not null | unique index; lowercase slug `^[a-z0-9][a-z0-9-]{1,31}$` |
| `provider_id` | text, not null | `ollama` |
| `base_url` | text, not null | http or https, stored without a trailing slash |
| `auth_kind` | text, not null | `none` is the only storable value in this slice |
| `last_validated_at` | integer, null | epoch ms |
| `last_refresh_at` | integer, null | epoch ms |
| `last_refresh_error` | text, null | normalized and secret-free |
| `created_at` | integer, not null | epoch ms |

`catalog_models` (derived data, replaceable, never user data)

| Column | Type | Notes |
|---|---|---|
| `id` | text, primary key | `${credential_id}:${provider_model_id}` |
| `credential_id` | text, not null | references `credentials.id`, cascade on delete |
| `provider_model_id` | text, not null | e.g. `qwen2.5:7b` |
| `display_name` | text, not null | |
| `size_bytes` | integer, null | |
| `family` | text, null | |
| `provider_modified_at` | text, null | ISO string when the provider reports it |
| `discovered_at` | integer, not null | epoch ms |

Unique index on `(credential_id, provider_model_id)`.

`policies`

| Column | Type | Notes |
|---|---|---|
| `id` | text, primary key | uuid generated in `bll/` |
| `credential_id` | text, null | null means a global rule; references `credentials.id` |
| `pattern` | text, not null | glob over the namespaced model id, only `*` and `?` |
| `effect` | text, not null | `allow` or `deny` |
| `created_at` | integer, not null | epoch ms |

Index on `credential_id`.

Rules:

- No secret column exists in this slice. The security spec adds it together with its encryption format.
- `catalog_models` holds derived data: a refresh replaces the rows of that credential inside a single transaction. Credentials and policies are user data and are never destructively rewritten here.
- Migrations live in `apps/backend/drizzle/` (SQL plus meta) and are produced by `drizzle-kit generate`. Schema files live under `src/dal/schema/` because `dal/` is the only layer that talks to the database.
- The database file defaults to `apps/backend/data/kr.db`, overridable with `KR_DB_PATH`. The folder is gitignored and never committed.

## Contracts (`apps/backend/src/types/`, frozen by this spec)

- `provider.ts`: `ProviderId`, `AuthKind`, `AdapterTarget`, `ProviderAdapter`, `ProviderError`, `ValidationResult`, `DiscoveredModelRecord`.
- `credential.ts`: `CredentialInput`, `Credential`.
- `catalog.ts`: `CatalogModel` (discovered plus its `exposed` flag), `ExposedModel`.
- `policy.ts`: `PolicyEffect`, `PolicyRule`, `PolicyRuleInput`.
- `api.ts`: request and response shapes for every endpoint below.

`ProviderAdapter` is the only contract between `bll/` and `integrations/`:

```ts
interface ProviderAdapter {
  readonly id: ProviderId;
  validateCredential(target: AdapterTarget): Promise<ValidationResult>;
  discoverCatalog(target: AdapterTarget): Promise<DiscoveredModelRecord[]>;
}
```

`AdapterTarget` carries `baseUrl`, `authKind` and an optional `secret` that is `undefined` for `authKind: 'none'`. The adapter receives an injectable `fetch` implementation so tests never touch the network. `ProviderError.kind` is one of `unreachable`, `unauthorized`, `invalid_response`, `unknown`, and no header, token or raw provider body is ever included in its message.

## Policy evaluation (`apps/backend/src/bll/catalog/policy.ts`)

- A pattern is matched against the namespaced model id (`local/qwen2.5:7b`), case-insensitively, supporting only `*` and `?`.
- A rule applies when its `credential_id` is null (global) or equals the model's credential.
- Deny wins: any matching `deny` denies; otherwise at least one matching `allow` exposes; otherwise deny.
- Evaluation is order-independent and holds no hidden state, so it is fully unit-testable.

## API surface (`/api`, JSON, Zod-validated)

| Method | Path | Result |
|---|---|---|
| GET | `/api/health` | 200 `{ status, version, uptimeSeconds }` |
| GET | `/api/providers` | 200 `{ providerId, authKinds }[]` from the registered adapters |
| GET | `/api/credentials` | 200 `Credential[]`, never a secret field |
| POST | `/api/credentials` | 201 `Credential`; 400 invalid body; 409 namespace taken; 422 `authKind: 'api_key'` unsupported |
| POST | `/api/credentials/:id/validate` | 200 `ValidationResult`; 404 unknown id; 502 provider failure |
| POST | `/api/credentials/:id/refresh` | 200 `{ credentialId, discovered, exposed, refreshedAt }`; 404 unknown id; 502 provider failure with the normalized error persisted |
| GET | `/api/catalog` | 200 `CatalogModel[]` including `exposed`, optional `?credentialId=` filter |
| GET | `/api/models` | 200 `ExposedModel[]`, policy-filtered only |
| GET | `/api/policies` | 200 `PolicyRule[]` |
| POST | `/api/policies` | 201 `PolicyRule`; 400 invalid pattern or effect; 404 unknown credential |
| DELETE | `/api/policies/:id` | 204; 404 unknown id |

Rules:

- The gateway holds no business logic: controllers validate, call `bll/` and shape responses.
- Only `dal/` touches Drizzle.
- Errors are shaped as `{ error: { code, message } }` with a stable `code` and a secret-free `message`.
- The server binds to `127.0.0.1` by default (`KR_HOST`, `KR_PORT`, default port `4310`).

## Frontend (`apps/frontend/src`, Atomic Lazy Design)

- `services/api/` is the only place that performs HTTP: `client.ts` (base URL from `NEXT_PUBLIC_KR_API_URL`, default `http://127.0.0.1:4310`, typed error mapping) plus one module per resource (`health`, `credentials`, `catalog`, `models`, `policies`).
- `types/api.ts` mirrors the backend contracts. Duplication is accepted for this slice and must be replaced by a generated or shared contract before the second provider.
- `app/page.tsx` becomes the dashboard: health badge, credential form (namespace, base URL), credential list with validate and refresh actions, catalog list with an allow action per model, exposed model list.
- Only three component layers: atoms (`StatusPill`, `TextField`, `ActionButton`), molecules (`CredentialRow`, `ModelRow`), organisms (`CredentialForm`, `CatalogPanel`, `ExposedModelsPanel`).
- `theme/tokens.css` stays the single source of design tokens: no hardcoded color, spacing or font value inside components.
- UI copy is Spanish in this slice; the es/en switch is deferred to its own spec.

## Test plan

Automated, with no network and no Ollama required. Test files use the `*.spec.ts` suffix already excluded by tsconfig.build.json and run with `node --import tsx --test src/**/*.spec.ts` from apps/backend:

- `bll/catalog/policy.spec.ts`: default deny, allow match, deny overriding a global allow, credential-scoped rule, `?` and `*` patterns, case-insensitivity, order independence.
- `bll/credentials/credential.service.spec.ts`: namespace slug validation, uniqueness conflict, `api_key` rejection, base URL normalization.
- `bll/catalog/catalog.service.spec.ts`: refresh replaces derived rows, exposed count derives from policy, provider failure persists a normalized error.
- `integrations/providers/ollama/ollama.adapter.spec.ts`: discovery against an in-process `node:http` stub on an ephemeral port (success, unreachable, malformed payload), plus an assertion that a thrown `ProviderError` carries no secret or header value.
- `dal/` repository tests run against a temporary SQLite file created per test.

Manual, documented in the final report (the Ollama CLI `0.20.0` is installed, the server was not running during planning):

- With `ollama serve` running, register credential `local`, validate, refresh, confirm the discovered models match `ollama list`, and confirm none is exposed until an allow rule matches.

## Tooling and commands (Drizzle safety flow)

| Step | Command |
|---|---|
| Generate migration | `npm run orm:generate` from the repo root |
| Review | read `apps/backend/drizzle/*.sql` in full before applying |
| Apply | `npm run db:migrate --workspace=apps/backend` |
| Inspect (read-only) | `npm run orm:studio` |
| Typecheck | `npm run tsc --workspaces` |
| Tests | `npm test --workspaces --if-present` |
| Build | `npm run build --workspaces` |

Applied rules:

- `drizzle-kit push` is removed from the root scripts: an unreviewed schema push is forbidden in this repo.
- The only apply path is `apps/backend/src/dal/migrate.ts`, using the same driver as the runtime.
- Destructive SQL (`DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE`) must be reported to the user and double-confirmed. This first migration is additive only.

## Acceptance criteria

- [ ] `npm run tsc --workspaces` passes with no errors.
- [ ] `npm test --workspaces --if-present` passes and no test opens a socket other than its own loopback stub.
- [ ] `npm run orm:generate` on a clean checkout produces one migration containing only `CREATE TABLE`, `CREATE UNIQUE INDEX` or `CREATE INDEX`, and that SQL is pasted into the final report.
- [ ] `npm run db:migrate --workspace=apps/backend` creates the schema on a fresh database and is a no-op on the second run.
- [ ] The gateway starts with `npm run dev:backend` and `GET /api/health` answers 200.
- [ ] On a fresh database with one credential and one discovered model, `GET /api/catalog` shows the model with `exposed: false` while `GET /api/models` returns `[]`; after `POST /api/policies` with an allow rule for `local/*`, `GET /api/models` returns `local/<model>`.
- [ ] `POST /api/credentials` with `authKind: 'api_key'` returns 422 and writes nothing.
- [ ] No response body, log line or test fixture contains a credential secret, and `GET /api/credentials` exposes no secret field.
- [ ] Adapter tests cover success, unreachable and malformed payload, and a `ProviderError` never carries provider headers or raw bodies.
- [ ] `npm run build --workspaces` passes, including the frontend production build.
- [ ] The dashboard renders from tokens only, with no hardcoded hex color outside `theme/tokens.css`, and every HTTP call goes through `services/api/`.
- [ ] `apps/backend/data/` is gitignored and no database file or secret is committed.

## Risks and notes

- Frontend types are a hand-written mirror of the backend contracts in this slice. A shared or generated contract is required before the second provider or the OpenAI-compatible facade lands.
- Ollama's API is not OpenAI-compatible. The adapter owns that translation, and any capability it cannot map must be reported as unsupported rather than silently flattened.
- `better-sqlite3` is a native module. It installed and ran on Node `24.20.0` in this workspace; if a future Node or platform breaks it, the documented fallback is the stable `libsql` driver, which keeps `drizzle-orm` on the stable line instead of the `node:sqlite` prerelease path.
- Spike artifacts live under `temp/driver-spike/` (gitignored) and can be deleted with the user's confirmation.

## Status

completed on 2026-09-29.

Evidence: commits `cb400fe` to `8e50eee` on `feature/001-first-vertical-slice`; 83 automated tests passing; an independent audit kept at `temp/w4-report.md` (gitignored) and a 17 case end-to-end run over a real loopback socket. The only criterion not reproduced in its literal form is `npm run dev:backend`: `tsx watch` can only be stopped by killing the process, so the health check was verified against the same code path on a temporary port instead.
