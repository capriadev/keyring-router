# Browser sessions, MITM and CLI impersonation as provider access

## What was tried

Reviewed the OmniRoute families that reach providers without an API key of the user: `providers/web-cookie.ts` (28 providers driven by browser cookies), `src/mitm/**`, the identity files `cliFingerprints.ts`, `claudeWebFingerprint.ts`, `codexIdentity.ts` and `codexClient.ts`, and the providers whose token comes from an automated harvester.

Also reviewed and left out of reuse: `open-sse/vendor/**` (vendored third party code with no license file found, so its terms cannot be honoured) and their persistence layer `src/lib/db/**` (Keyring Router owns one dal, and theirs is not it).

## Why it was discarded

It contradicts Keyring Router's own principles: honest compatibility, explicit routing and no hidden account selection. It also drags in a legal and product risk the gateway does not need: session scraping and CLI impersonation violate provider terms, break silently whenever the provider changes, and cannot be handed to a client as a supported integration.

## Alternative chosen

Only the credential families the user legitimately owns: API key, local server and no-auth providers. Spec 002 imports exactly those three.

## Tags

integration providers product license
