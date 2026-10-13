# Demo theme fixture — bespoke commerce without core changes

A demo theme proving the bespoke-commerce story under the Level B SDK
contract **without modifying core**: an animated storytelling block, a lazy
media carousel, and custom product cards with a variant selector whose cart
actions travel only through versioned bridge v2 envelopes.

Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md`.
Validators (used, never reimplemented): `src/lib/dev-theme-manifest.ts`,
`src/components/theme-runtime/bridge-v2.ts`,
`src/components/theme-runtime/capabilities.ts`,
`src/components/theme-runtime/ThemeRuntime.tsx`,
`src/lib/dev-theme-bundle.ts`.

## Files

| File | Role |
|---|---|
| `dev.theme.json` | Shippable manifest: `presentation` + `animation` + `commerce-read` + `cart-write`, one GSAP dependency (pinned + integrity shape), three sections on `main`, fourteen merchant settings from the closed field set. No `webgl`, no forbidden keys. |
| `manifest.ts` | Re-exports the manifest and validates it via `parseDevThemeManifest`. |
| `commerce.ts` | Read-scoped commerce context (§5): ids, titles, handles, images, options, variant readiness. Figure display is host-owned, so no figure fields exist here by construction. |
| `shared.ts` | Shared presentation helpers: HTML escaping, reduced-motion probe, merchant input clamps, motion presets under the page budget. |
| `story-block.ts` | Section 1 — animated storytelling block: static-first render, GSAP mount reached only via dynamic `import("gsap")`, reduced-motion static fallback, unmount cleanup via a live-timeline registry. |
| `media-carousel.ts` | Section 2 — lazy media carousel (image + video slides): `data-src` placeholders while hidden, a single `requestSlideLoad` gate, still-frame fallback without video support, empty-list note, gate destroy on unmount. |
| `product-cards.ts` | Section 3 — bespoke product cards + variant selector: strict `variant.select` / `cart.add` envelope builders (throw on weak input, attach only schema fields), source-scanned for commerce purity. |
| `fixture-bundles.ts` | Test support (not shipped code): fixture install grants, catalogue + carousel fixtures, the ThemeRuntime frame identity. Excluded from the bundle mapping. |
| `demo-manifest.test.ts` | Manifest gates (17 tests). |
| `story-block.test.ts` | Story proof: settings render, motion, cleanup (13 tests). |
| `media-carousel.test.ts` | Carousel proof: render, lazy gate, fallbacks, cleanup (12 tests). |
| `product-cards.test.ts` | Cards proof: render, selectors, builders, source scans (17 tests). |
| `commerce-bridge.test.ts` | Bridge + runtime proof against the real validators (16 tests). |
| `vitest.config.ts` | Local runner — same precedent as `starter-plugin` (the root config does not include this fixture; adding it there is the integrator's call). |
| `tsconfig.json` | Local typecheck scope (fixture + referenced core gates only). |

## Run

```sh
npx vitest run --config examples/demo-theme/vitest.config.ts
npx tsc --noEmit -p examples/demo-theme/tsconfig.json
npx eslint examples/demo-theme/
node scripts/secret-scan.mjs
```

## What the fixture proves

1. The manifest passes the real validator with the commerce pair declared
   and `webgl` absent.
2. All three sections render from fixture commerce data through the
   ThemeRuntime SSR shell identity (`demo-atelier/0.1.0`), with merchant
   settings drawn only from the closed builder-field set.
3. Motion follows the single-engine policy (dynamic GSAP import only),
   stays under the page budget (600ms / 48px), renders a functional static
   fallback under reduced motion without loading the engine, and kills its
   timeline on unmount (live registry returns to zero).
4. The carousel fetches nothing until visible: hidden output carries zero
   `src` attributes and the loader stub stays silent until `markVisible`.
5. Variant selection and cart adds leave only as `variant.select` /
   `cart.add` v2 envelopes that the real `authorizeThemeCall` admits under
   the fixture grants; forged price/stock/tenant/payment fields are
   rejected as `theme.forbidden_field` without reaching `onCall`; a
   source scan asserts no price/stock/tenant literals in theme source.
6. The mapped fixture bundle (`dev.theme.json` + section sources under
   `sections/` + context under `components/`) passes the real
   `validateDevThemeBundle` gate with a stable fingerprint.

## Explicitly out of scope (follow-ups)

- **WebGL/Three.js:** `webgl` is declared in the closed capability allowlist
  but this fixture does not implement it. Next: an isolated-canvas scene
  with a static-image fallback when WebGL is unavailable, plus the
  capability-gated review checklist proof.
- **Mounted E2E:** these tests pin the host-side contract under node
  (validators, SSR shell, gate behaviour). Real-frame behaviour — null-origin
  isolation, GSAP paint timing, video decode, IntersectionObserver wiring —
  needs a mounted browser E2E plus the bundle pipeline (build/ship/review
  flow); deliberately not attempted here.
- Bundle pipeline, publisher review flow, registry writes, core renderer
  changes, network imports: untouched.

## Deviations

- None from the contract. One structural note: the fixture adds `shared.ts`
  (presentation helpers shared by all three sections) beyond the
  manifest + section + commerce + tests pattern, so escaping, motion
  presets, and budget caps stay identical across sections; it is covered by
  the same source scans and bundle mapping as the sections.
