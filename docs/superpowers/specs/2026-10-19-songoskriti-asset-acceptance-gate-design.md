# Songoskriti asset acceptance gate — design

**Date:** 2026-10-19 · **Branch:** `frame30` · **Revision:** 2 (after spec review) · **Status:** design approved in conversation; implementation planned separately.

## 1. Problem

Songoskriti is a source-owned official theme whose imagery lives in
`public/ph/songoskriti/`. Nothing currently guarantees that inventory is
correct, so the tree drifted:

- The manifest in `scripts/songoskriti-assets-check.mjs` describes 15 files.
  The directory holds 21. The checker is **RED** today (7 findings) and is
  wired into nothing — no npm script, no release gate, no test.
- 9 files are JPEG bytes stored under `.png` names (`campaign-men`,
  `cat-kids`, `cat-men`, `edit-festive-main`, `hero-artisans`,
  `hero-festive`, `hero-weaves`, `ugc-1`, `ugc-2`). The public URLs lie about
  the format they serve.
- `prod-kurta` / `prod-kantha` are declared in the manifest and the generator,
  do not exist, and are referenced by the **applied** seed
  `supabase/migrations/20260924_songoskriti_demo.sql:64-65` — two seeded
  catalogue products whose `image_url` 404s in production today.
- 8 assets the theme actually renders (`campaign-men`, `edit-festive-main`,
  `ugc-1…6`) are absent from the manifest and the generator, so the generator
  cannot reproduce the shipped tree.
- 3 collection-editorial references point at files that do not exist
  (`songoskriti_saree.jpg`, `songoskriti_men.jpg` — both marked `// TBD`;
  `songoskriti_artisan.jpg` — unmarked) in
  `src/lib/themes/songoskriti/archetypes.ts`.
- Live, non-test source holds **24** distinct `/ph/songoskriti/…` references
  (21 real files + the 3 dangling ones) across
  `src/lib/themes/songoskriti/{homepage,archetypes,preview}.ts`,
  `src/lib/demo-catalog.ts`, `src/lib/header-copy.ts`,
  `src/components/store/{CollectionView,ProductView}.tsx`.
  `src/components/builder/songoskriti.tsx` holds none of them (it uses
  `/api/public/ph/<seed>` placeholders).
- The generator writes whatever bytes the image API returns into a `.png`
  filename, which is how the format drift started.

Nothing checks images, fonts, icons, video, generated outputs, duplicates,
oversized files, or URL correctness. The port needs asset correctness to be an
explicit acceptance gate.

## 2. Goals

1. Every asset the theme references resolves from an **approved location**
   (§5.3), and every reference the theme owns is checked.
2. `scripts/gen-songoskriti-assets.mjs` can prove it reproduces the expected
   output set without a key or a network call.
3. The gate detects missing references, duplicate assets, unnecessarily large
   files, and incorrect public URLs.
4. Visual fidelity is preserved: no asset is recompressed and no theme art is
   copied into official package artifacts or into shared core directories.
5. The gate is explicit: it runs in `gates:release`, it runs in CI through the
   unit suite, and the port's acceptance list names it.

## 3. Non-goals

- Re-encoding or re-compressing any existing asset (bytes stay identical).
- Generating new artwork (needs `GEMINI_API_KEY`; blocked by policy).
- Changing the preview/storefront rendering of any asset.
- Packaging official themes as ZIPs (forbidden by `docs/packages/contract.md`
  §"Official themes are not ZIP packages").
- Detecting *slot-level* reuse of one file in several editorial slots — see
  §6 (limit of the duplicate rule).

## 4. Decisions taken in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| JPEG-in-`.png` files | Rename to `.jpg`, update every reference | Byte-identical pixels, no size growth, URLs become honest |
| Missing editorial art | Reuse existing theme art | women → `edit-festive-main.jpg`, men → `campaign-men.jpg`, heritage → `hero-artisans.jpg`; no broken refs, no new generation |
| "Unnecessarily large" policy | Budgets only, pixels untouched | ≤ 3 MB/file, ≤ 28 MB total, PNG ≤ 2.0 B/px, JPEG ≤ 1.0 B/px; current worst cases 2.53 MB / 25.35 MB / 1.88 B/px / 0.90 B/px all pass |
| Gate architecture | Shared manifest + CLI + generator `--check` + vitest + release wiring | Deterministic, keyless, structurally immune to generator/checker drift |
| Port boundary | **Escalation approved by the owner**: rename + core reference edits + existing-test value changes + reviewed snapshot refresh + one new migration, all recorded in the port spec | The rename cannot be done without crossing the port spec's "no core files" rule (§7); the owner approved the escalation with the exact diff list in §9.3 |
| Slot reuse created by the editorial fix | Accepted and documented | `hero-artisans.jpg` and `hero-festive.jpg` each appear in more than one slot. The duplicate rule is byte-level (§6) and cannot see this; it is recorded here rather than hidden |

## 5. Architecture

### 5.1 One shared manifest (the generator's plan)

New module `scripts/songoskriti-assets-manifest.mjs` is the source of truth
for **what the generator produces**. It exports:

```js
export const ASSET_DIR = "public/ph/songoskriti";
export const ASSETS = [
  {
    name: "hero-festive.jpg",
    format: "jpeg",          // png | jpeg | svg  (authoritative)
    minWidth: 1024,           // authoritative — the per-class table below is
    minHeight: 768,           // informational only
    generated: true,
    aspect: "16:9",           // generation hint, not a check constraint
    prompt: "…",              // generation prompt
  },
  …
];
```

Both `scripts/songoskriti-assets-check.mjs` and
`scripts/gen-songoskriti-assets.mjs` import it, so the checker and the
generator can never describe different file sets.

Informational class floors (each file's own `minWidth`/`minHeight` is
authoritative; every shipped file satisfies its floor):

| Class | Floor | Members |
|---|---|---|
| hero | 1024 × 768 | `hero-festive.jpg`, `hero-artisans.jpg`, `hero-weaves.jpg` |
| category | 1024 × 1024 | `cat-women.png`, `cat-men.jpg`, `cat-kids.jpg`, `cat-living.png`, `cat-jewelry.png`, `cat-newin.png` |
| product | 900 × 1200 | `prod-saree.png`, `prod-panjabi.png`, `prod-necklace.png` |
| editorial | 896 × 1200 | `campaign-men.jpg`, `edit-festive-main.jpg` |
| ugc | 896 × 1200 | `ugc-1.jpg`, `ugc-2.jpg`, `ugc-3.png`, `ugc-4.png`, `ugc-5.jpg`, `ugc-6.jpg` |
| brand | — (valid SVG) | `logo-lockup.svg` |

`hero-weaves` is square (1024 × 1024) in the shipped tree; the floor accepts
it and no asset is re-cut.

### 5.2 One frozen expectation (the anchor)

New file `scripts/songoskriti-assets-expected.json` pins the **approved
artifacts**:

```json
{
  "assets": [
    { "name": "hero-festive.jpg", "format": "jpeg", "width": 1376, "height": 768, "sha256": "…" },
    …
  ]
}
```

It exists because "the manifest equals itself" proves nothing: an operator
could delete a file *and* its manifest entry and the gate would go green.
The expectation is the third leg of the triangle — **manifest (plan) ==
expectation (approved artifacts) == tree (reality)** — and it is changed only
through a reviewed diff. Digests are the sha256 of the shipped bytes; a
re-generated asset therefore requires an explicit, reviewed expectation
update, which is exactly the "reproduces the expected outputs" contract.

### 5.3 Approved locations

| Location | Approved for |
|---|---|
| `/ph/songoskriti/<file>` | theme-owned art (source form — `src/lib/theme-asset-url.ts`) |
| `/api/public/ph/<seed>` | deterministic local SVG placeholder endpoint (`src/routes/api/public/ph.$.ts`) — not a file; used by `src/components/builder/songoskriti.tsx` |
| `/api/public/font/<uuid>/<family>/<weight>.woff2` | merchant-uploaded face (`src/lib/theme-fonts.ts`) — only when the font row exists |
| `https://fonts.googleapis.com`, `https://fonts.gstatic.com` | webfont provider (`FONT_ORIGINS`) |
| inline React icon components | `@/components/icons/tabler` (generated module) |
| *nothing else* | any other asset URL is a finding |

### 5.4 The gate

`node scripts/songoskriti-assets-check.mjs [--json] [--root <repoRoot>]`

Exit codes: `0` green · `1` findings · `2` harness error (a harness error is
never a pass).

The checks are one exported pure function, so tests drive them with
fixtures instead of a temp cwd:

```js
export function checkSongoskritiAssets(world): Finding[]
// world = { assetDir, publicDir, scanRoots, manifest, expectation }
```

The CLI only supplies the default `world` (repo root layout) and prints
findings. `Finding = { code, path, message }`.

**Runner split** (node cannot import this repo's TypeScript: `theme-fonts.ts`
imports extensionless `./builder-ast`, `tabler.tsx` is TSX, and
`themes.server.ts` pulls `@supabase/supabase-js` plus `@/` aliases):

| Runner | Checks |
|---|---|
| CLI (`node scripts/*.mjs`, no deps, no TS import) | `asset.*`, `ref.*`, `url.*`, `video.*` |
| vitest (`src/**/*.test.ts`, TS + aliases) | `font.*`, `icon.*`, `pkg.*` |

**Scan roots** (live code that may reference theme art):

- `src/lib/themes/songoskriti/**`
- `src/components/builder/songoskriti.tsx`, `src/components/builder/songoskriti-motion.ts`
- `src/lib/demo-catalog.ts`, `src/lib/header-copy.ts`
- `src/components/store/**`
- `src/routes/**`
- `supabase/migrations/**` — see the migration rule below

**Exclusions** (with reasons):

- `**/*.test.ts`, `**/*.test.tsx`, `**/__snapshots__/**` — test fixtures and
  helper examples (e.g. `src/lib/theme-asset-url.test.ts` uses
  `hero-festive.png` as a sample argument), not live references. The rename
  updates them, and the new suite asserts they were updated.
- `docs/**` — frozen evidence is a historical record, not a live reference.
- `.artifacts/**`, `.output-snapshots/**`, `dist/**`, `.output/**`,
  `node_modules/**`, `.git/**` — build output.

**Migration rule.** Migration files are immutable history, and the applied
seed permanently contains the old `.png` names. The gate therefore scans
**only the newest migration file (highest timestamp prefix) that mentions
`/ph/songoskriti/`** — the file that supersedes the others. After this
work that is the new asset-path migration, whose references are all current.
Earlier migrations are never liveness-scanned.

**Codes**

*Inventory / files* — CLI

| Code | Condition |
|---|---|
| `asset.missing` | manifest entry has no file on disk |
| `asset.unexpected` | a file in `public/ph/songoskriti/` is not in the manifest (orphan / stale copy) |
| `asset.format_mismatch` | the file's bytes disagree with the manifest's declared `format` |
| `asset.extension_mismatch` | the file's bytes disagree with its extension (e.g. JPEG bytes in a `.png` file) |
| `asset.undersized` | below the entry's `minWidth`/`minHeight` |
| `asset.oversized` | above 3 MB |
| `asset.density` | above 2.0 B/px (PNG) / 1.0 B/px (JPEG) |
| `asset.total_size` | theme directory above 28 MB |
| `asset.duplicate` | identical sha256 twice in the directory, or a theme raster's sha256 found anywhere else under `public/` (a copy smuggled into a shared core directory) |
| `asset.unreferenced` | a manifest file that no live reference and no newest-migration reference points at |
| `asset.invalid_svg` | the brand SVG is not a parseable `<svg>` document |
| `asset.expectation_drift` | manifest ↔ expectation ↔ tree disagree (name set, format, or digest) |

*References and URLs* — CLI

| Code | Condition |
|---|---|
| `ref.unknown` | a `/ph/songoskriti/<file>` reference names a file that is neither in the manifest nor on disk (the message states which) |
| `url.wrong_form` | a theme-art reference outside the approved set (§5.3): package form (`assets/…`), a file-shaped ref into the placeholder lane (`/api/public/ph/songoskriti/…`), an external absolute URL, or a protocol-relative URL |
| `url.cross_theme` | a `/ph/<other-theme>/…` reference inside songoskriti-owned code |

*Video* — CLI

| Code | Condition |
|---|---|
| `video.missing` | a `.mp4/.webm/.mov/.m4v` reference that does not resolve under `/ph/songoskriti/` (none today; the rule stays) |
| `video.format_mismatch` | a video file whose bytes contradict its extension |

*Fonts* — vitest

| Code | Condition |
|---|---|
| `font.unknown_family` | a family named in the theme's emitted stack is neither in the closed catalogue (`FONT_FAMILIES`) nor a declared local fallback |
| `font.bad_origin` | a font stylesheet URL points outside `FONT_ORIGINS` |
| `font.bengali_not_loaded` | the document-level `FONT_PRELOAD` does not load `Noto Sans Bengali` with `subset=latin,bengali` |
| `font.theme_stack_not_bengali` | the songoskriti pairing's emitted stack names no Bengali-capable family (the invariant established by `26f3447f`) |

*Icons* — vitest

| Code | Condition |
|---|---|
| `icon.unknown` | an icon imported from `@/components/icons/tabler` by songoskriti code has no matching export in the generated module (the `Menu as MenuIcon` alias form is handled) |
| `icon.url_ref` | an icon is referenced as a URL/file instead of inlined |

*Packaging boundary* — vitest

| Code | Condition |
|---|---|
| `pkg.asset_manifest` | the official songoskriti package carries an `assetManifest` or an embedded asset payload — official themes are source-rendered, never packaged |
| `pkg.package_ref` | a package-form `assets/…` reference inside official templates (`findPackageRefs` is reused, not re-implemented) |
| `pkg.asset_copy` | a theme raster checksum outside `public/ph/songoskriti/` |
| `pkg.official_zip` | a songoskriti package/zip artifact exists in the repo or build output |

### 5.5 Generator reproducibility

`node scripts/gen-songoskriti-assets.mjs --check`

- Requires **no** `GEMINI_API_KEY` and makes **no** network call. The key
  check moves from module scope into the generation path, so the module can
  be imported by tests and by `--check`.
- Prints a deterministic plan (name, aspect, format) — byte-identical across
  runs.
- The plan must equal the expectation file and the tree (same file set, same
  formats, same digests). The three-way agreement is the real check; the
  manifest alone is not compared with itself.
- Every planned file must exist with matching format and dimensions.
- Exits `1` listing the offending entries when plan, expectation and tree
  disagree.

Two exported pure functions make the write path testable offline:

- `assertFormatMatches(name, bytes)` — throws when the bytes' format
  disagrees with the target name's extension (JPEG bytes for a `.png` name
  are refused instead of being written silently).
- `writeAssetBytes(name, bytes)` — the only writer; calls the assertion.

The generator's "already present" test becomes format-aware (`imageInfo`
returns `{format, width, height}` for PNG/JPEG/SVG), so the nine renamed
`.jpg` files are skipped rather than regenerated and overwritten. Regeneration
still needs `GEMINI_API_KEY`, still retries ×2, still skips on failure.

### 5.6 Wiring

- `package.json`: `assets:songoskriti` → `node scripts/songoskriti-assets-check.mjs`;
  `assets:songoskriti:gen` → `node scripts/gen-songoskriti-assets.mjs --check`.
  `assets:songoskriti` is inserted into `gates:release` before the browser
  gates (fast, no server, no network). The port spec §7 allows wiring-only
  `package.json` edits for gate-chain entries.
- New test file `src/lib/themes/songoskriti-assets.test.ts` (a **new** file,
  permitted by the port spec) holds the acceptance case: *"songoskriti asset
  correctness is green"*, invoking the shared checker function — not a
  re-implementation — so CI's `unit-contract` job (`bun run test`) enforces
  the gate. `gates:release` itself is owner-run pre-release, not CI.
- Docs: `docs/themes/creation.md` §14.3 gains the approved locations, the
  format rules and the gate command; the port spec's acceptance list gains
  the asset gate and the recorded escalation; the misleading comment in
  `src/lib/package-zip.ts:31` ("official Songoskriti ships ~25MB of
  imagery") is corrected — official themes are never packaged as archives.

## 6. Limits of the rules (stated, not hidden)

- `asset.duplicate` is **byte-level**: it finds identical files, not the same
  image re-encoded at a different quality or reused in several slots. Today
  the tree has 21 unique digests in the theme directory and 0 matches
  elsewhere under `public/`.
- The editorial fix intentionally reuses existing art in more than one slot
  (§4); this is a design decision, not a detected duplicate.

## 7. Data flow

```
src/**  ──scan──►  references ──►  manifest ──►  public/ph/songoskriti/*
   │                     │              │                    │
   │                     │              │                    ▼
   │                     │              │            bytes / geometry / size
   │                     │              │                    │
   │                     ▼              ▼                    ▼
   │              URL-form rules   sha256 duplicates   expectation digest
   ▼
findings (code + path + message)  ──►  exit 0 | 1 | 2
```

## 8. Error handling

- A malformed manifest or expectation entry (unknown format, bad name) is a
  harness error (exit 2), never a silent pass.
- Unreadable files are reported per file; one bad file never hides the rest.
- The gate never mutates the tree. Remediation is a separate, reviewed
  change set.
- `--json` emits machine-readable findings; the default output is
  human-readable.

## 9. Rollout

### 9.1 Order

1. **Escalation record** — the port spec (§10) and the SDD ledger record the
   approved escalation and the exact file list in §9.3.
2. **Shared manifest + expectation** — `scripts/songoskriti-assets-manifest.mjs`,
   `scripts/songoskriti-assets-expected.json` (digests of the shipped bytes).
3. **Rename** — `git mv` the nine `.png` files to `.jpg` (bytes unchanged),
   then update every reference: live code (§9.3), existing tests, the frozen
   snapshot (reviewed diff), and the seed migration (**new** file).
4. **TBD editorial fix** — the three dangling editorial references in
   `src/lib/themes/songoskriti/archetypes.ts` (theme-owned, editable).
5. **Gate** — the checker rewritten on the shared manifest: inventory,
   formats, dimensions, budgets, duplicates, refs, URL forms, video.
6. **Generator** — keyless `--check`, format-aware skip, exported
   `assertFormatMatches` / `writeAssetBytes`.
7. **Fonts / icons / packaging checks** — in the vitest suite.
8. **Test suite** — green path + negative fixtures.
9. **Wiring + docs** — `package.json`, new acceptance test file,
   `docs/themes/creation.md`, port spec.

### 9.2 Seed migration (new file, never an edit)

`supabase/migrations/<timestamp>_songoskriti_asset_paths.sql`:

- re-points the seeded `image_url` values of the five renamed files
  (`cat-kids`, `cat-men`, `hero-festive`, `hero-weaves`, `hero-artisans`) to
  their new `.jpg` paths;
- re-points the two dead products — `Comilla Handspun Khadi Kurta`
  (`prod-kurta`) and `Jessore Nakshi Kantha Quilt` (`prod-kantha`) — to
  existing art (`prod-panjabi.png`, `cat-living.png`);
- the applied migration `20260924_songoskriti_demo.sql` is **not** touched
  (the drift gate in `scripts/db-migrate.mjs` forbids editing applied
  migrations).

### 9.3 Escalated file list (owner-approved)

Port spec §7 prohibits editing existing tests, frozen snapshots and
everything else under `src/`. The owner approved the escalation for the
rename. Exact surface, all changes are **URL values only** — no assertion
loses strength, no test is deleted or skipped:

*Core source (URL values only)*

- `src/lib/demo-catalog.ts` (7 refs)
- `src/lib/header-copy.ts` (4 refs)
- `src/components/store/CollectionView.tsx` (2 refs)
- `src/components/store/ProductView.tsx` (1 ref)

*Existing tests (expected values only)*

- `src/lib/phase3-section.test.ts` (4 refs)
- `src/lib/theme-asset-url.test.ts` (12 refs — sample arguments)
- `src/components/store/CollectionView.test.tsx` (1 ref)
- `src/components/store/ProductView.test.tsx` (3 refs)
- `src/components/builder/songoskriti.test.tsx` (1 ref)
- `src/components/builder/songoskriti-debrand.test.tsx` (1 ref)
- `src/components/builder/songoskriti-snapshots.test.tsx` (4 refs)

*Frozen snapshot*

- `src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap`
  (4 refs) — regenerated with a **reviewed diff**, named in the commit
  message, never a blind `-u` (port spec §9).

*New migration*

- `supabase/migrations/<timestamp>_songoskriti_asset_paths.sql` (§9.2)

*Theme-owned (editable without escalation)*

- `src/lib/themes/songoskriti/{homepage,archetypes,preview}.ts`

*Asset tree*

- `public/ph/songoskriti/*` — nine `git mv` renames, bytes unchanged.

The commit message records the old→new URL mapping so the change is
auditable.

## 10. Testing

New suite `src/lib/themes/songoskriti-assets.test.ts` (new file → allowed by
the port spec):

**Green path**

- the repo passes the CLI gate with zero findings;
- the expectation file matches the tree's digests;
- every manifest file is referenced by live code or the newest songoskriti
  migration, and every live reference resolves.

**Negative fixtures** (temporary directories, never the repo; driven through
the exported pure function with a synthetic `world`):

- missing file → `asset.missing`
- orphan file → `asset.unexpected`
- JPEG bytes in a `.png` name → `asset.format_mismatch` / `asset.extension_mismatch`
- undersized file → `asset.undersized`
- oversized file → `asset.oversized`
- over-density file → `asset.density`
- two identical files → `asset.duplicate`
- a theme raster copied into another `public/` directory → `asset.duplicate`
- a reference to a non-existent file → `ref.unknown`
- a package-form / wrong-lane / external URL → `url.wrong_form`
- a cross-theme `/ph/<other>/…` reference → `url.cross_theme`
- manifest ↔ expectation ↔ tree drift → `asset.expectation_drift`
- a manifest file nothing references → `asset.unreferenced`

**Generator**

- `--check` exits 0 with no key in the environment;
- the plan is identical across two runs;
- a temp directory with a missing or extra file is reported;
- `assertFormatMatches` throws for a JPEG buffer with a `.png` name and
  accepts a PNG buffer (pure, no network);
- the "already present" check skips an existing `.jpg` file (regression guard
  for the renamed assets).

**Fonts / icons / packaging** (vitest, TS)

- the songoskriti pairing resolves to catalogue families;
- the theme stylesheet URL uses only approved origins;
- `FONT_PRELOAD` loads `Noto Sans Bengali` with `subset=latin,bengali`;
- the songoskriti emitted stack names a Bengali-capable family;
- every tabler import used by songoskriti code exists as an export;
- the official package carries no `assetManifest` and no package-form refs
  (`findPackageRefs` reused).

## 11. Verification

- `node scripts/songoskriti-assets-check.mjs` → green, exit 0.
- `node scripts/gen-songoskriti-assets.mjs --check` → green, exit 0, no key.
- Targeted vitest for the new suite and every suite touching renamed assets.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bunx prettier --check .`
  (the new `.mjs` files are linted by `eslint.config.js`, which applies
  `eslint-plugin-prettier` to `**/*.mjs`).
- Preview smoke: the renamed assets and the repaired editorial images return
  200 from `/ph/songoskriti/…`; the rendered pages are unchanged apart from
  the corrected URLs.
