# Level B Developer Themes (code-capable lane)

Author guide: `./creation.md`. Data-only contract: `./packages.md`. Runtime
limits (SEO, hydration, a11y, motion/WebGL fallbacks): `../theme-runtime/limits.md`.
Normative SDK contract: `../../openspec/changes/dev-theme-runtime/sdk-contract.md`.
This page is the integrator's map of the Level B lane: what ships, how it is
built, reviewed, installed, activated, and executed — and where the frozen
data-only lane ends.

## 1. Two lanes, one rule

| | Data-only lane (frozen) | Level B lane (this page) |
|---|---|---|
| Manifest | `theme.json` (`key`, `api`, `templates`, …) | `dev.theme.json` (`id`, `version`, `runtime`, …) |
| Gate | `validateThemeManifest` (`src/lib/theme-package.ts`) | `validateDevThemeBundle` (`src/lib/dev-theme-bundle.ts`) |
| Code | never — `.js/.ts/.html/.sh` refused (`EXECUTABLE_ASSET_EXTS`) | only — `.js/.mjs/.cjs` + `.css`/`.map`/font/image, nothing else |
| Renders via | AST + tokens in page DOM | `ThemeRuntime` iframe only, never page DOM |

The two validators refuse each other's inputs **by design, in both
directions**: a data-only manifest gets `bundle.wrong_lane` here, and a
Level B manifest fails the frozen gate's required fields
(`key`/`api`/`templates`/…). Pinned by `dev-theme-bundle.test.ts`
(lane-separation + executable-l10n + frozen-lane vectors). The data-only
lane is never weakened to admit Level B: executables are still rejected
there (`assetManifest[].path.executable` vector).

## 2. SDK contract (what a theme ships)

Root file `dev.theme.json` (never `theme.json`), validated by
`parseDevThemeManifest` (`src/lib/dev-theme-manifest.ts`):

- `id` slug, semver `version`, display `name`/`publisher`.
- `runtime`: exact pin `DEV_THEME_RUNTIME_VERSION` (`"1.0.0"`) — ranges and
  future pins rejected. A theme built for another runtime never installs,
  and `resolveDevThemeActivation` re-checks the pin before anything goes live.
- `capabilities`: closed allowlist — `presentation`, `animation`, `webgl`,
  `commerce-read`, `cart-write`. Anything else rejected. `animation` runs
  under the page motion budget; `webgl` requires a static fallback;
  `commerce-read` sees ids only (never prices); `cart-write` goes through
  the scoped cart bridge (the theme never decides price or payment).
- `dependencies`: `{name, version, license, integrity}` with
  `sha(256|384|512)-base64` shape. Shape is checked at validate time; bytes
  are verified against pre-vendored files at build time
  (`verifyVendorIntegrity` — local bytes only, never fetched).
- `sections`: `{key, slot, component}` (≤ 64). Slots mirror the AST layout
  slots plus overlay zones: `header`, `main`, `footer`, `sidebar`,
  `drawer`, `popup`. Checkout-exclusive surfaces are absent — a developer
  section can never cover a payment step.
- `settings`: `{key, label, type}` (≤ 128) with the closed six-type set:
  `text`, `image`, `color`, `spacing`, `product-selection`, `animation`.
  `code`, `html`, `url`, and every other kind are rejected at the manifest
  gate. Props arriving at a component are the merchant's settings values
  only.
- Forbidden top-level keys: `server`, `hooks`, `secrets`, `network`,
  `network-capability` (§7 non-goals: no server code, no secrets, no shell,
  no raw network imports in v1). Manifest JSON ≤ 64 KB.

Bundle layout (`BUNDLE_AREAS`): `components/` + `sections/` (JS only),
`styles/` (CSS only), `assets/` (fonts/images only), `locales/` (JSON
only — locale data never executes; code or secrets under `locales/`
refuse). Server areas (`server/`, `api/`, `functions/`, `node_modules/`,
…) have no allowlisted home. Zip-slip/symlink/oversize posture mirrors
`package-zip.ts` limits by documented duplication. Secrets reuse the repo
scanner read-only (`scanSecrets`), so Tier-0 detection cannot drift
between lanes.

## 3. Asset pipeline (bytes → shoppers)

```
author source → assemble → submit → review → publish → install → activate → ThemeRuntime frame
```

1. **Assemble** (`assembleDevThemeBundle`,
   `src/lib/dev-theme-bundle-assemble.ts`; CLI `scripts/build-dev-theme.mjs`):
   manifest gate → bundle gate → optional vendor-bytes check → deterministic
   emit (`dir/name.<sha8>.<ext>`, sorted entries, `release.json` whose
   fingerprint round-trips). Same input bytes always yield the same outputs.
2. **Review** (`createDevThemeReleaseStore`, `src/lib/dev-theme-review.ts`):
   `submit` (idempotent on fingerprint) → `review` (moderator/admin/system
   actor + reason + timestamp; approval binds the release's current
   fingerprint) → `publish` (requires `approved` status AND the publisher
   naming the release's own fingerprint). Any code/dependency/capability
   change mints a new fingerprint, hence a new reviewable version — an
   approval can never transfer to modified bytes. Revoke parks, removal
   quarantines bytes (hashes retained), rollback mints a NEW release with a
   `rollbackOf` link. Every transition emits `theme_audit` / `activity_log`
   rows in the existing shapes (no migration).
3. **Install** (`installReviewedThemeBundle`,
   `src/lib/dev-theme-bundle-install.ts`; listing hook in
   `marketplace-install.server.ts`): re-validates the presented bytes AND
   re-hashes them at install time; proceeds only on equality with the
   published approval's fingerprint. Writes `marketplace_installs` (with
   `artifact_checksum` = fingerprint) + `store_themes` + `theme_versions`
   (`checksum` = fingerprint) + `theme_drafts` triple, all `is_active:
   false`. **Install never activates.**
4. **Activate** (`activateDevThemeInstall`, `src/lib/dev-theme-activate.ts`):
   pure gate (published + approval-for-exact-fingerprint + runtime pin +
   optional live-store re-check) PLUS installed-row linkage
   (`artifact_checksum` and a `checksum`-carrying version row must equal the
   approved fingerprint). Then: clear other flags, set live, audit
   `dev_theme.activated`. Unapproved, tampered, revoked, or wrong-theme
   releases refuse with zero writes. Data-only rows have no
   fingerprint-bound rows, so they cannot enter this lane.
5. **Execute** (`bindDevThemeRuntime` → `ThemeRuntime`,
   `src/components/theme-runtime/`): the binding mints a version-pinned URL
   (`{origin}/t/{name}/{version}/index.html`), the restrictive frame CSP
   (`default-src 'none'`, code kinds admit exactly the asset origin,
   `connect-src 'none'`), and least-privilege `theme:*` grants from
   capabilities (`presentation` → `storefront:read`, `commerce-read` → read
   + `variant:select`, `cart-write` → `cart:add`; `animation`/`webgl` grant
   nothing — they are render-only; `navigate` is never implicit). The
   component renders `sandbox="allow-scripts"` ONLY — no same-origin, no
   top-navigation, no popups, no forms — and theme code is never inlined
   (`srcDoc` does not exist on this component). Data crosses only as
   versioned `v: 2` bridge envelopes (≤ 64 KiB, flood/duplicate-guarded);
   commerce is revalidated server-side.

## 4. Editor exposure (theme-owned widget schemas)

`fromDevThemeManifest` (`src/lib/dev-theme-widgets.ts`) adapts a manifest's
sections to one `theme:{themeId}/{sectionKey}` WidgetDef per section, all
sharing the theme's settings schema mapped 1:1 onto the existing
value-layer kinds (`text→text`, `image→image`, `color→color`,
`spacing→spacing`, `product-selection→product`, `animation→animation` —
every target kind already exists in `PROP_KINDS`; unknown types fail closed,
never invent). Defs satisfy the shared `registerWidget` gate and validate
through `validateProps`/`defaultsFor` like every other tier
(`dev-theme-widgets.test.ts`). Renderer is `custom` (editor-only): schemas
edit settings, they never execute code — storefront execution stays in the
frame.

## 5. Non-goals (v1, enforced)

No server-side code, no hooks/webhook egress, no secrets in the package
(Tier-0, never approvable), no filesystem/shell access, no raw network
imports (dependencies resolve from pinned digests, never theme-declared
URLs), no payment logic, no price authority, no checkout overrides. Each
has a validator vector refusing it.
