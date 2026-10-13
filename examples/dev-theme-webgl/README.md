# Dev-theme WebGL slice — capability-gated 3D showcase with static fallback

Capability proof for `webgl` under the Level B SDK contract, proving a
developer can ship a Three.js showcase without modifying Framique core.

Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` (§2 `webgl`:
Three.js scenes in an isolated canvas with a static-image fallback when
WebGL is unavailable).
Validator: `src/lib/dev-theme-manifest.ts` (used, never reimplemented).

## Files

| File | Role |
|---|---|
| `dev.theme.json` | Shippable manifest: `presentation` + `webgl` + `commerce-read` capabilities, one pinned `three` dependency (version + license + integrity shape), one section (`webgl-showcase` → `WebGLProductShowcase` on `main`), three merchant settings from the closed field set. No `animation`, no `cart-write`, no forbidden keys. |
| `manifest.ts` | Re-exports the manifest and validates it via `parseDevThemeManifest`. Documents that `three` is declared-only (NOT in root `package.json`). |
| `commerce.ts` | Read-scoped commerce context (§5): ids, titles, handles, images, options, variant availability. Amount display is host-owned, so no amount fields exist here by construction. |
| `three.stub.d.ts` | Ambient stub so the dynamic `import("three")` typechecks without installing `three` at the root. |
| `webgl-product-showcase.ts` | Section definition: settings schema (§4), Section-shape render contract (§3), static-first render, capability gate (`resolveShowcaseMode`), Three.js mount reached only via dynamic `await import("three")` after a live GL-context probe, reduced-motion short-circuit, unmount dispose. |
| `webgl-manifest.test.ts` | Manifest gates (13 tests). |
| `webgl-product-showcase.test.ts` | Section proof (18 tests). |
| `vitest.config.ts` | Local runner — same precedent as `examples/dev-theme-slice` (the root config does not include this dir). |

## Run

```sh
npx vitest run --config examples/dev-theme-webgl/vitest.config.ts
npx eslint examples/dev-theme-webgl/
node scripts/secret-scan.mjs
```

## What the slice proves end to end

1. A manifest with the `webgl` capability and a pinned `three` dependency
   (`0.186.1`, MIT, `sha384` integrity shape) passes the real validator;
   unknown capabilities, forbidden keys, missing digests, and non-exact
   runtime pins are rejected at the gate.
2. Merchant settings (heading text, product selection, fallback poster
   image) render through the section using only the closed builder-field
   set; product data flows only through the platform commerce context — a
   source scan asserts theme source carries no catalogue-amount literals
   and performs no network access.
3. The capability gate resolves `webgl` ONLY when a GL context exists AND
   reduced motion is not preferred. In the vitest `node` environment WebGL
   is absent, so the static-image fallback path runs: product image, poster,
   and product data render with no `<canvas>`.
4. Reduced motion forces the fallback even when WebGL exists (mocked
   `webglAvailable: true` at render level; live GL canvas + reduced-motion
   flag at mount level — the loader is never called either way).
5. The loader gate holds both ways with mocked contexts: a null GL context
   never loads the engine; a mocked GL context loads it exactly once,
   renders, and `destroy()` disposes the scene with the live-scene registry
   returning to zero. A malformed engine module falls back without crashing.
6. The single-engine policy holds: no static `three` import anywhere in
   theme source (source-scan assertion); the engine is reached only through
   the dynamic `await import("three")` inside `mountShowcaseScene`.

## Explicitly out of scope (needs the bundle pipeline + a real browser)

- **Vendoring:** `three@0.186.1` is declared, not installed. The bundle
  pipeline must vendor the pinned bytes at bundle time and verify the
  `integrity` digest against the immutable bytes at review (the validator
  checks shape only, per contract §1).
- **Real-GPU proof:** node has no WebGL, so scene rendering against a real
  `three` engine and real GL context is unproven here — it needs a browser
  harness (playwright/Chrome) with the vendored bundle.
- **Review checklist:** the capability-gated human review (§2), sandbox
  execution, publish/rollback flow, and the motion-budget treatment of a
  full 3D scene are follow-up tracks, not this slice.
- Bundle pipeline, publisher review flow, registry writes, core renderer
  changes, network imports: untouched.
