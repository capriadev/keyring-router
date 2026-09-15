# Architecture - Keyring Router

## Current architecture

Keyring Router is an open-source, self-hosted AI inference gateway. It runs on the user's machine, is not a hosted credential service, and exposes one local API across multiple providers and multiple credentials for the same provider.

### Product invariants

- A provider is not a credential. Each credential has an explicit, user-owned alias and namespace, such as `ollama-work/gptoss:120b`; same-provider accounts are never silently merged.
- A catalog is not a policy. Catalog discovery reports what a credential can access. Policy determines what is visible and routable locally. Both listing and routing enforce policy.
- Credentials are sensitive local data. They must never be committed, logged, printed or placed in tracked configuration.
- Provider-specific protocol and authentication details are isolated in adapters. Client-facing gateway, routing and policy code do not directly depend on provider SDK details.

### Decided base

| Area | Decision | Notes |
|---|---|---|
| Runtime | Node.js and TypeScript | Provider SDK compatibility and fast iteration. |
| Gateway | Local HTTP API | Stable client interface, provider details stay internal. |
| Configuration | Versionable JSON or YAML on disk | Defines aliases, filters and provider settings. Secrets stay separate. |
| Default persistence | SQLite | Zero-setup local installation. |
| Optional persistence | PostgreSQL via Docker Compose | Chosen during setup, with no live engine migration in the first version. |
| CLI | `kr` | `kr serve` starts the gateway; OS service installation is separate. |
| Docker | Optional | Intended mainly for the PostgreSQL mode. |
| Initial platform | Windows verified | Linux and macOS remain unverified until tested. |
| Website | Static landing and download page | Never the gateway control plane. |

### Open decisions

- HTTP framework: Fastify or Hono.
- ORM: Drizzle or Prisma, if an ORM is justified after defining persistence boundaries.
- Credential encryption and OS secret-storage strategy.
- Routing and rotation behavior: manual selection, automatic rotation, failure fallback and quota handling.
- First provider, canonical local API surface and compatibility targets.

Resolve an open decision in a spec before adding its dependency or public contract.

### Module boundaries

| Module | Responsibility |
|---|---|
| `cli` | Commands, startup configuration and local process lifecycle. |
| `gateway` | Local API validation, normalized responses and errors. |
| `routing` | Resolve a namespaced model to a permitted credential and adapter. |
| `catalog` | Discover and normalize provider models per credential namespace. |
| `policy` | Evaluate model visibility and allow/deny rules. |
| `credentials` | Credential metadata and secure secret access. |
| `providers` | Isolated adapters for auth and request/response translation. |
| `persistence` | Selected storage implementation only. |
| `config` | Parse and validate versionable non-secret configuration. |

The adapter registry is the only path from routing to provider implementations. Each adapter should validate one credential, discover its catalog, normalize model capability, translate requests and responses, and normalize errors without leaking secrets. Reuse external code only after license review and required attribution. Keyring Router's multi-account namespace and catalog-policy design remain first-party work.

### Security and observability

- Bind to a safe local interface by default until remote exposure receives its own security design.
- Redact secrets from logs, errors, support bundles and tests.
- Record routing decisions only with non-secret identifiers such as request ID, namespace, model, adapter and normalized outcome.
- Treat provider responses as untrusted input and validate their shape.

### Planned repository layout

```
repo root/
├── apps/gateway/                local API and routing composition
├── apps/website/                optional static landing page
├── packages/config/
├── packages/core/               catalog, policy and routing contracts
├── packages/providers/          isolated provider adapters
├── packages/persistence/        selected storage implementation
├── docker/                      optional PostgreSQL setup
├── docs/
└── .agents/
```

This is a target layout, not a request to scaffold empty directories before a spec needs them.

---

## [SUPERSEDED] Inherited Pyrite architecture

The historical section below belongs to the project from which this repository skeleton was copied. It is retained temporarily as a trace only and must not be used for Keyring Router decisions.

Single source of truth for how Pyrite is built. Update on every trade-off. Mark changes `[SUPERSEDED]` instead of deleting.

## Identity
- Name: **Pyrite**. Personal, single-user, private, local-first. Public repo (clone-and-run).
- GUI name on machine: **Pyrite**. No "OS" suffix.

---

## Stack (decided base)

| Layer | Tech | Notes |
|---|---|---|
| Interfaz (`apps/frontend`) | Next.js + TypeScript + Tailwind CSS | Decoupled: components, hooks, events. What the user uses. |
| Bot Discord (`apps/bot-discord`) | TBD (likely discord.js + TypeScript) | Talks to backend only via `gateway/`, same rule as frontend. Not started yet - folder exists, empty for now. |
| Backend (`apps/backend`) | Nest.js + TypeScript | Modular by responsibility (see "Backend layers" below). Runs alone/isolated. |
| DB | PostgreSQL + Redis | Provided by Docker. Postgres = source of truth; Redis = cache/perf. |
| Container | Docker container named `pyrite` | `docker/` folder holds compose + instances. |
| ORM | Drizzle (typed) | Candidates considered: Prisma (more known), Kysely (newer). |
| Config (app/usuario) | In-DB, not `.env` | Settings of the system that the user owns, rotate or change at runtime (providers, keys, models, preferences). Stored in DB, loaded at boot. |
| Config (backend/infra) | `.env` | Backend boot settings: crypto peppers, Argon2id params, port, DB user/pass/name. Environment-level, not user-managed, not in DB. |
| Runtime | Node.js 24.20.0 via nvm | Pinned by `.nvmrc` at repo root. Version managed with nvm, not system-wide installs. |
| Logging | pino + pino-roll | JSON Lines, one stream per process under `logs/backend/`. `reqId` per request via AsyncLocalStorage, hard redaction of credentials, rotation daily + by size, 120-day retention. Base config: `services/logger/`. |
| Windows startup | `node-windows` service (or NSSM) | Backend runs alone at Windows boot, even before login. Node can do this; Rust/Go only needed for extreme volume/CPU, not startup. |

### Backend layers (apps/backend/src) - strict responsibilities
- `dal/` - the ONLY layer that talks to the database. All queries/DB access concentrated here; no queries anywhere else (bll, services, gateway never touch DB directly).
- `bll/` - ALL business logic. Domain rules live here; consumed by gateway; uses dal for persistence. No HTTP, no DB access of its own.
- `gateway/` - realtime APIs (HTTP/WS). The ONLY communication medium between any client app (`apps/frontend`, `apps/bot-discord`) and the backend: no client talks to `bll/` or `dal/` directly. No business logic inside.
- `services/` - very specific internal services (shared, cross-cutting app-level helpers). Naming note: these are internal; do not confuse with "servicios satelitales" (external), which live in `satellite-services/`.
- `integrations/` - adapters for external world: future satellite-services adapters (repo-root `satellite-services/`) and `providers/` containing `<proveedor>.client.ts` files that validate/consume external APIs (e.g. AI providers). Support validators live here too. Core never imports satellite code directly - only through these adapters.
- `config/` - typed config loaded at boot (in-DB config lands here later).
- `types/` - shared TypeScript types/contracts used by more than one layer, so no layer has to import another just for a type.

### Sidecars (own code, OS-level control)
- Rust or Python **required** for Spotify volume control (Windows) - what `spoti-pobre` does today. Smallest possible sidecar.
- Lives under `sidecars/`. Not vendorized software - code you write and maintain.
- Spotify construction to be defined at build time. Open question: whether the dual-mode service (integrated in backend / detached local agent with its own SQLite, WS to backend only while the frontend UI is open, for the split LAN setup: frontend + user on the main PC, backend on the home server) is achievable without Rust/Python, or if the sidecar route above is still needed.

### Frontend design system
- Component architecture: "Atomic Lazy Design". Minimal take on Atomic Design: three layers only - atoms, molecules, organisms (small / medium / complete). Separates without over-fragmenting. No further subdivision unless practice proves it necessary.
- Theming: change colors, fonts, sounds, component variants and layout element positions/order without touching code.
  - `theme/tokens.css`: single source of design tokens, consumed by all `ui/`; never hardcoded per component.
  - `theme/presets/`: full theme presets (built-in + custom), swappable at runtime.
  - Fonts and sounds load as pluggable extras, same mechanism as presets.
  - Dark/light + custom themes from day one via tokens.
  - All preferences persist in DB (config-in-DB). Settings UI exposes an appearance section (theme/font/custom) and a sounds section.
- Multi-language: Spanish and English only. Implementation library TBD (blocks nothing).
- Component sourcing policy: before installing any UI library or kit, evaluate copying/adapting the specific fragment needed instead of pulling a whole dependency (full libraries bring their own theming, which conflicts with the token system above). Even with pre-designed libraries, the approach is to adapt and limit what gets used. When a library IS justified, prefer copy-based approaches (shadcn/ui style: component code lives in the repo, not an opaque package) - same principle as "don't fork/copy-paste without customizing", applied to third-party UI.

### Satellite services (vendorized, external processes)
- Third-party software (Cobalt, spotdl, open-notebook) installed inside the repo but run as independent processes.
- Backend never imports their code - only consumed via `apps/backend/src/integrations/` over HTTP/CLI.
- Lives under `satellite-services/`.

---

## Repository layout (planned)

```
repo root/
├── AGENTS.md                     agent manual-router
├── README.md                     project entry point
├── package.json                  workspace scripts/deps
├── .github/workflows/            CI (typecheck + build)
├── apps/
│   ├── backend/                  Nest.js backend
│   │   ├── drizzle/              schema + migrations (backend asset)
│   │   └── src/
│   │       ├── bll/
│   │       ├── config/
│   │       ├── dal/
│   │       ├── gateway/
│   │       ├── integrations/
│   │       ├── services/
│   │       └── types/
│   ├── bot-discord/              Discord bot app
│   └── frontend/                 Next.js UI
├── docker/                       compose for container `pyrite` + instances
├── docs/                         human-readable philosophy/manifesto
├── logs/                         runtime logs, one folder per process (gitkept)
├── satellite-services/           external service adapters and helpers
├── sidecars/                     auxiliary sidecar processes
├── temp/                         local temp files, generated assets (gitignored)
├── .agents/
│   ├── memory/                   agent memory (this system)
│   └── skills/                   project skills
├── skills-lock.json
├── LICENSE.md
└── .git/
```

> This layout intentionally does not include any nested `.agents/.agents/*` reference. The old `memory-other-system` path was a stale artifact and is not part of the active repository structure.

---

## Security (multi-layer, feature core from day 1)
- System login: passphrase → server hashes (Argon2 chain), encrypt; nothing accessible even from DB.
- Storage sections: `apis`, `claves`, `cloud/bóveda` (mode `password` + mode `secure`).
- Optional activable layer: physical USB key replacing internal security for critical sections (design pending; unresolved: loss/damage).
- Auth from day 1. App config (user-owned) in DB; backend boot settings (peppers, Argon2id params, port, DB credentials) in `.env`. Details to be written as sections develop.

## Integrations (progressive versions, not MVP)
- Dólar (dolarapi + full history sync). spoti-pobre. open-nb (rewrite, DB→Postgres, double mode). Downloads (Cobalt + spotdl + FFmpeg). Search (You.com; free fallback DuckDuckGo). Discord bot (private, same Docker, userID-locked). See `features.md`.
