# Dev-theme slice — custom animated section without touching core

Thin vertical slice proving a developer can ship a custom animated product
section under the Level B SDK contract without modifying Framique core and
without requesting new built-in widgets.

Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md`.
Validator: `src/lib/dev-theme-manifest.ts` (used, never reimplemented).

## Files

| File | Role |
|---|---|
| `dev.theme.json` | Shippable manifest: `animation` + `commerce-read` capabilities, one GSAP dependency (pinned + integrity shape), one section (`animated-spotlight` → `AnimatedProductSection` on `main`), three merchant settings from the closed field set. No `webgl`, no `cart-write`, no forbidden keys. |
| `manifest.ts` | Re-exports the manifest and validates it via `parseDevThemeManifest`. |
| `commerce.ts` | Read-scoped commerce context (§5): ids, titles, handles, images, options, variant availability. Amount display is host-owned, so no amount fields exist here by construction. |
| `animated-product-section.ts` | Section definition: settings schema (§4), Section-shape render contract (§3), static-first render, GSAP mount reached only via dynamic `import("gsap")` (single-engine policy), reduced-motion fallback, unmount cleanup. |
| `slice-manifest.test.ts` | Manifest gates (11 tests). |
| `animated-product-section.test.ts` | Section proof (13 tests). |
| `vitest.config.ts` | Local runner — same precedent as `starter-plugin` (the root config only includes `src/**` and `starter-theme`). |

## Run

```sh
npx vitest run --config examples/dev-theme-slice/vitest.config.ts
npx eslint examples/dev-theme-slice/
node scripts/secret-scan.mjs
```

## What the slice proves end to end

1. A manifest with an animated product section passes the real validator.
2. Merchant settings (heading text, product selection, animation intensity)
   render through the section using only the closed builder-field set; outer
   types (`code`, `url`) are rejected at the gate.
3. Product data flows only through the platform commerce context — a source
   scan asserts theme source carries no catalogue-amount literals and performs
   no network access.
4. Motion follows the single-engine policy (dynamic GSAP import, no static
   import), stays under a per-section budget (600ms / 48px caps), renders a
   functional static fallback under reduced motion without loading the engine,
   and kills its timeline on unmount (live-timeline registry returns to zero,
   no leaked tweens on the shared GSAP timeline).

## Explicitly out of scope (next slices)

- **WebGL/Three.js:** `webgl` is declared in the closed capability allowlist
  but this slice does not implement it. Next slice: an isolated-canvas scene
  with a static-image fallback when WebGL is unavailable, plus the
  capability-gated review checklist proof.
- Bundle pipeline, publisher review flow, registry writes, core renderer
  changes, network imports: untouched.
