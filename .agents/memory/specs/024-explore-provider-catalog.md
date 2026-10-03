# Explore the provider catalog and pick a provider by search

Spec ID: 024
Status: pending
Branch: feature/v1-gateway
Depends on: spec 008 (the local UI) and the `/api/providers` surface.
Origin: with the first browser use of the panel, choosing a provider was a native select with the whole catalog (136 entries) and, while the gateway was unreachable, it rendered empty, so the user could not see any provider to connect. The owner asked for a way to explore the catalog and a searchable picker.

## Objective

Make the declared provider catalog explorable and a provider selectable by search, so a user can see what the gateway can connect to and reach the credential form with a provider already chosen. The catalog is data the gateway reports; the panel adds no list of its own.

## Scope

In scope:

- A `Proveedores` screen: search plus filters by format and auth kind, one row per provider with its display name, id and alias, format, auth kinds, model count and declared base URL, and an action to add a credential for it.
- A searchable provider browser reused by the credential form, replacing the native select of the whole catalog.
- A bridge from the screen to the form: the chosen provider arrives preselected.
- Navigation gains the new screen.
- The pure filter is its own tested module, so the search and the filters are testable without the DOM.

Out of scope:

- Live discovery for providers that declare no models (feature 11).
- Any change to the gateway or its contract.
- A client facing key (feature 21).

## Design

- `services/providers/filter.ts`: `filterProviders` (query over display name, id and alias, plus exact format and auth kind filters) and helpers for the distinct filter values. Pure.
- `ui/molecules/ProviderBrowser.tsx`: the search field, the two filters, the result list and its empty state. It owns the search and filter state and calls `onSelect` with a provider id.
- `app/proveedores/page.tsx`: the screen, over `providers` from the store.
- `CredentialForm`: embeds `ProviderBrowser` where the provider select was.
- The store gains the preselected provider id and the call that sets it; the form consumes it once the catalog is loaded.

## Acceptance criteria

- [x] The `Proveedores` screen lists every provider the gateway reports and shows, per row, its format, auth kinds, model count and base URL.
- [x] Typing a query filters by display name, id and alias, case-insensitively; the two dropdowns filter by format and auth kind; the count of shown against total is visible.
- [x] A query or filter that matches nothing is an empty state with one clear next action, never a blank list.
- [x] Picking a provider on the screen opens the credential form with that provider selected and its base URL pre-filled.
- [x] The credential form picks a provider by search, and the native select of the whole catalog is gone.
- [x] The filter module is unit tested and the frontend typecheck and build pass.

## Risks

- A search over 136 rows is cheap; rendering every match is fine, but the list is capped per render if the catalog grows, and that decision is written where it is made.
- The preselection travels through the store, so a refresh of the form keeps it consistent; it is cleared once consumed so a later visit is not surprised.

## Status

implemented on 2026-10-02, browser walk pending. `services/providers/filter.ts` (search over the three names plus the two filters, with the distinct values read from the catalog), `ui/molecules/ProviderBrowser.tsx` (search, filters, rows, honest empty states), the `Proveedores` screen, the navigation entry, and the form now picking by search. The filter has 8 tests; the frontend typecheck, the full build and the six routes are green (`GET /proveedores` answers 200). What the suites cannot assert is the click-through from the screen to a pre-filled form, which needs a browser.