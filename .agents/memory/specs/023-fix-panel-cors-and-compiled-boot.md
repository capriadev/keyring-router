# Fix: the panel could not reach the gateway, and the compiled build did not boot

Spec ID: 023
Status: completed
Branch: feature/v1-gateway
Origin: the first time the panel was driven from a real browser, which is one of the items left to the user. The panel reported the gateway as unreachable and, chasing that, the compiled entry turned out not to boot at all. Two independent defects, both fixed here; the post-mortems are in `errors/`.

## Objective

Make the local panel usable from a browser, and make the compiled gateway the same one the suites exercise, so a defect in the built entry cannot hide behind the source suites again.

## Scope

In scope:

- CORS on the gateway for the local panel, loopback origins only.
- A guard that boots the compiled `dist/main.js` and fails if it does not answer.

Out of scope:

- Authentication or a client facing key (feature 21's open decision).
- Any change to what the panel shows.

## Design

- `gateway/cors.ts`: `isLocalPanelOrigin` (pure, tested) plus the method list. Wired in `main.ts` with `app.enableCors`: no origin is allowed, a loopback http or https origin on any port is allowed, anything else is refused. The gateway listens on loopback, so this is the same boundary it already had.
- `RoutingStateService`: the non injected, defaulted constructor parameter is removed; the lockout policy is the constant `DEFAULT_LOCKOUT_POLICY`. A defaulted parameter is not how a NestJS provider takes configuration.
- `apps/backend/scripts/boot-check.mjs` and `npm run verify:boot`: migrate a throwaway database, boot `dist/main.js`, poll `/api/health`, fail on a non answer.

## Acceptance criteria

- [x] The panel reads the gateway from a browser: `GET` carries `access-control-allow-origin` for a loopback origin and the preflight answers with the methods.
- [x] A non loopback origin is refused, so a website the user visits cannot read the API.
- [x] The compiled gateway boots: `npm run verify:boot` is green, and red when the non injected parameter is present.
- [x] The source suites, the typecheck and the end to end flow keep passing.

## Risks

- CORS on loopback lets any local page call the API; the gateway listens on loopback only, so only local software can reach it, which is the boundary the product already declared. A non loopback origin is still refused.
- The guard boots a real process on a fixed port (4399 by default, overridable with `KR_BOOT_CHECK_PORT`); it belongs to CI and a release, not to the unit suite.

## Status

completed. Both defects are fixed, the guard is green and was shown red on the bug, and the panel works from a browser. The compiled-boot story is in `errors/nest-defaulted-param-breaks-compiled-boot.md` and the CORS one in `errors/browser-panel-cannot-reach-gateway-without-cors.md`.