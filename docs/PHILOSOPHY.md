# Keyring Router - Philosophy

## What it is

Keyring Router is a self-hosted local gateway for AI inference APIs. It gives a developer one local endpoint while preserving the identity of each provider credential behind it.

It addresses the practical case of having access, balance or a particular reason to use several providers and several accounts from the same provider. Instead of changing endpoint and configuration for every account, the user selects a namespaced model such as `ollama-work/gptoss:120b`.

It is not a hosted API-key vault, a SaaS control plane or a promise to make all providers interchangeable. Each user owns the process, configuration and credentials on their own machine.

## The two distinctions that matter

1. **A provider is not a credential.** Multiple accounts for one provider remain first-class and separate. An explicit alias identifies each account and prevents accidental mixing.
2. **A catalog is not a policy.** The catalog answers which models a credential can access. The policy answers which models should be visible and routable now. A large provider catalog can expose only an intentional subset, such as free models.

## Principles

1. **Local ownership.** Credentials stay under the user's control. Defaults minimize network exposure and never place secrets in tracked configuration.
2. **Explicit routing.** A model name communicates the credential namespace it uses. Hidden account selection is avoided.
3. **Provider adapters, not provider leakage.** Each provider's authentication and protocol details are isolated, while the gateway offers a stable local interface.
4. **Policy before exposure.** A model must pass the configured policy before it appears in listings or receives traffic.
5. **Honest compatibility.** Unsupported provider features, rate limits and billing behavior are surfaced instead of silently flattened.
6. **Small, verifiable increments.** Build the first provider and first flow completely before broadening the integration matrix.
7. **Reuse responsibly.** Mature open-source integrations can inform or supply compatible code only after license review and required attribution. Keyring Router's multi-account namespace and catalog-policy model remain its own design.

## Direction

The initial runtime is Node.js and TypeScript, with SQLite as the zero-setup default and optional PostgreSQL for users who choose it. The local CLI is `kr`; running the gateway and installing it as an OS service are deliberately separate actions.

The project begins verified on Windows. Linux and macOS support is welcome once it is tested, rather than claimed by assumption.

For implementation details and open technical choices, see `.agents/memory/architecture.md`. For the development method, see `AGENTS.md`.

---

## [SUPERSEDED] Inherited Pyrite philosophy

The historical section below belongs to the project from which this repository skeleton was copied. It is retained as a trace only and must not be used as Keyring Router guidance.

> "Oro de los tontos": humilde por fuera, sólido por dentro. Esta es la intención y las reglas de fondo del proyecto.

## Qué es Pyrite
Sistema personal, **single-user**, privado y **local-first**. Los datos sensibles no salen del equipo. Repo **público** para que cualquiera lo clone y lo use local (no es SaaS).

## Principios
1. **Ordinario por fuera, sólido por dentro.** UI humilde, arquitectura robusta.
2. **Local es la frontera.** Sin cloud de la data salvo decisión explícita.
3. **Seguridad es feature core.** Ingreso robusto (hash + encadenado) y capas por secciones sensibles (apis, claves, bóveda con modo contraseña y modo seguro). Capa física USB opcional a futuro.
4. **Una fuente de verdad por dominio.** Un solo sistema de tasks, un solo esquema crypto, un solo patrón de hooks, un solo store de secretos. Nada de dos sistemas en paralelo.
5. **Integraciones desacopladas.** Los servicios externos viven fuera del core y se consumen por HTTP/CLI. El núcleo jamás importa su código.
6. **Deuda no se arrastra, se reescribe limpio.**
7. **Consistencia específica.** Convenciones claras por área que se cumplen en cada trabajo puntual.

## Cómo se construye (método)
- **Por versiones progresivas**, no MVP: primero lo esencial, luego mejoras, luego servicios.
- **Analizar antes de codificar**: reutilizar, prever conflictos, escribir lo mínimo necesario.
- **Módulos atómicos** reutilizables hasta la mínima acción.
- **Ramas** GitHub Flow + **commits por conjunto relevante** (tarea → commit → repetir).
- **Spec-driven development** obligatorio (specs + `features.md` con `last_id`).

## Stack
- Interfaz: Next.js + TypeScript + Tailwind.
- Backend: Nest.js + TypeScript, modular por capas.
- Postgres + Redis en Docker (contenedor `pyrite`).
- El backend corre solo y aislado, arranca al iniciar Windows.

Ver detalles técnicos en `.agents/memory/architecture.md`; la metodología, en `AGENTS.md`.
