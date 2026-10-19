# Songoskriti asset acceptance gate — design

**Date:** 2026-10-19 · **Branch:** `frame30` · **Revision:** 3 (after two spec reviews) · **Status:** design approved in conversation; implementation planned separately.

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
- Packaging official themes as archives (forbidden by
  `docs/packages/contract.md` §"Official themes are not ZIP packages").
- Statically verifying the **database** — the seeded catalogue is verified by
  migration + operator evidence (§9.2, §11), not by the file gate.
- Detecting *slot-level* reuse of one file in several editorial slots — see
  §6 (limit of the duplicate rule).

## 4. Decisions taken in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| JPEG-in-`.png` files | Rename to `.jpg`, update every reference | Byte-identical pixels, no size growth, URLs become honest |
| Missing editorial art | Reuse existing theme art | women → `edit-festive-main.jpg`, men → `campaign-men.jpg`, heritage → `hero-artisans.jpg`; no broken refs, no new generation |
| "Unnecessarily large" policy | Budgets only, pixels untouched | ≤ 3,000,000 B/file, ≤ 28,000,000 B total, PNG ≤ 2.0 B/px, JPEG ≤ 1.0 B/px; current worst cases 2,531,520 B / 25,345,762 B / 1.88 B/px / 0.90 B/px all pass |
| Gate architecture | Shared manifest + CLI + generator `--check` + vitest + release wiring | Deterministic, keyless, structurally immune to generator/checker drift |
| Port boundary | **Escalation approved by the owner**: rename + core reference edits + existing-test value changes + reviewed snapshot refresh + one new migration, all recorded in §9.3 | The rename cannot be done without crossing the port spec's "no core files" rule (§7); the owner approved the escalation with the exact diff list in §9.3 |
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
    minWidth: 1024,           // floor — authoritative for `asset.undersized`
    minHeight: 768,
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

Informational class floors (each entry's own `minWidth`/`minHeight` is
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
expectation (approved artifacts) == tree (reality)** — and it changes only
through a reviewed diff. `width`/`height` are the **actual geometry** and are
compared with the tree; the manifest's `minWidth`/`minHeight` are floors
only. Digests are the sha256 of the shipped bytes.

The digest comparison is a **drift** check, not a reproducibility proof:
image generation is non-deterministic, so no digest-level reproduction is
achievable. What the gate proves is that the tree still contains the
approved artifacts, and that the generator's plan still names exactly the
approved set.

**Adding a new asset touches three places** (all three are required; the
gate reports which is missing):

1. `scripts/songoskriti-assets-manifest.mjs` — the entry (name, format,
   floors, prompt);
2. `scripts/songoskriti-assets-expected.json` — the approved record;
3. a live reference (theme code or the seeded catalogue) — otherwise
   `asset.unreferenced` fires.

**Re-blessing changed bytes** is a command, not a hand edit:
`node scripts/songoskriti-assets-check.mjs --bless-expectation` rewrites the
expectation file from the tree, and the result must land as a reviewed diff.

### 5.3 Approved locations

| Location | Approved for |
|---|---|
| `/ph/songoskriti/<file>` | theme-owned art (source form — `src/lib/theme-asset-url.ts`) |
| `/api/public/ph/<seed>` and `/api/public/ph/<dept>/<seed>` | deterministic local SVG placeholder endpoint (`src/routes/api/public/ph.$.ts` — the splat route accepts any number of segments; the last segment seeds the art, a first segment tints it by department). Not a file; used by `src/components/builder/songoskriti.tsx` and `src/lib/demo-catalog.ts` |
| `/api/public/font/<uuid>/<family>/<weight>.woff2` | merchant-uploaded face (`src/lib/theme-fonts.ts`) — only when the font row exists |
| `https://fonts.googleapis.com`, `https://fonts.gstatic.com` | webfont provider (`FONT_ORIGINS`) |
| inline React icon components | `@/components/icons/tabler` (generated module) |
| *nothing else* | any other asset URL is a finding |

The placeholder lane is exempt from `url.wrong_form` for **any** segment
count. A finding in that lane is only raised when a placeholder path is
*file-shaped for a theme asset* — i.e. `/api/public/ph/songoskriti/…`,
which claims a file the placeholder endpoint does not own.

### 5.4 The gate

`node scripts/songoskriti-assets-check.mjs [--json] [--bless-expectation]`

Exit codes: `0` green · `1` findings · `2` harness error (a harness error is
never a pass).

The checks are one exported pure function, so tests drive them with
fixtures instead of a temp cwd:

```js
export function checkSongoskritiAssets(world): Finding[]
export function defaultWorld(): World          // derived from import.meta.dirname

// world = { repoRoot, assetDir, publicDir, scanRoots, migrationsRoot, buildRoots, manifest, expectation }
```

`defaultWorld()` is derived from `import.meta.dirname` — never
`process.cwd()` — and is consumed by **both** the CLI and the vitest suite,
so the green path and the CLI exercise the same code and the same layout.
The TS test imports the `.mjs` module; `tsconfig.json` sets
`allowJs: true`, so that import resolves.

`Finding = { code, path, message }`.

**Runner split** (node cannot import this repo's TypeScript: `theme-fonts.ts`
imports extensionless `./builder-ast`, `tabler.tsx` is TSX, and
`themes.server.ts` pulls `@supabase/supabase-js` plus `@/` aliases):

| Runner | Checks |
|---|---|
| CLI (`node scripts/*.mjs`, no deps, no TS import) | `asset.*`, `ref.*`, `url.*`, `video.*`, `note.*` |
| vitest (`src/**/*.test.ts`, TS + aliases) | `font.*`, `icon.*`, `pkg.*` |

**Scan roots and their rule profiles.** Roots differ because some files are
multi-theme: `src/lib/demo-catalog.ts` legitimately references
`/ph/somvabona/…` (10 live refs) and 16 two-segment placeholder URLs.

| Root | Kind | Rules applied |
|---|---|---|
| `src/lib/themes/songoskriti/**` | owned | full set: `ref.unknown`, `url.wrong_form`, `url.cross_theme`, `video.*` |
| `src/components/builder/songoskriti.tsx`, `src/components/builder/songoskriti-motion.ts` | owned | full set |
| `src/lib/demo-catalog.ts`, `src/lib/header-copy.ts`, `src/components/store/**`, `src/routes/**` | shared | **scoped to the `/ph/songoskriti/…` namespace only**: `ref.unknown` for `/ph/songoskriti/…` refs; `url.wrong_form` and `url.cross_theme` do **not** apply (other themes' refs and the placeholder lane are legitimate here) |
| `supabase/migrations/**` | advisory | `note.migration_ref` only — never fails the gate, never feeds `asset.unreferenced` |

**Exclusions** (with reasons):

- `**/*.test.ts`, `**/*.test.tsx`, `**/__snapshots__/**` — test fixtures and
  helper examples (e.g. `src/lib/theme-asset-url.test.ts` uses
  `hero-festive.png` as a sample argument), not live references. The rename
  updates them, and §10 asserts they were updated.
- `docs/superpowers/songoskriti-evidence/**` — frozen evidence is a
  historical record, not a live reference. (Other docs are **live** and are
  updated: `docs/themes/creation.md` §14.3 and
  `docs/themes/songoskriti-port-map.md`.)
- `.artifacts/**`, `.output-snapshots/**`, `dist/**`, `.output/**`,
  `node_modules/**`, `.git/**` — build output.

**Migration rule.** Migration files are immutable history: the applied seed
permanently contains the retired `.png` names, and a re-run of that seed
re-applies them (§9.2). The gate therefore treats migrations as **advisory**:
it reads the newest asset-path migration (the file carrying the sentinel
`-- songoskriti-asset-paths: current`, chosen by lexicographically greatest
filename — the ordering `scripts/db-migrate.mjs` uses) and reports any
`/ph/songoskriti/…` reference in it as `note.migration_ref`. Advisory notes
never fail the gate and never feed `asset.unreferenced`; the live-code scan
already covers all 21 shipped assets. The new migration is written so that
it contains **no retired asset path** (updates are keyed by row id, never by
old URL), and its filename sorts strictly after
`20260924_songoskriti_demo.sql`.

**Set-equality directions** (each code owns exactly one direction):

| Direction | Code |
|---|---|
| disk ⊆ manifest | `asset.unexpected` |
| refs ⊆ manifest | `ref.unknown` |
| manifest ⊆ refs (live code) | `asset.unreferenced` |

**Codes**

*Inventory / files* — CLI

| Code | Condition |
|---|---|
| `asset.missing` | manifest entry has no file on disk |
| `asset.unexpected` | a file in `public/ph/songoskriti/` is not in the manifest (orphan / stale copy) |
| `asset.format_mismatch` | the file's bytes disagree with the manifest's declared `format` |
| `asset.extension_mismatch` | the file's **name extension** disagrees with the manifest's declared `format` (distinct from the byte check) |
| `asset.undersized` | below the entry's `minWidth`/`minHeight` |
| `asset.oversized` | above 3,000,000 B |
| `asset.density` | above 2.0 B/px (PNG) / 1.0 B/px (JPEG) |
| `asset.total_size` | theme directory above 28,000,000 B |
| `asset.duplicate` | identical sha256 twice in the directory, or a theme raster's sha256 found anywhere else under `public/` (a copy smuggled into a shared core directory) |
| `asset.unreferenced` | a manifest file that no live reference points at |
| `asset.invalid_svg` | the brand SVG is not a parseable `<svg>` document |
| `asset.expectation_drift` | manifest ↔ expectation ↔ tree disagree (name set, format, geometry or digest) |

*References and URLs* — CLI

| Code | Condition |
|---|---|
| `ref.unknown` | a reference names a file that is **not in the manifest** (the message states whether it is also absent from disk) |
| `url.wrong_form` | a theme-art reference outside the approved set (§5.3): package form (`assets/…`), an external absolute or protocol-relative URL, or a file-shaped placeholder ref (`/api/public/ph/songoskriti/…`) |
| `url.cross_theme` | a `/ph/<other-theme>/…` reference inside **owned** roots |

*Video* — CLI

| Code | Condition |
|---|---|
| `video.missing` | a `.mp4/.webm/.mov/.m4v` reference that does not resolve under `/ph/songoskriti/` (none today; the rule stays) |
| `video.format_mismatch` | a video file whose bytes contradict its extension |

*Advisory* — CLI (never fails the gate)

| Code | Condition |
|---|---|
| `note.migration_ref` | a `/ph/songoskriti/…` reference inside the newest asset-path migration |
| `note.computed_ref` | a reference built by a template literal or concatenation (not statically checkable — see §6); the count is reported in the summary so coverage loss is visible |

*Fonts* — vitest

| Code | Condition |
|---|---|
| `font.unknown_family` | a family named in the theme's emitted stack is neither in the closed catalogue (`FONT_FAMILIES`) nor a declared local fallback |
| `font.bad_origin` | a font stylesheet URL points outside `FONT_ORIGINS` |
| `font.bengali_not_loaded` | the document-level `FONT_PRELOAD` (`src/lib/web-vitals.ts`) does not load `Noto Sans Bengali` with `subset=latin,bengali` |
| `font.theme_stack_not_bengali` | the songoskriti pairing's emitted stack names no Bengali-capable family |

These **restate** locks that already exist in `src/lib/phase3-fonts.test.ts`
(the `applyFontPairing` invariant added by `26f3447f`, and the
`FONT_PRELOAD` assertion). The new suite adds the *songoskriti-scoped*
assertion and cites the existing lock rather than replacing it.

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
| `pkg.official_zip` | a songoskriti package/zip artifact exists under `repoRoot` or `buildRoots` (both are in the world shape; `.output/**` is excluded from *reference scanning* but is scanned for artifacts) |

### 5.5 Generator reproducibility

`node scripts/gen-songoskriti-assets.mjs --check`

- Requires **no** `GEMINI_API_KEY` and makes **no** network call. The key
  check moves from module scope into the generation path, so the module can
  be imported by tests and by `--check`.
- Prints a deterministic plan (name, aspect, format) — byte-identical across
  runs.
- The three comparisons are explicit:
  1. `plan.names + plan.formats` == `manifest.names + manifest.formats`;
  2. `manifest.names + manifest.formats` == `expectation.names + expectation.formats`;
  3. `expectation` (geometry + digest) == the tree.
  The digest leg is a drift check (§5.2), not a reproduction proof.
- Exits `1` listing the offending entries when the three legs disagree.

Two exported pure functions make the write path testable offline:

- `assertFormatMatches(name, bytes)` — throws when the bytes' format
  disagrees with the target name's extension (JPEG bytes for a `.png` name
  are refused instead of being written silently).
- `writeAssetBytes(name, bytes)` — the only writer; calls the assertion.

The generator's "already present" test becomes format-aware (`imageInfo`
returns `{format, width, height}` for PNG/JPEG/SVG), so the nine renamed
`.jpg` files are skipped rather than regenerated and overwritten.
Regeneration still needs `GEMINI_API_KEY`, still retries ×2, still skips on
failure.

### 5.6 Wiring

- `package.json`: `assets:songoskriti` → `node scripts/songoskriti-assets-check.mjs`;
  `assets:songoskriti:gen` → `node scripts/gen-songoskriti-assets.mjs --check`.
  `assets:songoskriti` is inserted into `gates:release` before the browser
  gates (fast, no server, no network). This is a gate-chain entry, the shape
  the port spec §7 allows for `package.json`.
- New test file `src/lib/themes/songoskriti-assets.test.ts` (a **new** file,
  permitted by the port spec) holds the acceptance case: *"songoskriti asset
  correctness is green"*, calling `checkSongoskritiAssets(defaultWorld())` —
  the shared function, not a re-implementation — so CI's `unit-contract` job
  (`bun run test`, `.circleci/config.yml`) enforces the gate. `gates:release`
  itself is owner-run pre-release, not CI.
- Docs: `docs/themes/creation.md` §14.3 gains the approved locations, the
  format rules, the gate command and the seed-repair runbook;
  `docs/themes/songoskriti-port-map.md` gains the updated asset-path row;
  the port spec's acceptance list gains the asset gate and the recorded
  escalation; the misleading comment in `src/lib/package-zip.ts:31`
  ("official Songoskriti ships ~25MB of imagery") is corrected — official
  themes are never packaged as archives.
  **Wording constraint:** `scripts/doc-gate.mjs` flags a line that contains
  "official" or "Songoskriti" together with the token "ZIP"
  (`/\bofficial\b[^\n.]*\b(downloadable|ZIP)\b/i`). New prose therefore says
  "archives", never "ZIP", on such lines, and backticks only real paths
  (the doc-gate checks that every backticked path exists).

## 6. Limits of the rules (stated, not hidden)

- `asset.duplicate` is **byte-level**: it finds identical files, not the same
  image re-encoded at a different quality or reused in several slots. Today
  the tree has 21 unique digests in the theme directory and 0 matches
  elsewhere under `public/`.
- The editorial fix intentionally reuses existing art in more than one slot
  (§4); this is a design decision, not a detected duplicate.
- **Only static string literals are scanned.** References built by template
  literals or concatenation (e.g. `` `/api/public/ph/${placeholderSeed("craft")}` ``
  in `src/components/builder/songoskriti.tsx`) cannot be resolved
  statically; they are skipped and counted as `note.computed_ref`, so the
  coverage loss is visible in the summary.
- The gate is a **file** gate: it cannot see the database. The seeded
  catalogue is verified by the migration + operator evidence in §9.2/§11.

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
- The gate never mutates the tree, except in the explicit
  `--bless-expectation` mode, which rewrites the expectation file and
  prints the paths it touched.
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
   snapshot (reviewed diff), the tracked scratch HTML files (§9.3) and the
   seeded catalogue (new migration, §9.2).
4. **TBD editorial fix** — the three dangling editorial references in
   `src/lib/themes/songoskriti/archetypes.ts` (theme-owned, editable).
5. **Gate** — the checker rewritten on the shared manifest: inventory,
   formats, dimensions, budgets, duplicates, refs, URL forms, video.
6. **Generator** — keyless `--check`, format-aware skip, exported
   `assertFormatMatches` / `writeAssetBytes`.
7. **Fonts / icons / packaging checks** — in the vitest suite.
8. **Test suite** — green path + negative fixtures.
9. **Wiring + docs** — `package.json`, new acceptance test file,
   `docs/themes/creation.md`, `docs/themes/songoskriti-port-map.md`, port spec.

### 9.2 Seeded catalogue (new migration, never an edit)

`supabase/migrations/20261019000000_songoskriti_asset_paths.sql` (14-digit
prefix, so it sorts after the applied seed):

- carries the sentinel `-- songoskriti-asset-paths: current`;
- creates an idempotent function
  `public.theme_apply_songoskriti_asset_paths()` that sets `image_url` **by
  row id** for the 13 seeded products and 5 seeded collections — 6 rows get
  their renamed `.jpg` path (`cat-kids` ×2, `cat-men`, `hero-festive`,
  `hero-weaves`, `hero-artisans`), and 2 dead rows are re-pointed to
  existing art (`prod-kurta` → `prod-panjabi.png`, `prod-kantha` →
  `cat-living.png`);
- calls the function once in the migration body;
- contains **no retired asset path** (updates are keyed by row id, never by
  old URL).

**Re-seed hazard (must be handled, not assumed away).** The applied seed
`20260924_songoskriti_demo.sql` is idempotent with
`on conflict (id) do update set … image_url = excluded.image_url`
(lines 75-78, 115-117) and its header says it is "safe to re-run". A
`theme_purge_demo` + re-seed cycle therefore restores the retired `.png`
paths — and the migration itself is never re-run, because `db-migrate`
records it as applied. The runbook, published in
`docs/themes/creation.md` §14.3, is therefore: **after any demo purge or
re-seed, re-apply the paths with
`select public.theme_apply_songoskriti_asset_paths();`** — the function
exists precisely so this is one command, not a hand-written UPDATE.

The applied migration `20260924_songoskriti_demo.sql` is **not** touched
(the drift gate in `scripts/db-migrate.mjs` forbids editing applied
migrations).

### 9.3 Escalated file list (owner-approved)

Port spec §7 prohibits editing existing tests, frozen snapshots and
everything else under `src/`. The owner approved the escalation for the
rename. Counts are "occurrences (distinct assets)". All changes are **URL
values only** — no assertion loses strength, no test is deleted or skipped:

*Core source (URL values only)*

- `src/lib/demo-catalog.ts` — 15 occurrences (7 distinct assets)
- `src/lib/header-copy.ts` — 4 occurrences (3 distinct assets)
- `src/components/store/CollectionView.tsx` — 2 occurrences (2 distinct)
- `src/components/store/ProductView.tsx` — 1 occurrence (1 distinct)
- `src/lib/package-zip.ts` — 1 comment (line 31), no code change

*Existing tests (expected values only)*

- `src/lib/phase3-section.test.ts` — 8 occurrences (4 distinct)
- `src/lib/theme-asset-url.test.ts` — 12 occurrences (2 distinct; sample
  arguments)
- `src/components/store/CollectionView.test.tsx` — 1 occurrence (1 distinct)
- `src/components/store/ProductView.test.tsx` — 3 occurrences (1 distinct)
- `src/components/builder/songoskriti.test.tsx` — 1 occurrence (1 distinct)
- `src/components/builder/songoskriti-debrand.test.tsx` — 1 occurrence
  (1 distinct)
- `src/components/builder/songoskriti-snapshots.test.tsx` — 4 occurrences
  (4 distinct)

*Frozen snapshot*

- `src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap`
  — 8 occurrences (4 distinct) — regenerated with a **reviewed diff**, named
  in the commit message, never a blind `-u` (port spec §9).

*Tracked scratch HTML (repo root — URL values only)*

- `men.html` — 34 occurrences
- `women.html` — 36 occurrences
- `preview_out.html` — 20 occurrences

These are tracked scratch captures; they reference five renamed assets and
would 404 after the rename. They are outside every scan root, so the gate
cannot police them — the rename updates them mechanically.

*New migration*

- `supabase/migrations/20261019000000_songoskriti_asset_paths.sql` (§9.2)

*Wiring*

- `package.json` — gate scripts + one `gates:release` entry (wiring only)

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

- `checkSongoskritiAssets(defaultWorld())` returns **zero** findings;
- the expectation file matches the tree's digests and geometry;
- every manifest file is referenced by live code, and every live reference
  resolves to a manifest entry.

**Negative fixtures** — each fixture is a `cleanWorld()` asserted to produce
**zero** findings, plus exactly **one** mutation; the assertion is on the
**exact multiset** of finding codes equal to `{expected code}` (not
`toContain`), so a fixture cannot pass for the wrong reason:

- missing file → `asset.missing`
- orphan file → `asset.unexpected`
- JPEG bytes in a `.png` name → `asset.format_mismatch` + `asset.extension_mismatch`
- manifest format disagreeing with the file name → `asset.extension_mismatch`
- undersized file → `asset.undersized`
- oversized file → `asset.oversized`
- over-density file → `asset.density`
- two identical files → `asset.duplicate`
- a theme raster copied into another `public/` directory → `asset.duplicate`
- a reference to a non-manifest file → `ref.unknown`
- a package-form / external / file-shaped-placeholder URL in an owned root →
  `url.wrong_form`
- a cross-theme `/ph/<other>/…` reference in an owned root → `url.cross_theme`
- a cross-theme reference in a shared root → **no** finding (scope rule)
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

**Rename completeness**

- an assertion that the excluded test files were updated — e.g.
  `src/components/builder/songoskriti-debrand.test.tsx` asserts
  `expect(html).toContain("ugc-1.png")` today and would fail on its own
  after the rename; the new suite asserts the updated value is present and
  the retired name is absent in the files §9.3 lists.

**Fonts / icons / packaging** (vitest, TS)

- the songoskriti pairing resolves to catalogue families;
- the theme stylesheet URL uses only approved origins;
- `FONT_PRELOAD` (`src/lib/web-vitals.ts`) loads `Noto Sans Bengali` with
  `subset=latin,bengali`;
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
- `bun run db:migrate:check` green, and after the migration:
  `select image_url from public.products where merchant_id = 'b50a0000-0000-4000-8000-000000000001' and image_url like '/ph/songoskriti/%'` returns **no** `.png` path (same query for
  `public.collections`).
- Preview smoke: the renamed assets and the repaired editorial images return
  200 from `/ph/songoskriti/…`; the rendered pages are unchanged apart from
  the corrected URLs.
