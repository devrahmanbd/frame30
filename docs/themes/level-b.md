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
- `settings`: `{key, label, type}` (≤ 128) with the closed fifteen-type
  set: `text`, `image`, `color`, `spacing`, `product-selection`,
  `animation`, `number`, `boolean`, `select`, `link`, `group`, `repeater`,
  `media`, `video`, `icon`. `code`, `html`, `url`, and every other kind
  are rejected at the manifest gate. Declared modifiers ride existing
  prop members only (`required`, `default`, `help`, `min`, `max`);
  `options` is honoured on `select` only (1..32 closed `{value, label}`
  entries — a select without options is rejected, never an open input)
  and `fields` on `group`/`repeater` only (1..32 nested scalar settings,
  one nested-group level flattened, never a nested repeater). Props
  arriving at a component are the merchant's settings values only.
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
value-layer kinds — every target kind already exists in `PROP_KINDS`;
unknown types fail closed, never invent:

| Setting type        | Prop kind (`→`)                    | Limits / notes                                              |
| ------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `text`              | `text` (`multiline` → `richtext`)  | Declared modifiers only (`required/default/help/min/max`).  |
| `image`             | `image`                            | Asset-library reference; uploads stay platform-side.        |
| `color`             | `color`                            | Token-bound colour.                                         |
| `spacing`           | `spacing`                          | Scale step; clamps ride `min`/`max`.                        |
| `product-selection` | `product` (`multiple` → repeater)  | Yields ids only — never prices; nested `multiple` refused.  |
| `animation`         | `animation`                        | Preset name only; page motion budget applies.               |
| `number`            | `number`                           | Clamped by `min`/`max` through `validateProps`.             |
| `boolean`           | `boolean`                          | Single checkbox.                                            |
| `select`            | `select`                           | 1..32 closed `options`; hostile values refused; option-less |
|                     |                                    | selects rejected, never widened to open input.              |
| `link`              | `link`                             | `SAFE_HREF` policy (`https`/relative/`#`/`mailto:`/`tel:`). |
| `group`             | `group`                            | 1..32 scalar `fields`, stored flat; one nested-group level  |
|                     |                                    | flattens, deeper nesting refused (`nested_too_deep`).        |
| `repeater`          | `repeater`                         | 1..32 scalar row `fields`; rows never nest                  |
|                     |                                    | (`nested_repeater`); row cap is the value layer's.          |
| `media`             | `media`                            | `SAFE_HREF` URL policy (`javascript:`/`data:` never survive).|
| `video`             | `video`                            | Same URL policy as `media`.                                 |
| `icon`              | `icon`                             | Named-icon token; markup stripped.                          |

Cross-kind modifiers (`fields` on `text`, `options` on `number`) are
ignored — the kind comes from the closed map only. Group leaves claim
flat keys (duplicates/reserved `bp`/hostile keys refused); repeater row
keys live in a row-local namespace. Defs satisfy the shared
`registerWidget` gate and validate through `validateProps`/`defaultsFor`
like every other tier (`dev-theme-widgets.test.ts`,
`dev-theme-widgets-kinds.test.tsx`). Renderer is `custom` (editor-only):
schemas edit settings, they never execute code — storefront execution
stays in the frame.

## 5. Non-goals (v1, enforced)

No server-side code, no hooks/webhook egress, no secrets in the package
(Tier-0, never approvable), no filesystem/shell access, no raw network
imports (dependencies resolve from pinned digests, never theme-declared
URLs), no payment logic, no price authority, no checkout overrides. Each
has a validator vector refusing it.

## 6. Updates, rollback, per-version activation (frame30 item 9)

- **Versioned releases.** Every code/dependency/capability change mints a
  new fingerprint, hence a new reviewable release carrying its manifest
  `version`. Publishing a newer approved release retains the previous
  known-good as `superseded`, still addressable by fingerprint
  (`dev-theme-review.test.ts`: pointer + rollback vectors).
- **Fingerprint-bound activation per version.**
  `resolveDevThemeActivation` binds fingerprint + theme id + runtime pin,
  plus an optional `expectedVersion` pin — a fingerprint for `1.0.1` never
  activates as `1.0.0` (`dev_theme_activate.version_mismatch`).
  `activateDevThemeInstall` additionally requires the ledger row's
  `artifact_version` to equal the approved manifest version when present
  (absent degrades to checksum-only, same posture as the install lane's
  artifact-column degrade).
- **Safe rollback.** `rollback({ targetFingerprint })` mints a NEW
  `published` release carrying the target's exact bytes with a `rollbackOf`
  link + `dev_theme.rolled_back` audit (version included) — never a flip.
  The target must carry an approval for its own fingerprint AND sit in an
  ever-approved live state (`approved`/`published`/`superseded`); revoked,
  removed, rejected, or never-approved targets refuse
  (`dev_theme.rollback_revoked` / `dev_theme.approval_required`), and a
  malformed fingerprint refuses before any write. Revoked-latest → prior
  approved restores with audit; revoked bytes never restore.
- **Downgrades ride rollback only.** A version lie (naming an old version
  for new bytes, or activating an older fingerprint under a newer install
  row) refuses with `version_mismatch` / `fingerprint_mismatch` — no
  silent fall.

## 7. Serve-time approval re-check (not just install time)

Install and activation verify the published approval, but bytes are served
later. The `/t/…` lane re-verifies per request (approval recompute + the
REAL activation gate + descriptor multiset binding + per-file hash), and
`buildDevThemeDocument` / `verifyDevThemeReleaseForDocument` accept an
optional live `store`: with it, a snapshot revoked after it was taken
refuses (404) instead of serving stale bytes
(`dev-theme-document.test.ts`: live-revoke vector). Integrators serving
documents should pass the live store; absent preserves snapshot-only
verification. Asset substitution post-approval (tampered bytes/map) 404s
on hash mismatch.

## 8. Dependency + asset-manifest rigor (frame30 item 9)

- **Dependency confusion.** Manifest pins AND bundle entries must be
  registry-shaped lowercase names (`bundle.dependency_name`) and exact
  version pins (`bundle.dependency_version` — ranges like `^3.0.0`, `*`,
  `latest` refuse). Pin equality stays bidirectional (extra/missing/
  mismatch refuse); the vendor stage still hashes exact bytes locally,
  never fetching.
- **Asset completeness.** Every explicit relative file ref in shipped
  JS/CSS (`./helper.js`, `../assets/poster.svg`) must resolve to a bundled
  path or the bundle refuses (`bundle.asset_missing`). Bare specifiers
  (`gsap`, `three`, `gsap/ScrollTrigger`) are registry pins, never files;
  extensionless aliases (`./commerce`) are build-time only. Oversized
  entries/totals still refuse (`bundle.entry_too_large` /
  `bundle.total_too_large`).
- **Fixture note.** `dev-theme-document.test.ts` sources reference source
  paths (`./vendor/three.js`), never hashed output names — validation runs
  on source paths; outputs are hashed.

## 9. Starter (`src/lib/dev-theme-starter-theme/`)

Runnable starter assembled ONLY through the real pipeline (manifest +
bundle + assemble + review → publish → activation + document + widgets),
pinned by `starter.test.ts` (13 vectors): three theme-owned sections
(GSAP hero, Three.js scene, video rail) + per-widget schemas, custom-layout
CSS + local stills, genuine `gsap`/`ScrollTrigger` + `three` dynamic
imports pinned to the installed versions, lazy video gate with still
fallback, versioned update + revoked-latest rollback, per-version
activation with least-privilege grants, and a hash-pinned document with no
inline code. Developer steps: `src/lib/dev-theme-starter-theme/README.md`.

## 10. Verification map & limits

What each automated layer actually proves, so no claim is read wider than
its evidence:

- **Real persistence (Postgres/GoTrue/PostgREST).** The authenticated
  editor journey (`.e2e/plugin-authenticated-journey.spec.ts`, mode B per
  `docs/15-e2e/loopback-auth-setup.md`) runs against the throwaway
  loopback stack on a real database: plugin installs, document
  save/reload, publish and the served storefront read back through real
  PostgREST (6/6 twice — CHANGELOG close-out matrix). This lane proves the
  editor/storefront rails; it does not exercise the Level B review store.
- **Fixtures (vitest).** The Level B pipeline vectors — manifest/bundle
  validation, dependency pins, asset completeness, review submit/approve,
  activation/rollback, document build, widget schemas — run on fixture
  bytes/snapshots. The durable review-store adapter is pinned against the
  `fakeDb` double (`dev-theme-review-persist.test.ts`: submit → approve →
  publish → load → activate through durable rows; DB faults fail closed;
  duplicate re-approval writes nothing), never against a live database.
  `levelb-theme-execution.spec.ts` states its own boundary: the worker
  seeds install-EQUIVALENT rows field-for-field, and the real-adapter
  install → serve round-trip is pinned by `dev-theme-asset-serve.test.ts`
  - `t.$.test.ts`.
- **Browser, sandboxed frame (Playwright).** The CI verifier set
  (`levelb-theme-execution`, `levelb-theme-switch-serve`,
  `levelb-theme-lifecycle`) loads real verified bytes over real loopback
  HTTP into the real `ThemeRuntime` frame (`allow-scripts`-only, no
  `page.route()` interception): GSAP + `THREE.WebGLRenderer` execute and
  report inside the frame, the host holds opaque isolation and zero theme
  code, and per-request approval/hash re-checks run on the fixed snapshot
  (the live-row chain is pinned by `t.$.test.ts`).
- **Hardware.** No physical GPU exists here: headless Chromium serves
  WebGL through software rasterization (SwiftShader). When available the
  spec asserts the REAL renderer path (`threeMode: "webgl"` + draw calls +
  triangles — observed `path=webgl calls=1 triangles=12`); when absent it
  asserts the genuine fallback path ran, and why. Driver-specific GL
  behavior, real-GPU compositing and on-device performance are
  hardware-dependent and not proven by any local/CI lane — only owner
  GPU/device runs can assert them.
