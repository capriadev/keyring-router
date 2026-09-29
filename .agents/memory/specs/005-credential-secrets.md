# Encrypted credential secrets

Spec ID: 005
Status: pending
Branch: feature/005-credential-secrets
Depends on: spec 002 for the catalog entries that declare `bearer` or `x-api-key` auth.

## Objective

Let a credential hold a secret encrypted at rest, so the cloud providers of spec 002 stop being catalog decoration and become usable. Today `POST /api/credentials` refuses `authKind: 'api_key'` with 422 precisely because there is no safe place to put a key. That refusal is correct and stays correct until this spec lands.

## Design

- Cipher: AES-256-GCM, one random 12 byte IV per secret, authentication tag stored beside the ciphertext.
- Key derivation: Argon2id over the boot pepper with a per-install random salt, through the built in `node:crypto` argon2 of Node 24 (`crypto.argon2("argon2id", { message, nonce, parallelism, memory, passes, tagLength })`). Verified on this machine: argon2id works and is deterministic for the same message, nonce and parameters. No native package and no build step are involved. The pepper lives in `.env` (`KR_SECRET_PEPPER`, 32 random bytes base64, gitignored); the salt lives in the database (`install_keys` table). Neither alone is enough: a stolen database file without the pepper stays opaque, and a leaked `.env` without the database stays useless.
- The Argon2id parameters are boot configuration with documented defaults and a validation pass at boot. The Node runtime is already pinned by `.nvmrc`, so the built in implementation is stable for this project.
- Storage on `credentials`: `secret_ciphertext`, `secret_iv`, `secret_tag`, `secret_version`, `secret_hint` (last four characters, for the UI only). The plaintext secret never reaches a column, a log, an error message or a response body.
- Redaction is a module, not a habit: every log line, error message and support string that could carry credential data goes through it, and tests assert the absence of the secret in all of them.

## Scope

In scope:

- Secrets module in `bll/` (encrypt, decrypt, rotate, hint) with no HTTP knowledge.
- `dal/` schema additions plus an additive migration for the new columns and the `install_keys` table.
- `config/`: `KR_SECRET_PEPPER` validation, refusal to boot when secrets exist and the pepper is missing.
- Gateway: accept `authKind: 'api_key'` with a `secret`, add `PATCH /api/credentials/:id/secret` for rotation, and keep every response secret free.
- Adapter path: `AdapterTarget.secret` stops being always absent, which is what the catalog entries with `authType: bearer` or `x-api-key` need.
- Tests: round trip, tamper detection, wrong pepper, missing pepper with existing secrets, rotation, hint, redaction, and a stub provider that requires the header to prove the secret is actually sent.

Out of scope: passphrase unlock mode, the vault section, the physical USB key layer, OS keychain integration, and multi-user access. Each is its own spec. This one makes one user's secrets safe at rest on their own machine.

## Acceptance criteria

- [ ] Encrypt then decrypt returns the original secret for a representative set, including unicode and long keys.
- [ ] A flipped byte in ciphertext, IV or tag fails decryption loudly and never returns partial data.
- [ ] A wrong `KR_SECRET_PEPPER` fails decryption, and it surfaces as a credential problem, not as a crash.
- [ ] With secrets present and no pepper, boot fails naming the missing variable and printing no secret.
- [ ] Rotation changes the ciphertext while the hint stays stable, and the old ciphertext no longer decrypts.
- [ ] `POST /api/credentials` with `authKind: 'api_key'` returns 201, and the stored value is not readable as plaintext in the database file.
- [ ] No response body, log line, error message or fixture contains the secret value, proven by a test and by a grep over the built output.
- [ ] The migration is additive only: a database created by spec 001 migrates without losing credentials, catalog rows or policies.
- [ ] A stub provider that requires the auth header receives it, proving the wiring end to end without touching a real provider.
- [ ] The 83 tests of spec 001 and its end to end flow keep passing.
- [ ] An independent audit reproduces every criterion above.

## Verification

| Step | Command |
|---|---|
| Typecheck | `npm run tsc --workspaces` |
| Tests | `npm test --workspaces --if-present` |
| Migration | generate, read the SQL in full, then apply with the documented script |
| Build | `npm run build --workspaces` |

## Risks

- Losing `KR_SECRET_PEPPER` makes stored secrets unrecoverable by design. The UI must warn before the first secret is saved.
- Argon2 comes from `node:crypto`, so there is no native dependency to validate. The parameters stay boot configuration because they are the cost knob.
- Rotation is the operation most likely to leave an unusable credential. It is transactional: new ciphertext and new version land together, or neither does.

## Status

pending
