# Frame30 Starter (Level B)

Runnable Level B starter: three theme-owned sections (GSAP hero,
Three.js scene, video rail) + shared helpers + custom-layout CSS + local
assets + locale data. Assembled ONLY through the real pipeline
(`assembleDevThemeBundle` → review store → activation → document);
no hand-built approvals, no parallel pipeline.

## Layout (bundle paths)

| Path | Role |
|---|---|
| `dev.theme.json` | Manifest (id `frame30-starter`, runtime `1.0.0`, 5 capabilities, 2 pinned deps, 3 sections, 6 shared settings + per-widget extras) |
| `sections/hero.js` | `HeroCanvas`: static-first grid render + genuine GSAP + ScrollTrigger mount (dynamic bare imports only) |
| `sections/webgl-scene.js` | `WebglScene`: canvas placeholder + poster still, real `three` frame behind `webgl` + reduced-motion + context gates |
| `sections/media-rail.js` | `MediaRail`: lazy video rail (`data-src` until visible, still fallback without video support) + `starter-rail` custom layout |
| `components/shared.js` | Escape/clamp/motion-budget helpers (imported relatively, so the asset gate proves presence) |
| `styles/main.css` | Custom layout (`starter-grid` + `starter-rail`, poster still via `../assets/poster.svg`) |
| `assets/poster.svg`, `assets/grain.png` | Local stills (hashed + served, never remote) |
| `locales/en.json` | Locale data (never executes) |

`README.md` (this file) is docs only — never part of the bundle
(`.md` is refused by the bundle gate; the test maps exactly the 9 files
above).

## Steps (every step a developer takes)

1. **Manifest**: edit `dev.theme.json` (closed capabilities, exact-pinned
   `gsap@3.15.0` + `three@0.186.1` with `sha384/sha512` integrity shape,
   `main` slots only, closed setting types). Validate with
   `parseDevThemeManifest`.
2. **Components**: keep section code in `sections/*.js`, shared code in
   `components/*.js`; reference shared files with explicit relative paths
   (`../components/shared.js`) — extensionless aliases are build-time only,
   explicit file refs must be present or the bundle refuses
   (`bundle.asset_missing`). Bare specifiers (`gsap`, `three`,
   `gsap/ScrollTrigger`) are registry pins, never files.
3. **Styles/assets**: keep CSS in `styles/*.css`, images/fonts in
   `assets/`, locale JSON in `locales/`; reference local art relatively
   (`../assets/poster.svg`). No `https://` literals unless the host is
   passed via `allowedNetworkHosts` (default: none).
4. **Assemble**: run `assembleDevThemeBundle({ manifestJson, files,
   dependencies, allowedNetworkHosts })` — manifest gate → bundle gate
   (allowlist, server/secrets/network screens, pin equality + confusion
   backstops, asset completeness, traversal/symlink/oversize) → optional
   vendor-bytes check → deterministic hashed outputs + `release.json`.
   Same bytes always yield the same fingerprint.
5. **Review**: `submit` (idempotent on fingerprint) → `review`
   (moderator/admin/system + reason + timestamp, binds exact fingerprint) →
   `publish` (requires `approved` + naming the release's own fingerprint).
   Any byte change mints a new fingerprint, hence a new review.
6. **Install**: `installReviewedThemeBundle` re-validates + re-hashes the
   presented bytes and proceeds only on equality with the published
   approval. Writes ledger + host triple with `is_active: false` —
   install never activates.
7. **Activate**: `resolveDevThemeActivation` (published + exact-fingerprint
   approval + runtime pin + optional theme/version binding + live-store
   re-check) → `bindDevThemeRuntime` (version-pinned `/t/…` URL +
   restrictive CSP + least-privilege grants) → `activateDevThemeInstall`
   (ledger + version-row checksums must equal the fingerprint; ledger
   version pin must equal the manifest version when present).
8. **Serve**: the `/t/…` lane re-verifies per request (approval recompute +
   real activation gate + descriptor multiset binding + per-file hash).
   Pass the live store into `buildDevThemeDocument({ store })` for the
   serve-time revocation re-check — a snapshot revoked after it was taken
   404s instead of serving stale bytes.
9. **Updates + rollback**: publish `1.0.1`, then if latest is revoked or
   tampered, `rollback({ targetFingerprint: <last-approved> })` mints a NEW
   audited `published` release (`rollbackOf` link). Rollback to
   revoked/removed/unapproved bytes refuses; downgrades ride only this
   audited path, never a silent version fall.

## Run

```sh
npx vitest run src/lib/dev-theme-starter-theme/starter.test.ts
npx tsc --noEmit -p tsconfig.json
node scripts/secret-scan.mjs
```

See `docs/themes/level-b.md` (pipeline map) and `docs/themes/sdk.md`
(developer SDK: manifest → assemble → review → install → activate →
serve → updates/rollback, with starter pointers).
