# The browser panel cannot reach the gateway without CORS

## Summary
The panel is a browser page on one loopback origin and the API answers on another, so every call it makes is cross origin; without CORS headers the browser discards the answer and the panel reports the gateway as unreachable while it answers to curl.

## Context
The panel fetches the API from the browser (`requestJson`, called from a `use client` provider) at `http://127.0.0.1:4310`, while the page is served from `http://localhost:3000`: different host and port, so a different origin. The gateway enabled no CORS, so `GET /api/providers` returned 200 without `access-control-allow-origin` and the preflight `OPTIONS` returned 404. `fetch` rejects exactly like a refused connection, so the panel produced `network_error` and showed "No hay respuesta del gateway". Every `curl` and every test passed, because none of them is a browser crossing an origin, which is why the defect survived until the panel was opened in a browser.

## Solution
Enable CORS on the gateway for loopback origins only (`gateway/cors.ts` plus `app.enableCors` in `main.ts`): no origin at all (curl, the CLI) is allowed; an http or https origin on `localhost`, `127.0.0.1` or `::1` is allowed on any port, so the panel is not pinned to one; anything else is refused, so a website the user visits cannot read the API. Verified with the real headers: the GET now carries `access-control-allow-origin` and the preflight answers 204 with the methods.

## Tags
cors browser panel loopback gateway windows