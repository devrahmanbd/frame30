# Level B real-execution fixture (`levelb-real-theme`)

A REAL fixture theme whose executed bytes are the repo's OWN `gsap` ESM
sources and `three` package — no hand-written animation or WebGL
stand-ins. The libraries ship near-verbatim as `components/vendor/*.js`
inputs (`gsap-core.js` + `Observer.js` + `three.core.js` byte-identical to
`node_modules/`; `CSSPlugin.js` + `ScrollTrigger.js` identical except their
single intra-package relative specifier pinned to the content-hashed sibling,
`three.module.js` — the renderer implementation — identical except its two
`./three.core.js` specifiers pinned; the pipeline emits bytes verbatim and
never rewrites imports, so each pin is mechanical and rewrite-proofed in
`prepareRealTheme`); `app.template.js`
is the only authored theme code and it drives the genuine libraries (GSAP
timeline + ScrollTrigger scrub + `THREE.WebGLRenderer` scene via real ESM
imports + `gsap.registerPlugin`).

Why ESM sources, not the UMD `dist/` builds: the UMD wrapper
(`(t=t||self).window=...`) assigns `window.window` and throws when loaded
as an ES module (measured in the frame). The ESM sources are the same
package version, genuine `gsap`/`ScrollTrigger` classes.

## Files

- `app.template.js` — theme entry TEMPLATE. The four `__VENDOR_*__` tokens
  are substituted at prep time with the pinned relative URLs of the hashed
  vendor outputs (see below). No URLs, no secrets, no server-code markers —
  it passes the bundle gate as-is. The three runtime is `three.module.js`
  (the full ESM build carrying `WebGLRenderer`, importing `./three.core.js`
  — `three.core.js` alone exports no renderer; both vendor files resolve to
  content-hashed outputs via pinned specifiers).
- `main.css` — hero initial state (opacity 0, offset) + canvas sizing. The
  GSAP timeline animates to opacity 1; the spec asserts the computed end
  state.
- `en.json` — locale stub (pipeline shape completeness).

## Prep (`prepareRealTheme` in `.e2e/helpers-levelb.ts`, all REAL lanes)

1. Read `node_modules/gsap/gsap-core.js`, `node_modules/gsap/CSSPlugin.js`,
   `node_modules/gsap/Observer.js`, `node_modules/gsap/ScrollTrigger.js`,
   `node_modules/three/build/three.core.js`,
   `node_modules/three/build/three.module.js` (versions + licenses from
   their `package.json` files; integrity pins computed as real digests of
   the assembled bytes).
2. Compute the `gsap-core` + `observer` + `three-core` output names with the
   REAL `hashedOutputPath`, pin the single relative specifier in
   `CSSPlugin.js` (`./gsap-core.js`) and `ScrollTrigger.js` (`./Observer.js`)
   and the two `./three.core.js` specifiers in `three.module.js` to those
   hashed names (exact-count, else refuse), then compute their output names
   and substitute the four tokens in `app.template.js`.
3. `assembleDevThemeBundle` WITH `vendorFiles` — the documented vendor stage
   cryptographically proves every manifest pin matches the assembled bytes
   (local bytes only, never a fetch), and the rewrite proof shows the three
   rewritten files equal their repo sources except the pinned specifiers.
   The bundle gate's network-host literals are comment constants inside the
   vendored files (see the provenance comments in the helper); they
   travel as `allowedNetworkHosts` while the frame CSP (`connect-src 'none'`,
   asserted in the spec) denies any runtime fetch.
4. `submit → review → publish` on the REAL review store, then
   `activateDevThemeInstall` on install-equivalent `fakeDb` rows.

## Regeneration

Output names embed `sha8(content)`. If `gsap`/`three` upgrade, prep
recomputes automatically (nothing hardcoded) — but the recorded
`allowedNetworkHosts` provenance, the specifier-pin expectations (the
rewritten files must still carry exactly one intra-package specifier), and
the version assertions in the spec must be re-verified: run the spec and
read the gate errors, never weaken the gate.
