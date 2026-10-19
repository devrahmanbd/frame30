# Songoskriti asset acceptance gate — design

**Date:** 2026-10-19 · **Branch:** `frame30` · **Status:** design approved in conversation; implementation planned separately.

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
- `prod-kurta.png` / `prod-kantha.png` are declared in the manifest and the
  generator but do not exist and are referenced nowhere.
- 8 assets that the theme actually renders (`campaign-men`,
  `edit-festive-main`, `ugc-1…6`) are absent from the manifest and the
  generator, so the generator cannot reproduce the shipped tree.
- 3 collection-editorial references point at files that do not exist
  (`songoskriti_saree.jpg`, `songoskriti_men.jpg`, `songoskriti_artisan.jpg`
  — marked `// TBD` in `src/lib/themes/songoskriti/archetypes.ts`).
- The generator writes whatever bytes the image API returns into a `.png`
  filename, which is how the format drift started.

Nothing checks images, fonts, icons, video, generated outputs, duplicates,
oversized files, or URL correctness. The port needs asset correctness to be an
explicit acceptance gate.

## 2. Goals

1. Every asset the theme references resolves from its intended location
   (`public/ph/songoskriti/…`, or another explicitly approved location).
2. `scripts/gen-songoskriti-assets.mjs` can prove it reproduces the expected
   output set without a key or a network call.
3. The gate detects missing references, duplicate assets, unnecessarily large
   files, and incorrect public URLs.
4. Visual fidelity is preserved: no asset is recompressed and no theme art is
   copied into official ZIP packages or into shared core directories.
5. The gate is explicit: it runs in `gates:release`, and the port's
   acceptance suite names it.

## 3. Non-goals

- Re-encoding or re-compressing any existing asset (bytes stay identical).
- Generating new artwork (needs `GEMINI_API_KEY`; blocked by policy).
- Changing the preview/storefront rendering of any asset.
- Packaging official themes as ZIPs (forbidden by `docs/packages/contract.md`
  §"Official themes are not ZIP packages").

## 4. Decisions taken in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| JPEG-in-`.png` files | Rename to `.jpg`, update every reference | Byte-identical pixels, no size growth, URLs become honest |
| Missing editorial art (`// TBD`) | Reuse existing theme art | women → `edit-festive-main.jpg`, men → `campaign-men.jpg`, heritage → `hero-artisans.jpg`; no broken refs, no new generation |
| "Unnecessarily large" policy | Budgets only, pixels untouched | ≤ 3 MB/file, ≤ 28 MB total, PNG ≤ 2.0 B/px, JPEG ≤ 1.0 B/px; current worst cases 2.53 MB / 25.35 MB / 1.88 B/px / 0.90 B/px all pass |
| Gate architecture | Shared manifest + CLI + generator `--check` + vitest + release wiring | Deterministic, keyless, structurally immune to generator/checker drift |

## 5. Architecture

### 5.1 One shared manifest

New module `scripts/songoskriti-assets-manifest.mjs` is the single source of
truth. It exports:

```js
export const ASSET_DIR = "public/ph/songoskriti";
export const ASSETS = [
  {
    name: "hero-festive.jpg",
    class: "hero",            // hero | category | product | editorial | ugc | brand
    format: "jpeg",           // png | jpeg | svg
    minWidth: 1024,
    minHeight: 768,
    generated: true,
    aspect: "16:9",           // generation hint only
    prompt: "…",              // generation prompt only
  },
  …
];
```

Both `scripts/songoskriti-assets-check.mjs` (the gate) and
`scripts/gen-songoskriti-assets.mjs` (the generator) import this module, so
the checker and the generator can never describe different file sets.

Class minimum dimensions (floor, not a redesign target):

| Class | Minimum | Members |
|---|---|---|
| hero | 1024 × 768 | `hero-festive.jpg`, `hero-artisans.jpg`, `hero-weaves.jpg` |
| category | 800 × 800 | `cat-women.png`, `cat-men.jpg`, `cat-kids.jpg`, `cat-living.png`, `cat-jewelry.png`, `cat-newin.png` |
| product | 900 × 1200 | `prod-saree.png`, `prod-panjabi.png`, `prod-necklace.png` |
| editorial | 800 × 1000 | `campaign-men.jpg`, `edit-festive-main.jpg` |
| ugc | 800 × 1000 | `ugc-1.jpg`, `ugc-2.jpg`, `ugc-3.png`, `ugc-4.png`, `ugc-5.jpg`, `ugc-6.jpg` |
| brand | — (valid SVG) | `logo-lockup.svg` |

`hero-weaves` is square (1024 × 1024) in the shipped tree; the floor
accepts it, and no asset is re-cut.

### 5.2 The gate

`node scripts/songoskriti-assets-check.mjs [--json] [--root <dir>]`

Exit codes: `0` green · `1` findings · `2` harness error (a harness error is
never a pass).

Checks, each with a stable code:

**Inventory / files** (per manifest entry, and for the directory as a whole)

| Code | Condition |
|---|---|
| `asset.missing` | manifest entry has no file on disk |
| `asset.unexpected` | a file in `public/ph/songoskriti/` is not in the manifest (orphan / stale duplicate) |
| `asset.format_mismatch` | magic bytes disagree with the extension (e.g. JPEG bytes in a `.png` file) |
| `asset.undersized` | below the class minimum dimensions |
| `asset.oversized` | above 3 MB |
| `asset.density` | above 2.0 B/px (PNG) / 1.0 B/px (JPEG) |
| `asset.total_size` | theme directory above 28 MB |
| `asset.duplicate` | identical sha256 twice in the directory, or a theme raster's sha256 found anywhere else under `public/` (a copy smuggled into a shared core directory) |
| `asset.invalid_svg` | the brand SVG is not a parseable `<svg>` document |

**References and URLs** (scan songoskriti-owned source under `src/**` plus the
serialized official package)

| Code | Condition |
|---|---|
| `ref.missing` | a `/ph/songoskriti/<file>` reference has no file in the manifest |
| `ref.not_manifested` | the referenced file exists on disk but is not in the manifest |
| `url.wrong_form` | package form (`assets/…`), wrong lane (`/api/public/ph/songoskriti/…`), protocol-relative, or an absolute external URL used for theme art |
| `url.cross_theme` | a `/ph/<other-theme>/…` reference inside songoskriti-owned code |

**Fonts, icons, video**

| Code | Condition |
|---|---|
| `font.unknown_family` | a family named in the theme's emitted stack is neither in the closed catalogue nor a declared local fallback |
| `font.bad_origin` | the theme stylesheet URL points outside `FONT_ORIGINS` (`fonts.googleapis.com`, `fonts.gstatic.com`) |
| `font.bengali_not_loaded` | the document-level `FONT_PRELOAD` does not load `Noto Sans Bengali` with `subset=latin,bengali` |
| `icon.unknown` | an icon imported from `@/components/icons/tabler` has no matching export in the generated module |
| `icon.url_ref` | an icon is referenced as a URL/file instead of inlined |
| `video.missing` / `video.format_mismatch` | a `.mp4/.webm/.mov/.m4v` reference that does not resolve under `/ph/songoskriti/`, or whose bytes contradict the extension (none today; the rule stays) |

**Packaging boundary**

| Code | Condition |
|---|---|
| `pkg.asset_manifest` | the official songoskriti package carries an `assetManifest` or an embedded asset payload — official themes are source-rendered, never ZIP-packaged |
| `pkg.package_ref` | a package-form `assets/…` reference inside official templates |
| `pkg.asset_copy` | a theme raster checksum outside `public/ph/songoskriti/` |
| `pkg.official_zip` | a songoskriti package/zip artifact exists in the repo or build output |

### 5.3 Generator reproducibility

`node scripts/gen-songoskriti-assets.mjs --check`

- Requires **no** `GEMINI_API_KEY` and makes **no** network call.
- Prints a deterministic plan (name, aspect, class) — byte-identical across
  runs.
- The plan must equal the checker manifest exactly (same file set, same
  formats); any drift is an error.
- Every planned file must exist on disk with matching format and class
  minimum dimensions.
- Exits `1` listing the offending entries when plan and tree disagree.

The key check moves out of module scope into the generation path, so the
module can be imported by tests and by `--check` without a key.

When generating for real, the script now sniffs the returned bytes: a JPEG
payload destined for a `.png` name is refused (with a clear message) instead
of being written silently. Generation still needs `GEMINI_API_KEY`, still
retries ×2, still skips on failure.

### 5.4 Wiring

- `package.json`: `assets:songoskriti` → `node scripts/songoskriti-assets-check.mjs`;
  `assets:songoskriti:gen` → `node scripts/gen-songoskriti-assets.mjs --check`.
  `assets:songoskriti` is inserted into `gates:release`, before the browser
  gates (fast, no server, no network).
- `src/lib/themes/frame30-acceptance.test.ts`: one new case —
  "songoskriti asset correctness is green" — invoking the shared checker, so
  the port's acceptance list names asset correctness explicitly.
- Docs: `docs/themes/creation.md` §14.3 gains the asset-ownership rules, the
  approved locations, the format rules and the gate command; the port design
  spec's acceptance list gains the asset gate. The misleading comment in
  `src/lib/package-zip.ts` ("official Songoskriti ships ~25MB of imagery") is
  corrected — official themes are not ZIP packages.

## 6. Data flow

```
src/**  ──scan──►  references ──►  manifest ──►  public/ph/songoskriti/*
   │                     │              │                    │
   │                     │              │                    ▼
   │                     │              │            bytes / geometry / size
   │                     ▼              ▼                    │
   │              URL-form rules   sha256 duplicates ◄───────┘
   ▼
findings (code + message)  ──►  exit 0 | 1
```

The generator imports the same manifest, so `--check` compares the plan with
the tree that the gate validates — one manifest, one truth.

## 7. Error handling

- A malformed manifest entry (unknown class, bad extension) is a harness error
  (exit 2), never a silent pass.
- Unreadable files are reported per file; one bad file never hides the rest.
- The gate never mutates the tree. Remediation is a separate, reviewed
  change set.
- `--json` emits machine-readable findings for CI; the default output is
  human-readable.

## 8. Testing

New suite `src/lib/themes/songoskriti-assets.test.ts`:

- **Green path** — the repo passes the gate with zero findings.
- **Negative fixtures** (temporary directories, never the repo):
  - missing file → `asset.missing`
  - orphan file → `asset.unexpected`
  - JPEG bytes in a `.png` name → `asset.format_mismatch`
  - undersized file → `asset.undersized`
  - oversized file → `asset.oversized`
  - over-density file → `asset.density`
  - two identical files → `asset.duplicate`
  - a theme raster copied into another `public/` directory → `asset.duplicate`
  - a reference to a non-existent file → `ref.missing`
  - a package-form / wrong-lane / external URL → `url.wrong_form`
  - a cross-theme `/ph/<other>/…` reference → `url.cross_theme`
  - an official package carrying an asset manifest → `pkg.asset_manifest`
- **Generator** — `--check` exits 0 with no key in the environment; the plan
  is identical across two runs; a temp directory with a missing or extra
  file is reported; the generator refuses JPEG bytes for a `.png` name.
- **Fonts** — the songoskriti pairing resolves to catalogue families, the
  theme stylesheet URL uses only approved origins, and the document-level
  `FONT_PRELOAD` loads `Noto Sans Bengali` with `subset=latin,bengali`.
- **Icons** — every tabler import used by songoskriti code exists as an
  export in the generated module.

## 9. Rollout

1. Shared manifest module + the 9 renames + reference updates + the three
   `// TBD` editorial fixes + snapshot refresh.
2. Gate checker (inventory, files, budgets, duplicates, refs, URL forms).
3. Generator `--check` + byte-format refusal.
4. Font / icon / video / packaging checks.
5. Vitest suite (green path + negative fixtures).
6. `package.json` wiring + `frame30-acceptance.test.ts` case + docs.

Each step is a normal commit on `frame30`. No deploy in this pass; the
preview/storefront behaviour is unchanged apart from the corrected asset
URLs (`.png` → `.jpg` for the nine renamed files) and the three repaired
editorial references.

## 10. Verification

- `node scripts/songoskriti-assets-check.mjs` → green, exit 0.
- `node scripts/gen-songoskriti-assets.mjs --check` → green, exit 0, no key.
- Targeted vitest for the new suite and every suite touching renamed
  assets.
- Full `bun run test`, `bun run typecheck`, `eslint`, `prettier --check`.
- Preview smoke: the renamed assets and the repaired editorial images return
  200 from `/ph/songoskriti/…` and the rendered pages are unchanged.
