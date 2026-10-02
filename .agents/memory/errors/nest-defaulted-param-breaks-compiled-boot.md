# A defaulted constructor parameter in a provider breaks the compiled boot

## Summary
A NestJS provider whose constructor mixes a decorated injected parameter with a plain one that has a default value boots under tsx but fails under the compiled build, because tsc emits the parameter metadata that tsx does not.

## Context
`RoutingStateService` was `constructor(@Inject(RoutingRepository) routing, policy: LockoutPolicy = DEFAULT_LOCKOUT_POLICY)`. Under `tsx watch` (dev, and every unit and end to end test) the class booted fine. Under `node dist/main.js`, which is what `kr serve` and production run, Nest threw `UnknownDependenciesException: Nest can't resolve dependencies of the RoutingStateService (RoutingRepository, ?)`: tsc emits `design:paramtypes` with `Object` at that index and Nest tries to resolve a provider named `Object`. The build compiled and nobody ran its output, so the production entry was broken without a single test failing. It surfaced the first time the panel was driven from a real browser, because that path needed the compiled entry.

## Solution
Drop the non injected parameter. The lockout policy is a constant, so `recordFailed` reads `DEFAULT_LOCKOUT_POLICY` directly; a configurable policy, if ever needed, becomes a real injected token and never a defaulted parameter. Added a guard so it cannot recur silently: `npm run verify:boot` migrates a throwaway database, boots the compiled `dist/main.js` and fails if `/api/health` never answers. It is red on the buggy class and green on the fix.

## Tags
ts nest di build windows