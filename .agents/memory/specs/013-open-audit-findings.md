# Open findings from the audits of the contracts and the transports

Spec ID: 013
Status: pending
Branch: feature/v1-gateway
Origin: the two independent passes over specs 010 and 012 (`kr-audit`, run_00018 and run_00019). Everything both passes proved is fixed in 012 except what is recorded here: four items that need a decision rather than a patch, and the honest statement of what no run has ever covered. Nothing here breaks a working path today, which is why it is registered instead of rushed.

## What this spec holds

### A-2 / A-2b: a wire shape no client reads is protected by nothing

`types/api.spec.ts` asserts the three shapes the gateway serves (a credential, a catalog row, a policy rule) and nothing else. The audit proved the asymmetry: renaming a field breaks the backend and the interface, while removing one breaks no workspace at all. The reason is real and worth writing down: removing a field only breaks a client that reads it, and a shape nobody reads cannot be guarded by a compile-time check. Decision: the assertion stays on the served shapes, and the guard for the rest is the client that reads them, whose own tests fail. Asserting all forty would be theatre, because the check would pass on every shape nobody uses.

### H-B7: a client abort is reported as an unreachable provider

`http.ts` reports every failed call as `unreachable`, so a client that closed the tab produces the same failure as a provider that is down. The adapter error contract in `types/provider.ts` is frozen by spec 001, so telling them apart needs a decision: a new `ProviderErrorKind` value, or an `aborted` flag beside the kind. The re-read added the useful datum that the composed signal already carries the client's own abort reason, so the information is there and only the reporting is missing. Decision: its own fix spec, together with whatever the interface shows for a cancelled request.

### H-B8: a JSON frame that is not an object is discarded with no notice

`bll/translation/payload.ts` and the three codecs drop a frame that parses to a primitive or an array without reporting anything. A provider that answers `data: 42` ends the stream with no frame and no failure. Decision: a drop has to be visible, as a stable code plus a warning, in the same fix as H-B7.

### N-5: the request budget is a constant

The 10 s budget now reaches every call and has no path to be configured. Decision: it stays a constant until a spec makes it configurable, and that spec owns validating the value.

## What no run has covered, and stays open by nature

- The interface running against a live API: `apps/frontend` has no test script and the end to end run does not start Next.
- A real provider: everything runs against loopback stubs and an injected fetch.
- A real client disconnect over a socket: the path is read and exercised at the transport level, never end to end.
- GitHub Actions: the workflow commands reproduce locally, no run has executed them.
- The buffer ceiling and the split frames on a real socket: both measured with in-memory generators.

## Acceptance criteria

- [ ] H-B7 and H-B8 are fixed in a fix spec of their own, each with a test that fails without the fix, and the error contract change is decided in writing.
- [ ] The interface gets a test script, or the interface milestone states in its spec why reading a live API is out of scope for this version.

## Status

pending
