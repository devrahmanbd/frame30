# Songoskriti Asset Acceptance Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Songoskriti asset correctness an explicit, enforced acceptance gate — one shared inventory, one frozen expectation, a deterministic gate that detects missing references / duplicate assets / oversized files / incorrect public URLs, and a keyless `--check` that proves the generator reproduces the expected output set.

**Architecture:** Three artifacts describe the same 21 theme assets: the **manifest** (`scripts/songoskriti-assets-manifest.mjs`, what the generator produces), the **expectation** (`scripts/songoskriti-assets-expected.json`, the approved bytes — the anchor that stops "delete file + delete manifest entry" from going green), and the **tree** (`public/ph/songoskriti/`). A pure `checkSongoskritiAssets(world)` evaluates the three against each other and returns `{findings, notes}`; the CLI is a thin wrapper over it, and the vitest suite drives the same function with synthetic fixtures. Node-runnable checks live in `.mjs` (node cannot import this repo's TypeScript); TS-dependent checks (fonts, icons, package shape) live in a vitest-side module.

**Tech Stack:** node 24 (`node scripts/*.mjs`, plain ESM, zero dependencies), vitest 3 + `src/**/*.test.ts`, bun for repo scripts, SQL migrations under `supabase/migrations/`.

**Spec:** `docs/superpowers/specs/2026-10-19-songoskriti-asset-acceptance-gate-design.md` (revision 6, commit `ba5f97e0`) — the plan argues from the spec; executors read both.

## Global Constraints

- **No new npm dependencies. No image tooling. No network in CI.** Everything is plain node + vitest + the bytes already in the repo.
- **Never edit an applied migration.** `scripts/db-migrate.mjs` fails on a checksum change to an applied file. Seed changes ship as a **new** migration file.
- **Explicit-path staging only.** Never commit `.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`. Never commit `.output-snapshots/`. Stage with full paths, never `git add -A`.
- **No test weakening.** No test is deleted, skipped, or loosened. The frozen `.snap` is regenerated with a **reviewed diff** (read the diff), never a blind `vitest -u`.
- **Core boundary.** Only the files listed in spec §9.3 may be edited outside `src/lib/themes/songoskriti/**`, `src/components/builder/songoskriti*.ts(x)`, `docs/**`, `scripts/**`, and new files. The port spec's §7 allow-list is amended in Task 8.
- **Doc-gate wording.** In `docs/themes/creation.md` and any new doc prose, never put on one line: `official` with `downloadable`/`ZIP`; `Songoskriti` with `package`/`downloadable`/`ZIP`; `official theme(s)` with `Level B`. Never write "no Playwright" or "no `.e2e`". A bare `/admin/builder` mention needs the token `legacy` on the same line.
- **Status-line sha.** `docs/themes/creation.md`'s `Last verified: <date> @ <sha>` uses a **12-char** `git rev-parse --short=12 HEAD` taken **before** the commit that adds the line — never that commit's own sha.
- **The gate must be green.** On the post-implementation tree, `node scripts/songoskriti-assets-check.mjs` exits 0 with **zero findings** (notes are allowed and are non-fatal).
- **No deploy in this plan.** Nothing here touches production; the port's deploy is a separate decision.
- **Tooling.** `bun` exists at `/root/.bun/bin/bun` but is **not on `PATH`**; the repo's tools are in `node_modules/.bin/` (`vitest`, `eslint`, `tsgo`, `prettier`). Run `node_modules/.bin/vitest run <path>`, `node_modules/.bin/tsgo --noEmit`, `node_modules/.bin/eslint .`, `node_modules/.bin/prettier --check <files>`. `/root/.bun/bin/bun run <script>` also works for the package.json scripts.

## Review Focus

Each line is a failure mode a reasonable person would expect to be handled but that no naive implementation covers. The task that owns the code adds the pinning test.

1. **The generator silently writes JPEG bytes under a `.png` name** — the drift that created this whole mess. The generator must refuse that write, and the gate must catch the file if it ever appears. → Task 5 (assertFormatMatches), Task 4 (`asset.format_mismatch`).
2. **A dangling `/ph/songoskriti/…` reference in a shared root** (e.g. `src/lib/demo-catalog.ts`, `src/lib/header-copy.ts`, `src/components/store/**`) — a 404 in production that a theme-scoped scan never sees. → Task 4 (`ref.unknown` in the shared profile), Task 2 (the live-reference test).
3. **A theme raster copied into another `public/` directory** — the same artwork served from two places, invisible to a per-directory check. → Task 4 (`asset.duplicate`), Task 6 (`pkg.asset_copy`).
4. **The seeded catalogue reverts to retired paths** after a `theme_purge_demo` + re-seed cycle, because the applied seed is idempotent with `on conflict … image_url = excluded.image_url`. → Task 7 (by-row-id function + runbook).
5. **A legitimate placeholder-lane URL** (`/api/public/ph/womens/…svg`, `/api/public/ph/<seed>`) is not theme art and must not be flagged, while a file-shaped placeholder (`/api/public/ph/songoskriti/…`) must be. → Task 4 (approved locations + root profiles).
6. **An asset that exists but nothing references** — the tree grows an orphan nobody renders, and the inventory rots again. → Task 4 (`asset.unreferenced`).

---

## File Structure

**New**

- `scripts/songoskriti-assets-manifest.mjs` — data only: the 21 canonical entries (name, format, floors, class, generated, aspect, prompt) + the budget constants.
- `scripts/songoskriti-assets-image.mjs` — byte-level utilities: `imageInfo(buffer)`, `sha256(buffer)`, `fileInfo(path)`.
- `scripts/songoskriti-assets-expected.json` — the frozen expectation (name, format, actual width/height, sha256 per asset).
- `src/lib/themes/songoskriti-assets.ts` — vitest-side checks: `checkSongoskritiFonts()`, `checkSongoskritiPackaging(world)`, plus the icon-import parser.
- `src/lib/themes/songoskriti-asset-paths.test.ts` — live-reference test (every live `/ph/songoskriti/…` reference resolves; retired names absent).
- `src/lib/themes/songoskriti-assets.test.ts` — the acceptance suite: green path + negative fixtures + generator + fonts/icons/packaging.
- `supabase/migrations/20261019000000_songoskriti_asset_paths.sql` — the seed path repair.

**Modified**

- `scripts/songoskriti-assets-check.mjs` — becomes the gate (keeps its `MANIFEST`/`pngSize` exports working for the generator import).
- `scripts/gen-songoskriti-assets.mjs` — keyless `--check`, format-aware skip, byte-format refusal, shared manifest.
- `package.json` — two scripts + one `gates:release` entry.
- `public/ph/songoskriti/*` — nine `git mv` renames (bytes unchanged).
- The escalated source/test/scratch files in spec §9.3.
- `docs/themes/creation.md`, `docs/themes/songoskriti-port-map.md`, `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md`.

**Interfaces produced by this plan** (later tasks rely on these exact names):

```js
// scripts/songoskriti-assets-manifest.mjs
export const ASSETS;                    // Array<AssetEntry>
export const ASSET_DIR;                  // "public/ph/songoskriti"
export const BUDGETS;                    // { maxFileBytes, maxTotalBytes, maxBytesPerPixel: { png, jpeg } }
export type AssetEntry = { name: string; format: "png"|"jpeg"|"svg"; minWidth: number|null; minHeight: number|null; class: string; generated: boolean; aspect?: string; prompt?: string };

// scripts/songoskriti-assets-image.mjs
export function imageInfo(buffer: Buffer): { format: "png"|"jpeg"|"svg"|null; width: number|null; height: number|null };
export function sha256(buffer: Buffer): string;
export function fileInfo(path: string): { format, width, height, bytes, sha256 } | null;

// scripts/songoskriti-assets-check.mjs
export function defaultWorld(): World;
export function checkSongoskritiAssets(world: World): { findings: Finding[]; notes: Note[] };
export type Finding = { code: string; path: string; message: string };
export type Note = { code: string; path: string; message: string };

// scripts/gen-songoskriti-assets.mjs
export function assertFormatMatches(name: string, bytes: Buffer): void;   // throws
export function writeAssetBytes(name: string, bytes: Buffer): void;       // calls the assert
export function buildPlan(): Array<{ name: string; aspect: string; format: string }>;
```

---

### Task 1: The shared manifest

**Files:**
- Create: `scripts/songoskriti-assets-manifest.mjs`
- Test: `src/lib/themes/songoskriti-assets.test.ts` (new file; this task creates it with the first test only)

**Interfaces:**
- Consumes: nothing.
- Produces: `ASSETS`, `ASSET_DIR`, `BUDGETS` from `scripts/songoskriti-assets-manifest.mjs`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/themes/songoskriti-assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
// Plain .mjs module — imported across runners, so it must stay dependency-free.
import { ASSETS, BUDGETS } from "../../../scripts/songoskriti-assets-manifest.mjs";

describe("songoskriti asset manifest", () => {
  it("declares 21 unique theme assets with a valid format and extension", () => {
    expect(ASSETS).toHaveLength(21);
    const names = ASSETS.map((a) => a.name);
    expect(new Set(names).size).toBe(21);
    for (const a of ASSETS) {
      const ext = a.name.slice(a.name.lastIndexOf(".") + 1);
      const expected = ext === "jpg" ? "jpeg" : ext;
      expect(a.format).toBe(expected);
      expect(a.name).toMatch(/^[a-z0-9-]+\.(png|jpg|svg)$/);
    }
  });
  it("gives every generated asset a prompt and every raster a floor", () => {
    for (const a of ASSETS) {
      if (a.format === "svg") {
        expect(a.minWidth).toBeNull();
        expect(a.minHeight).toBeNull();
        expect(a.generated).toBe(false);
        continue;
      }
      expect(a.minWidth).toBeGreaterThan(0);
      expect(a.minHeight).toBeGreaterThan(0);
      expect(a.generated).toBe(true);
      expect(a.prompt && a.prompt.length).toBeGreaterThan(20);
      expect(a.aspect).toMatch(/^\d+:\d+$/);
    }
  });
  it("pins every entry's name, format and floors", () => {
    expect(
      ASSETS.map((a) => ({
        name: a.name,
        format: a.format,
        minWidth: a.minWidth,
        minHeight: a.minHeight,
      })),
    ).toMatchSnapshot();
  });

  it("pins the size budgets", () => {
    expect(BUDGETS.maxFileBytes).toBe(3_000_000);
    expect(BUDGETS.maxTotalBytes).toBe(28_000_000);
    expect(BUDGETS.maxBytesPerPixel.png).toBe(2);
    expect(BUDGETS.maxBytesPerPixel.jpeg).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: FAIL — "Cannot find module '../../../scripts/songoskriti-assets-manifest.mjs'".

- [ ] **Step 3: Write the manifest module**

Create `scripts/songoskriti-assets-manifest.mjs`:

```js
/**
 * Songoskriti asset inventory — the single source of truth shared by the
 * gate (scripts/songoskriti-assets-check.mjs) and the generator
 * (scripts/gen-songoskriti-assets.mjs). Data only: no fs, no network.
 *
 * `name` is the shipped file name; `format` is authoritative and always
 * agrees with the name's extension. `minWidth`/`minHeight` are floors the
 * shipped file must meet (null = not applicable, e.g. SVG).
 */
export const ASSET_DIR = "public/ph/songoskriti";

export const BUDGETS = {
  maxFileBytes: 3_000_000,
  maxTotalBytes: 28_000_000,
  maxBytesPerPixel: { png: 2, jpeg: 1 },
};

export const ASSETS = [
  {
    name: "campaign-men.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "editorial",
    generated: true,
    aspect: "3:4",
    prompt:
      "Festive Bengali men's panjabi and kurta folded on ivory linen for a " +
      "men's campaign editorial, terracotta and ivory palette, e-commerce " +
      "photograph, plain warm background, no text",
  },
  {
    name: "cat-jewelry.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Terracotta-and-gold Bengali temple necklace on ivory silk, jewelry " +
      "e-commerce category tile, centered, plain warm background, no text",
  },
  {
    name: "cat-kids.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Cheerful small Bengali festive kurta for a child in ivory with " +
      "terracotta trim flat-lay, e-commerce category tile, centered, plain " +
      "warm background, no text",
  },
  {
    name: "cat-living.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Handwoven Bengali kantha throw in terracotta and ivory folded on a " +
      "jute chair, home-living e-commerce category tile, warm light, no text",
  },
  {
    name: "cat-men.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Crisp ivory panjabi kurta with subtle terracotta embroidery flat-lay, " +
      "e-commerce category tile, centered, plain warm background, no text",
  },
  {
    name: "cat-newin.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Fresh festive Bengali outfit arrangement with marigold accents in " +
      "terracotta and ivory, new-arrivals e-commerce category tile, no text",
  },
  {
    name: "cat-women.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Elegant Bengali jamdani saree in terracotta and ivory draped flat-lay, " +
      "e-commerce category tile, centered, plain warm background, no text",
  },
  {
    name: "edit-festive-main.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "editorial",
    generated: true,
    aspect: "3:4",
    prompt:
      "Festive Bengali Eid clothing editorial still, folded terracotta and " +
      "ivory garments with marigold accents, warm side light, editorial " +
      "photograph, no text",
  },
  {
    name: "hero-artisans.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 768,
    class: "hero",
    generated: true,
    aspect: "16:9",
    prompt:
      "Bengali artisan workshop weaving kantha quilts, warm window light, " +
      "terracotta and ivory textiles, documentary e-commerce hero " +
      "photograph, no text",
  },
  {
    name: "hero-festive.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 768,
    class: "hero",
    generated: true,
    aspect: "16:9",
    prompt:
      "Festive Bengali Eid clothing market at golden hour, terracotta and " +
      "ivory fabric banners, editorial e-commerce hero photograph, warm " +
      "light, no text",
  },
  {
    name: "hero-weaves.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 1024,
    class: "hero",
    generated: true,
    aspect: "1:1",
    prompt:
      "Close-up of a traditional Bengali handloom with terracotta jamdani " +
      "weave in progress, artisan hands, ivory threads, editorial craft " +
      "photograph, no text",
  },
  {
    name: "logo-lockup.svg",
    format: "svg",
    minWidth: null,
    minHeight: null,
    class: "brand",
    generated: false,
  },
  {
    name: "prod-necklace.png",
    format: "png",
    minWidth: 900,
    minHeight: 1200,
    class: "product",
    generated: true,
    aspect: "3:4",
    prompt:
      "Bengali terracotta temple necklace with gold accents upright on ivory " +
      "stand, e-commerce jewelry product photo, plain warm background, no text",
  },
  {
    name: "prod-panjabi.png",
    format: "png",
    minWidth: 900,
    minHeight: 1200,
    class: "product",
    generated: true,
    aspect: "3:4",
    prompt:
      "Ivory men's panjabi kurta with terracotta thread embroidery on a ghost " +
      "mannequin, e-commerce product photo, plain warm studio background, no text",
  },
  {
    name: "prod-saree.png",
    format: "png",
    minWidth: 900,
    minHeight: 1200,
    class: "product",
    generated: true,
    aspect: "3:4",
    prompt:
      "Terracotta jamdani saree with ivory motifs draped for e-commerce " +
      "product photo, plain warm studio background, no text",
  },
  {
    name: "ugc-1.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a Bengali woman in an ivory jamdani saree " +
      "holding a brass diya, warm indoor light, terracotta accents, no text",
  },
  {
    name: "ugc-2.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of folded terracotta kantha quilt on a " +
      "wooden stool, warm daylight, handmade texture, no text",
  },
  {
    name: "ugc-3.png",
    format: "png",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a Bengali festive kurta on a hanger in a " +
      "warm room, marigold accents, no text",
  },
  {
    name: "ugc-4.png",
    format: "png",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of stacked ivory and terracotta fabric bolts " +
      "in a weaver's workshop, warm daylight, no text",
  },
  {
    name: "ugc-5.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a silver filigree jhumka earring pair on " +
      "terracotta cloth, warm side light, no text",
  },
  {
    name: "ugc-6.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a handwoven muslin saree draped over a " +
      "chair, soft daylight, ivory and warm tones, no text",
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/songoskriti-assets-manifest.mjs src/lib/themes/songoskriti-assets.test.ts
git commit -m "feat(songoskriti): shared asset manifest (21 assets, one source of truth)"
```

---

### Task 2: Rename the mislabeled assets and repair every reference

**Files:**
- Modify: `public/ph/songoskriti/*` (nine `git mv` renames)
- Modify (core, URL values only): `src/lib/demo-catalog.ts`, `src/lib/header-copy.ts`, `src/components/store/CollectionView.tsx`, `src/components/store/ProductView.tsx`
- Modify (theme-owned): `src/lib/themes/songoskriti/{homepage,archetypes,preview}.ts`
- Modify (existing tests, expected values only): `src/lib/phase3-section.test.ts`, `src/lib/theme-asset-url.test.ts`, `src/components/store/CollectionView.test.tsx`, `src/components/store/ProductView.test.tsx`, `src/components/builder/songoskriti.test.tsx`, `src/components/builder/songoskriti-debrand.test.tsx`, `src/components/builder/songoskriti-snapshots.test.tsx`
- Modify (frozen snapshot): `src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap`
- Modify (tracked scratch): `men.html`, `women.html`, `preview_out.html`
- Test: `src/lib/themes/songoskriti-asset-paths.test.ts` (new file)

**Interfaces:**
- Consumes: `ASSETS` (Task 1) for the canonical name set.
- Produces: the renamed tree (`public/ph/songoskriti/*.jpg` for the nine), and `src/lib/themes/songoskriti-asset-paths.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/themes/songoskriti-asset-paths.test.ts`:

```ts
/**
 * Every live `/ph/songoskriti/…` reference must resolve to a shipped asset,
 * and no retired filename may survive in live source. Retired names are
 * built by concatenation so this file never carries a literal that looks
 * like a stale reference.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ASSETS } from "../../../scripts/songoskriti-assets-manifest.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ASSET_DIR = resolve(ROOT, "public/ph/songoskriti");

/** Live code that may reference theme art. */
const SCAN_ROOTS = [
  "src/lib/themes/songoskriti",
  "src/components/builder/songoskriti.tsx",
  "src/components/builder/songoskriti-motion.ts",
  "src/lib/demo-catalog.ts",
  "src/lib/header-copy.ts",
  "src/components/store",
  "src/routes",
];

/** The nine files whose bytes are JPEG and whose name must end `.jpg`. */
const RENAMED = [
  "campaign-men",
  "cat-kids",
  "cat-men",
  "edit-festive-main",
  "hero-artisans",
  "hero-festive",
  "hero-weaves",
  "ugc-1",
  "ugc-2",
];

function filesUnder(rel: string): string[] {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => resolve(d.parentPath, d.name));
}

describe("songoskriti asset paths", () => {
  it("ships exactly the manifest's assets", () => {
    const onDisk = readdirSync(ASSET_DIR).sort();
    expect(onDisk).toEqual(ASSETS.map((a) => a.name).sort());
  });

  it("every live reference resolves to a shipped asset", () => {
    const shipped = new Set(readdirSync(ASSET_DIR));
    const unknown: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of filesUnder(root)) {
        if (file.includes(".test.")) continue;
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(/\/ph\/songoskriti\/([A-Za-z0-9._-]+)/g)) {
          if (!shipped.has(m[1])) unknown.push(`${file}: ${m[1]}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("no retired filename survives in live source", () => {
    const retired = RENAMED.map((n) => `${n}.png`);
    const hits: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of filesUnder(root)) {
        if (file.includes(".test.")) continue;
        const text = readFileSync(file, "utf8");
        for (const name of retired) {
          if (text.includes(name)) hits.push(`${file}: ${name}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/lib/themes/songoskriti-asset-paths.test.ts`
Expected: FAIL — the "ships exactly the manifest's assets" case lists `campaign-men.png` vs the manifest's `campaign-men.jpg`, and "every live reference resolves" reports `songoskriti_saree.jpg`, `songoskriti_men.jpg`, `songoskriti_artisan.jpg`.

- [ ] **Step 3: Rename the nine files**

```bash
cd /opt/frame28/public/ph/songoskriti
git mv campaign-men.png campaign-men.jpg
git mv cat-kids.png cat-kids.jpg
git mv cat-men.png cat-men.jpg
git mv edit-festive-main.png edit-festive-main.jpg
git mv hero-artisans.png hero-artisans.jpg
git mv hero-festive.png hero-festive.jpg
git mv hero-weaves.png hero-weaves.jpg
git mv ugc-1.png ugc-1.jpg
git mv ugc-2.png ugc-2.jpg
```

Bytes are untouched — the same files, honestly named.

- [ ] **Step 4: Update every reference**

For each of the nine base names, replace `<base>.png` with `<base>.jpg` in the files listed in this task (source, tests, snapshot, scratch HTML). Use an explicit path list — never a repo-wide blanket `sed`:

```bash
cd /opt/frame28
FILES="src/lib/demo-catalog.ts src/lib/header-copy.ts src/components/store/CollectionView.tsx src/components/store/ProductView.tsx src/lib/themes/songoskriti/homepage.ts src/lib/themes/songoskriti/archetypes.ts src/lib/themes/songoskriti/preview.ts src/lib/phase3-section.test.ts src/lib/theme-asset-url.test.ts src/components/store/CollectionView.test.tsx src/components/store/ProductView.test.tsx src/components/builder/songoskriti.test.tsx src/components/builder/songoskriti-debrand.test.tsx src/components/builder/songoskriti-snapshots.test.tsx src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap men.html women.html preview_out.html"
for f in $FILES; do
  for n in campaign-men cat-kids cat-men edit-festive-main hero-artisans hero-festive hero-weaves ugc-1 ugc-2; do
    perl -pi -e "s/\Q$n.png\E/$n.jpg/g" "$f"
  done
done
```

Note: `ugc-1`/`ugc-2` replacements must not touch `ugc-3`/`ugc-4` (the `\Q…\E` + exact `.png` suffix makes that safe).

- [ ] **Step 5: Repair the three dangling editorial references**

In `src/lib/themes/songoskriti/archetypes.ts` (theme-owned):

| Line | Old | New |
|---|---|---|
| ~39 | `image: "/ph/songoskriti/songoskriti_saree.jpg", // TBD` | `image: "/ph/songoskriti/edit-festive-main.jpg",` |
| ~62 | `image: "/ph/songoskriti/songoskriti_men.jpg", // TBD` | `image: "/ph/songoskriti/campaign-men.jpg",` |
| ~128 | `image: "/ph/songoskriti/songoskriti_artisan.jpg",` | `image: "/ph/songoskriti/hero-artisans.jpg",` |

Drop the `// TBD` comments — the references are real now.

- [ ] **Step 6: Run the affected suites**

Run: `bun run vitest run src/lib/themes/songoskriti-asset-paths.test.ts src/components/builder/songoskriti-snapshots.test.tsx src/components/builder/songoskriti.test.tsx src/components/builder/songoskriti-debrand.test.tsx src/lib/phase3-section.test.ts src/lib/theme-asset-url.test.ts src/components/store/CollectionView.test.tsx src/components/store/ProductView.test.tsx`
Expected: PASS. If the snapshot test fails, run `bun run vitest run src/components/builder/songoskriti-snapshots.test.tsx -u` **once**, then `git diff src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap` and read it: the only change must be the nine `.png` → `.jpg` URL strings. If anything else changed, stop and investigate.

- [ ] **Step 7: Commit**

```bash
git add public/ph/songoskriti src/lib/demo-catalog.ts src/lib/header-copy.ts src/components/store/CollectionView.tsx src/components/store/ProductView.tsx src/lib/themes/songoskriti/homepage.ts src/lib/themes/songoskriti/archetypes.ts src/lib/themes/songoskriti/preview.ts src/lib/phase3-section.test.ts src/lib/theme-asset-url.test.ts src/components/store/CollectionView.test.tsx src/components/store/ProductView.test.tsx src/components/builder/songoskriti.test.tsx src/components/builder/songoskriti-debrand.test.tsx src/components/builder/songoskriti-snapshots.test.tsx src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap men.html women.html preview_out.html src/lib/themes/songoskriti-asset-paths.test.ts
git commit -m "fix(songoskriti): rename JPEG assets to .jpg and repair every reference

The nine theme assets written as .png carried JPEG bytes, so every public URL
lied about the format it served. Renamed without touching a byte, updated every
live reference, and repaired the three collection-editorial refs that pointed
at files which never existed.

old -> new: campaign-men, cat-kids, cat-men, edit-festive-main, hero-artisans,
hero-festive, hero-weaves, ugc-1, ugc-2 (.png -> .jpg)"
```

---

### Task 3: Byte utilities and the frozen expectation

**Files:**
- Create: `scripts/songoskriti-assets-image.mjs`
- Create: `scripts/songoskriti-assets-expected.json`
- Test: `src/lib/themes/songoskriti-assets.test.ts` (extend)

**Interfaces:**
- Consumes: `ASSETS` (Task 1).
- Produces: `imageInfo`, `sha256`, `fileInfo` from `scripts/songoskriti-assets-image.mjs`; the expectation file.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/themes/songoskriti-assets.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { imageInfo, sha256, fileInfo } from "../../../scripts/songoskriti-assets-image.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
import expectation from "../../../scripts/songoskriti-assets-expected.json";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ASSET_DIR = resolve(ROOT, "public/ph/songoskriti");

describe("songoskriti asset bytes", () => {
  it("decodes PNG and JPEG geometry from the bytes alone", () => {
    const png = imageInfo(readFileSync(resolve(ASSET_DIR, "cat-women.png")));
    expect(png.format).toBe("png");
    expect(png.width).toBe(1024);
    expect(png.height).toBe(1024);
    const jpeg = imageInfo(readFileSync(resolve(ASSET_DIR, "hero-festive.jpg")));
    expect(jpeg.format).toBe("jpeg");
    expect(jpeg.width).toBe(1376);
    expect(jpeg.height).toBe(768);
    const svg = imageInfo(readFileSync(resolve(ASSET_DIR, "logo-lockup.svg")));
    expect(svg.format).toBe("svg");
  });

  it("the expectation matches the shipped bytes exactly", () => {
    expect(expectation.assets).toHaveLength(21);
    for (const rec of expectation.assets) {
      const info = fileInfo(resolve(ASSET_DIR, rec.name));
      expect(info, rec.name).not.toBeNull();
      expect(info?.format).toBe(rec.format);
      expect(info?.width).toBe(rec.width);
      expect(info?.height).toBe(rec.height);
      expect(info?.sha256).toBe(rec.sha256);
    }
  });

  it("the expectation and the manifest name the same set", () => {
    expect(expectation.assets.map((a) => a.name).sort()).toEqual(
      ASSETS.map((a) => a.name).sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: FAIL — "Cannot find module '../../../scripts/songoskriti-assets-image.mjs'".

- [ ] **Step 3: Write the byte utilities**

Create `scripts/songoskriti-assets-image.mjs`:

```js
/**
 * Byte-level asset utilities — no dependencies, no image libraries.
 *
 * PNG geometry comes from the IHDR chunk; JPEG geometry from the first
 * SOF0/SOF1/SOF2 marker; SVG is detected from the root element. The
 * returned `format` is what the BYTES are, which is what the gate compares
 * against the file name and the manifest.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function imageInfo(buffer) {
  if (!buffer || buffer.length < 4) {
    return { format: null, width: null, height: null };
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    if (buffer.length < 24) return { format: null, width: null, height: null };
    return {
      format: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i < buffer.length - 9) {
      if (buffer[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buffer[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS — no frame header
      const length = buffer.readUInt16BE(i + 2);
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof) {
        return {
          format: "jpeg",
          height: buffer.readUInt16BE(i + 5),
          width: buffer.readUInt16BE(i + 7),
        };
      }
      i += 2 + length;
    }
    return { format: "jpeg", width: null, height: null };
  }
  // SVG
  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 512)).trim();
  if (head.startsWith("<?xml")) {
    const body = buffer.toString("utf8", 0, Math.min(buffer.length, 2048));
    if (/<svg[\s>]/i.test(body)) return { format: "svg", width: null, height: null };
    return { format: null, width: null, height: null };
  }
  if (head.startsWith("<svg") || head.startsWith("<!DOCTYPE svg")) {
    return { format: "svg", width: null, height: null };
  }
  return { format: null, width: null, height: null };
}

export function fileInfo(path) {
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    return null;
  }
  const { format, width, height } = imageInfo(buffer);
  return { format, width, height, bytes: buffer.length, sha256: sha256(buffer) };
}
```

- [ ] **Step 4: Write the expectation file**

Create `scripts/songoskriti-assets-expected.json` with the shipped digests (the renames do not change bytes, so the digests below are the current ones):

```json
{
  "assets": [
    { "name": "campaign-men.jpg", "format": "jpeg", "width": 896, "height": 1200, "sha256": "a99fcdf72d2d5119043d02f0e7cc6a48f68361e89fc3dc163782dbba2d2f76a4" },
    { "name": "cat-jewelry.png", "format": "png", "width": 1024, "height": 1024, "sha256": "e5d042f1f9577ae0f7b66416daee796e4f9397bcdb749e6157cfb8e94f25ee82" },
    { "name": "cat-kids.jpg", "format": "jpeg", "width": 1024, "height": 1024, "sha256": "bdff81cd0b52543574d4a7d3f643f7d03742912adf956c64ff08b88f9b5475bb" },
    { "name": "cat-living.png", "format": "png", "width": 1024, "height": 1024, "sha256": "85e05cc8d591f68053e7d142f642d175480d2cdc59aa0422b785abf297751855" },
    { "name": "cat-men.jpg", "format": "jpeg", "width": 1024, "height": 1024, "sha256": "af29610372fbf0fa75c0d3223f0866912c8b2818a2fb249515e2be63e619e4a4" },
    { "name": "cat-newin.png", "format": "png", "width": 1024, "height": 1024, "sha256": "b38ec97d7e3d8fdb96b5cf067d408d5b6bed4388f9f22b032cdc1fcc1578e69d" },
    { "name": "cat-women.png", "format": "png", "width": 1024, "height": 1024, "sha256": "e5488a09b6f07bf953d22266abf9edecab46db5e73f03de24d527c8edfed07a5" },
    { "name": "edit-festive-main.jpg", "format": "jpeg", "width": 896, "height": 1200, "sha256": "de2fca2861fb4b8ca9f480858201ec3ae9e3f48071edfb8d939b62ff52af05d9" },
    { "name": "hero-artisans.jpg", "format": "jpeg", "width": 1376, "height": 768, "sha256": "3e82feef72d67ba61dee2398602edfc39fa83bb62a96f69df8b7582e1b416781" },
    { "name": "hero-festive.jpg", "format": "jpeg", "width": 1376, "height": 768, "sha256": "62084a21978d95894c6318014c494f23399b44f1472bd30f5aff3768851aef8e" },
    { "name": "hero-weaves.jpg", "format": "jpeg", "width": 1024, "height": 1024, "sha256": "ce593e5329eea73fdc6496294376d16948f19f92fec969e3fb455f99927933bc" },
    { "name": "logo-lockup.svg", "format": "svg", "width": null, "height": null, "sha256": "a76db7c44b3f449a31ce6a81c5e8f882351d38ceecbef8d6dafbc6980f8892d0" },
    { "name": "prod-necklace.png", "format": "png", "width": 900, "height": 1200, "sha256": "714b3069600f6479eeecb6ccc00d749dac5acc189cd1d6f3ec89eb34cbd9e100" },
    { "name": "prod-panjabi.png", "format": "png", "width": 900, "height": 1200, "sha256": "8e8b92752c0a78c876a835496ed6fa257316e69dd5ea48dd3428d08f96dd0beb" },
    { "name": "prod-saree.png", "format": "png", "width": 900, "height": 1200, "sha256": "e00db562470b505835c30bf534dd94124bc1429a0f08aeeec2a1e44dc80bd871" },
    { "name": "ugc-1.jpg", "format": "jpeg", "width": 896, "height": 1200, "sha256": "58be24ba8be30d6ed8ad0fb2d91e5524acfe44f46ca54032c968facfb976b80e" },
    { "name": "ugc-2.jpg", "format": "jpeg", "width": 896, "height": 1200, "sha256": "3331b49afe6cef2dbf1bca56c6e566fe0fb0c2edb63006f83617ba20fe33d11d" },
    { "name": "ugc-3.png", "format": "png", "width": 1024, "height": 1536, "sha256": "89675fff1a66ac4cdd0daeed3dade48a33496e8527332426994b7023388c1c8a" },
    { "name": "ugc-4.png", "format": "png", "width": 1024, "height": 1536, "sha256": "ac2afc1c1e29489f01a16f2395d14e8ec4c92512767981c6367f8cfede998e4b" },
    { "name": "ugc-5.jpg", "format": "jpeg", "width": 896, "height": 1200, "sha256": "5ae1bc150ed189b12fa080c261883b8321e42cb343d8a734f483a749fb963fe6" },
    { "name": "ugc-6.jpg", "format": "jpeg", "width": 896, "height": 1200, "sha256": "e7f81c755af86572d26f113912f07f82d2a8981bd1d58176480e5d1e9123a59e" }
  ]
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/songoskriti-assets-image.mjs scripts/songoskriti-assets-expected.json src/lib/themes/songoskriti-assets.test.ts
git commit -m "feat(songoskriti): byte utilities + frozen asset expectation (21 digests)"
```

---

### Task 4: The gate

**Files:**
- Modify: `scripts/songoskriti-assets-check.mjs` (full rewrite; keep the `MANIFEST` and `pngSize` exports so the generator's import keeps working)
- Test: `src/lib/themes/songoskriti-assets.test.ts` (extend with the green path and the negative fixtures)

**Interfaces:**
- Consumes: `ASSETS`, `BUDGETS` (Task 1); `imageInfo`, `fileInfo`, `sha256` (Task 3); the expectation JSON (Task 3).
- Produces: `defaultWorld()`, `checkSongoskritiAssets(world)` from `scripts/songoskriti-assets-check.mjs`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/themes/songoskriti-assets.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSongoskritiAssets, defaultWorld } from "../../../scripts/songoskriti-assets-check.mjs";

/**
 * A minimal, known-clean world: one raster manifest entry, its file, one
 * live source file that references it, and a matching expectation entry.
 * Every fixture mutates exactly one of those.
 */
function cleanWorld() {
  const root = mkdtempSync(join(tmpdir(), "songoskriti-assets-"));
  const assetDir = join(root, "public/ph/songoskriti");
  const publicDir = join(root, "public");
  const ownedDir = join(root, "src/lib/themes/songoskriti");
  const sharedDir = join(root, "src/lib");
  mkdirSync(assetDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(ownedDir, { recursive: true });
  mkdirSync(sharedDir, { recursive: true });
  const real = join(assetDir, "cat-women.png");
  copyFileSync(resolve(ROOT, "public/ph/songoskriti/cat-women.png"), real);
  // Both roots reference the asset, so the asset stays referenced unless a
  // fixture removes the reference on purpose.
  writeFileSync(join(ownedDir, "homepage.ts"), 'image: "/ph/songoskriti/cat-women.png",');
  writeFileSync(join(sharedDir, "demo-catalog.ts"), 'image: "/ph/songoskriti/cat-women.png",');
  const manifest = [
    { name: "cat-women.png", format: "png", minWidth: 1024, minHeight: 1024, class: "category", generated: true },
  ];
  const expectation = {
    assets: [
      { name: "cat-women.png", format: "png", width: 1024, height: 1024, sha256: sha256(readFileSync(real)) },
    ],
  };
  return {
    root,
    world: {
      repoRoot: root,
      assetDir,
      publicDir,
      scanRoots: [
        { path: ownedDir, kind: "owned" },
        { path: sharedDir, kind: "shared" },
      ],
      migrationsRoot: join(root, "supabase/migrations"),
      buildRoots: [join(root, "dist")],
      manifest,
      expectation,
    },
  };
}

/** Write a line into the owned root, keeping the shared root untouched. */
function ownedSource(world: string, line: string) {
  writeFileSync(
    join(world.scanRoots[0].path, "homepage.ts"),
    `image: "/ph/songoskriti/cat-women.png",\n${line}\n`,
  );
}

function codes(result: { findings: { code: string }[]; notes: { code: string }[] }) {
  return result.findings.map((f) => f.code).sort();
}
```

Then the fixtures (each asserts the **exact** multiset):

```ts
describe("songoskriti asset gate", () => {
  it("the repository is green", () => {
    const result = checkSongoskritiAssets(defaultWorld());
    expect(result.findings.map((f) => `${f.code} ${f.path}`)).toEqual([]);
  });

  it("a clean world produces no findings", () => {
    const { world } = cleanWorld();
    expect(codes(checkSongoskritiAssets(world))).toEqual([]);
  });

  it("flags a missing file", () => {
    const { world } = cleanWorld();
    rmSync(join(world.assetDir, "cat-women.png"));
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.expectation_drift",
      "asset.missing",
    ]);
  });

  it("flags an orphan file in the asset dir", () => {
    const { world } = cleanWorld();
    copyFileSync(
      join(world.assetDir, "cat-women.png"),
      join(world.assetDir, "extra.png"),
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.duplicate",
      "asset.unexpected",
    ]);
  });

  it("flags JPEG bytes in a .png-named file against a jpeg manifest", () => {
    const { world } = cleanWorld();
    const jpeg = readFileSync(resolve(ROOT, "public/ph/songoskriti/hero-festive.jpg"));
    writeFileSync(join(world.assetDir, "cat-women.png"), jpeg);
    world.manifest[0].format = "jpeg";
    world.expectation.assets[0].format = "jpeg";
    world.expectation.assets[0].width = 1376;
    world.expectation.assets[0].height = 768;
    world.expectation.assets[0].sha256 = sha256(jpeg);
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.extension_mismatch",
      "asset.format_mismatch",
    ]);
  });

  it("flags a manifest that declares the wrong format for the file", () => {
    const { world } = cleanWorld();
    world.manifest[0].format = "jpeg";
    expect(codes(checkSongoskritiAssets(world))).toEqual([
      "asset.extension_mismatch",
    ]);
  });

  it("flags an undersized file", () => {
    const { world } = cleanWorld();
    world.manifest[0].minWidth = 4096;
    expect(codes(checkSongoskritiAssets(world))).toEqual(["asset.undersized"]);
  });

  it("flags a duplicate copy of a theme raster in another public directory", () => {
    const { world } = cleanWorld();
    const other = join(world.publicDir, "media");
    mkdirSync(other, { recursive: true });
    copyFileSync(
      join(world.assetDir, "cat-women.png"),
      join(other, "cat-women.png"),
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual(["asset.duplicate"]);
  });

  it("flags a reference to a file that is not in the manifest", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'ghost: "/ph/songoskriti/ghost.png",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["ref.unknown"]);
  });

  it("flags a dangling reference in a SHARED root too", () => {
    const { world } = cleanWorld();
    writeFileSync(
      join(world.scanRoots[1].path, "demo-catalog.ts"),
      'image: "/ph/songoskriti/ghost.png",',
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual(["ref.unknown"]);
  });

  it("does not flag a cross-theme reference in a shared root", () => {
    const { world } = cleanWorld();
    writeFileSync(
      join(world.scanRoots[1].path, "demo-catalog.ts"),
      'image: "/ph/songoskriti/cat-women.png",\nother: "/ph/somvabona/cat-men.jpg",',
    );
    expect(codes(checkSongoskritiAssets(world))).toEqual([]);
  });

  it("flags a package-form URL in an owned root", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'pkg: "assets/cat-women.png",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["url.wrong_form"]);
  });

  it("flags a cross-theme reference in an owned root", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'other: "/ph/somvabona/cat-men.jpg",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["url.cross_theme"]);
  });

  it("does not flag a placeholder-lane URL", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'ph: "/api/public/ph/womens/saree.svg",');
    expect(codes(checkSongoskritiAssets(world))).toEqual([]);
  });

  it("flags a file-shaped placeholder URL", () => {
    const { world } = cleanWorld();
    ownedSource(world, 'ph: "/api/public/ph/songoskriti/cat-women.png",');
    expect(codes(checkSongoskritiAssets(world))).toEqual(["url.wrong_form"]);
  });

  it("flags an asset nothing references", () => {
    const { world } = cleanWorld();
    writeFileSync(join(world.scanRoots[0].path, "homepage.ts"), "const nothing = 1;");
    writeFileSync(join(world.scanRoots[1].path, "demo-catalog.ts"), "const nothing = 1;");
    expect(codes(checkSongoskritiAssets(world))).toEqual(["asset.unreferenced"]);
  });

  it("flags expectation drift", () => {
    const { world } = cleanWorld();
    world.expectation.assets[0].sha256 = "0".repeat(64);
    expect(codes(checkSongoskritiAssets(world))).toEqual(["asset.expectation_drift"]);
  });
});

describe("songoskriti asset generator", () => {
  it("refuses JPEG bytes under a .png name", () => {
    const jpeg = readFileSync(resolve(ROOT, "public/ph/songoskriti/hero-festive.jpg"));
    expect(() => assertFormatMatches("cat-women.png", jpeg)).toThrow(/format/i);
    const png = readFileSync(resolve(ROOT, "public/ph/songoskriti/cat-women.png"));
    expect(() => assertFormatMatches("cat-women.png", png)).not.toThrow();
  });

  it("plans the 21 assets deterministically", () => {
    const a = buildPlan();
    const b = buildPlan();
    expect(a).toEqual(b);
    expect(a).toHaveLength(21);
    expect(a.every((p) => p.name && p.aspect && p.format)).toBe(true);
  });

  it("--check passes without a key and without network", () => {
    const out = execFileSync("node", ["scripts/gen-songoskriti-assets.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, GEMINI_API_KEY: "" },
    });
    expect(out).toMatch(/check/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: FAIL — `assertFormatMatches`/`buildPlan` are not exported, and `--check` does not exist.

- [ ] **Step 3: Rewrite the generator**

`scripts/gen-songoskriti-assets.mjs` must:

1. **Not** require `GEMINI_API_KEY` at module scope. Move the key check into the generation path only.
2. Import the manifest: `import { ASSETS, ASSET_DIR } from "./songoskriti-assets-manifest.mjs";` and drop its own 14-entry list.
3. Export `assertFormatMatches(name, bytes)`:

```js
export function assertFormatMatches(name, bytes) {
  const info = imageInfo(bytes);
  const expected = name.endsWith(".jpg") ? "jpeg" : name.endsWith(".png") ? "png" : "svg";
  if (!info.format) {
    throw new Error(`unreadable image bytes for ${name}`);
  }
  if (info.format !== expected) {
    throw new Error(
      `format mismatch for ${name}: bytes are ${info.format}, name says ${expected}`,
    );
  }
}
```

4. Export `writeAssetBytes(name, bytes)`:

```js
export function writeAssetBytes(name, bytes) {
  assertFormatMatches(name, bytes);
  writeFileSync(resolve(OUT, name), bytes);
}
```

5. Export `buildPlan()`:

```js
export function buildPlan() {
  return ASSETS.filter((a) => a.generated).map((a) => ({
    name: a.name,
    aspect: a.aspect,
    format: a.format,
  }));
}
```

6. Replace the old skip logic (which used `pngSize` and therefore treated every `.jpg` as absent) with a format-aware check:

```js
const existing = fileInfo(resolve(OUT, name));
if (!FORCE && existing && existing.format === entry.format) {
  console.log(`skip (exists ${existing.width}x${existing.height} ${existing.format}): ${name}`);
  return "skipped";
}
```

7. Add `--check`:

```js
if (CHECK) {
  const plan = buildPlan();
  const expected = JSON.parse(readFileSync(EXPECTATION_PATH, "utf8"));
  const problems = [];
  const planNames = plan.map((p) => p.name).sort();
  const expectedNames = expected.assets.map((a) => a.name).sort();
  const manifestNames = ASSETS.map((a) => a.name).sort();
  if (JSON.stringify(planNames) !== JSON.stringify(manifestNames)) {
    problems.push("plan does not cover the manifest");
  }
  if (JSON.stringify(expectedNames) !== JSON.stringify(manifestNames)) {
    problems.push("expectation does not match the manifest");
  }
  for (const rec of expected.assets) {
    const info = fileInfo(resolve(OUT, rec.name));
    if (!info) {
      problems.push(`missing: ${rec.name}`);
      continue;
    }
    if (info.sha256 !== rec.sha256) {
      problems.push(`digest differs from the expectation: ${rec.name}`);
    }
    if (info.format !== rec.format || info.width !== rec.width || info.height !== rec.height) {
      problems.push(`geometry differs from the expectation: ${rec.name}`);
    }
  }
  for (const p of plan) console.log(`plan ${p.name} ${p.aspect} ${p.format}`);
  if (problems.length > 0) {
    console.error(`songoskriti asset check RED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`songoskriti asset check GREEN — ${plan.length} planned assets match the expectation.`);
  process.exit(0);
}
```

`CHECK` is `argv.includes("--check")`; the key check must run **after** the `--check` branch. Keep the existing retry ×2, skip-on-fail and `--out` behaviour for real generation runs.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the generator check**

Run: `node scripts/gen-songoskriti-assets.mjs --check`
Expected: `songoskriti asset check GREEN — 21 planned assets match the expectation.` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-songoskriti-assets.mjs src/lib/themes/songoskriti-assets.test.ts
git commit -m "feat(songoskriti): keyless generator --check, format-aware skip, byte-format refusal"
```

---

### Task 6: Fonts, icons and the packaging boundary (vitest side)

**Files:**
- Create: `src/lib/themes/songoskriti-assets.ts`
- Test: `src/lib/themes/songoskriti-assets.test.ts` (extend)

**Interfaces:**
- Consumes: `defaultWorld` from `scripts/songoskriti-assets-check.mjs`; `FONT_FAMILIES`, `FONT_ORIGINS` from `@/lib/theme-fonts`; `FONT_PRELOAD` from `@/lib/web-vitals`; `findPackageRefs` from `@/lib/theme-asset-url`; `registryPackage` from `@/lib/themes.server`; the tabler icon module.
- Produces: `checkSongoskritiFonts()`, `checkSongoskritiPackaging(world)`.

> **Spec amendment (Task 6):** spec §5.4 places these two functions "in that test file". This plan puts them in `src/lib/themes/songoskriti-assets.ts` so they are importable, reusable and independently testable; the spec's intent (vitest-side, TypeScript) is unchanged. Amend the one sentence in the spec in this task's commit.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/themes/songoskriti-assets.test.ts`:

```ts
import {
  checkSongoskritiFonts,
  checkSongoskritiIcons,
  checkSongoskritiPackaging,
} from "./songoskriti-assets";
import { SONGOSKRITI_TOKENS } from "@/lib/themes/songoskriti/tokens";

describe("songoskriti fonts, icons and packaging", () => {
  it("every font family the theme names is in the closed catalogue", () => {
    expect(checkSongoskritiFonts()).toEqual([]);
  });

  it("the theme pairing names a Bengali-capable family", () => {
    expect(SONGOSKRITI_TOKENS.fontDisplay).toBe("Playfair Display");
    expect(SONGOSKRITI_TOKENS.fontBody).toBe("Inter");
  });

  it("every tabler icon the theme imports exists in the generated module", () => {
    expect(checkSongoskritiIcons(ROOT)).toEqual([]);
  });

  it("the official package carries no asset manifest and no package-form refs", () => {
    expect(checkSongoskritiPackaging(defaultWorld())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: FAIL — "Cannot find module './songoskriti-assets'".

- [ ] **Step 3: Implement the vitest-side checks**

Create `src/lib/themes/songoskriti-assets.ts`:

```ts
/**
 * Vitest-side asset checks: the ones that need this repo's TypeScript
 * modules (node cannot import `theme-fonts.ts`, the TSX icon module or
 * `themes.server.ts`).
 *
 * Each function returns a list of findings; an empty list is green.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FONT_FAMILIES,
  FONT_ORIGINS,
  fontStackCss,
  fontStylesheetUrl,
  themeFamilies,
} from "@/lib/theme-fonts";
import { FONT_PRELOAD } from "@/lib/web-vitals";
import { findPackageRefs } from "@/lib/theme-asset-url";
import { registryPackage } from "@/lib/themes.server";
import { SONGOSKRITI_TOKENS } from "@/lib/themes/songoskriti/tokens";
import * as tabler from "@/components/icons/tabler";

export type AssetFinding = { code: string; path: string; message: string };

const ICON_MODULE = resolve(
  import.meta.dirname,
  "..",
  "..",
  "components",
  "icons",
  "tabler.tsx",
);

/** Theme-owned files whose tabler imports must resolve. */
const ICON_CONSUMERS = [
  "src/lib/themes/songoskriti/header-presentation.tsx",
  "src/components/builder/songoskriti.tsx",
];

export function checkSongoskritiFonts(): AssetFinding[] {
  const findings: AssetFinding[] = [];
  const stack = fontStackCss(SONGOSKRITI_TOKENS.fontDisplay, "bn");
  // Only quoted family names are checked; the generic tail is exempt.
  for (const match of stack.matchAll(/"([^"]+)"/g)) {
    const family = match[1];
    if (!FONT_FAMILIES[family]) {
      findings.push({
        code: "font.unknown_family",
        path: "src/lib/themes/songoskriti/tokens.ts",
        message: `${family} is not in the font catalogue`,
      });
    }
  }
  const url = fontStylesheetUrl(SONGOSKRITI_TOKENS);
  if (!url.startsWith("https://fonts.googleapis.com/")) {
    findings.push({
      code: "font.bad_origin",
      path: "src/lib/theme-fonts.ts",
      message: `stylesheet URL is not on an approved origin: ${url}`,
    });
  }
  for (const family of themeFamilies(SONGOSKRITI_TOKENS)) {
    if (!FONT_FAMILIES[family]) {
      findings.push({
        code: "font.unknown_family",
        path: "src/lib/themes/songoskriti/tokens.ts",
        message: `${family} is not in the font catalogue`,
      });
    }
  }
  const preload = FONT_PRELOAD.stylesheet;
  if (!preload.includes("Noto+Sans+Bengali") || !preload.includes("subset=latin,bengali")) {
    findings.push({
      code: "font.bengali_not_loaded",
      path: "src/lib/web-vitals.ts",
      message: "FONT_PRELOAD does not load Noto Sans Bengali with the bengali subset",
    });
  }
  if (!FONT_ORIGINS.some((origin) => preload.startsWith(origin))) {
    findings.push({
      code: "font.bad_origin",
      path: "src/lib/web-vitals.ts",
      message: `preload stylesheet is not on an approved origin: ${preload}`,
    });
  }
  return findings;
}

/** Every tabler icon the theme imports must exist in the generated module. */
export function checkSongoskritiIcons(repoRoot: string): AssetFinding[] {
  const findings: AssetFinding[] = [];
  const exported = new Set(Object.keys(tabler));
  for (const rel of ICON_CONSUMERS) {
    const path = resolve(repoRoot, rel);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const block of text.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*"@\/components\/icons\/tabler"/g,
    )) {
      for (const raw of block[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0]?.trim();
        if (!name) continue;
        if (!exported.has(name)) {
          findings.push({
            code: "icon.unknown",
            path: rel,
            message: `${name} is not exported by ${ICON_MODULE}`,
          });
        }
      }
    }
    if (/\/(icons|sprite)\//.test(text) || /href\s*=\s*["']#icon-/.test(text)) {
      findings.push({
        code: "icon.url_ref",
        path: rel,
        message: "icon referenced as a URL instead of an inline component",
      });
    }
  }
  return findings;
}

export function checkSongoskritiPackaging(world: {
  repoRoot: string;
  publicDir: string;
  buildRoots: string[];
}): AssetFinding[] {
  const findings: AssetFinding[] = [];
  const pkg = registryPackage("songoskriti");
  const blob = JSON.stringify(pkg);
  if (/"assetManifest"/.test(blob)) {
    findings.push({
      code: "pkg.asset_manifest",
      path: "src/lib/themes.server.ts",
      message: "the official package carries an assetManifest",
    });
  }
  const packageRefs = findPackageRefs(pkg.templates);
  if (packageRefs.length > 0) {
    findings.push({
      code: "pkg.package_ref",
      path: "src/lib/themes.server.ts",
      message: `package-form refs in official templates: ${packageRefs.join(", ")}`,
    });
  }
  for (const root of world.buildRoots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      const path = resolve(entry.parentPath ?? root, entry.name);
      if (path.endsWith(".songoskriti.zip")) {
        findings.push({
          code: "pkg.official_zip",
          path,
          message: "packaged theme artifact exists",
        });
      }
    }
  }
  return findings;
}
```

`registryPackage` is importable in vitest: the existing
`src/lib/themes/frame30-acceptance.test.ts` already imports `../themes.server`
in the same environment. If that import fails, it is a regression to fix —
do **not** mock the module.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run vitest run src/lib/themes/songoskriti-assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Amend the spec sentence and commit**

```bash
# spec: "both defined in that test file" → "both defined in src/lib/themes/songoskriti-assets.ts"
git add src/lib/themes/songoskriti-assets.ts src/lib/themes/songoskriti-assets.test.ts docs/superpowers/specs/2026-10-19-songoskriti-asset-acceptance-gate-design.md
git commit -m "feat(songoskriti): font, icon and packaging checks on the vitest side"
```

---

### Task 7: The seeded catalogue repair

**Files:**
- Create: `supabase/migrations/20261019000000_songoskriti_asset_paths.sql`
- Modify: `docs/themes/creation.md` (runbook — Task 8 finishes the doc, this task writes the runbook text)

**Interfaces:**
- Consumes: the renamed file names (Task 2).
- Produces: `public.theme_apply_songoskriti_asset_paths()` and the repaired seeded rows.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261019000000_songoskriti_asset_paths.sql`:

```sql
-- songoskriti-asset-paths: current
--
-- Repairs the seeded Songoskriti catalogue after the JPEG-asset rename.
--
-- Why a function and not a bare UPDATE: the applied seed
-- (20260924_songoskriti_demo.sql) is idempotent with
--   on conflict (id) do update set ... image_url = excluded.image_url
-- and its header says it is safe to re-run. After a theme_purge_demo +
-- re-seed cycle the retired .png paths come back, and a migration is never
-- re-run (db-migrate records it as applied). The function below is keyed by
-- row id, so it can be re-applied at any time with one command:
--   select public.theme_apply_songoskriti_asset_paths();
--
-- The applied migration is NOT edited (the drift gate forbids that).

create or replace function public.theme_apply_songoskriti_asset_paths()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Renamed assets: the bytes are unchanged, the public URL is now honest.
  update public.products set image_url = '/ph/songoskriti/cat-kids.jpg'
   where id = 'e50a0000-0000-4000-8000-000000002006';
  update public.products set image_url = '/ph/songoskriti/cat-kids.jpg'
   where id = 'e50a0000-0000-4000-8000-000000002008';
  update public.products set image_url = '/ph/songoskriti/cat-men.jpg'
   where id = 'e50a0000-0000-4000-8000-000000002010';
  update public.collections set image_url = '/ph/songoskriti/hero-festive.jpg'
   where id = 'a50a0000-0000-4000-8000-000000001003';
  update public.collections set image_url = '/ph/songoskriti/hero-weaves.jpg'
   where id = 'a50a0000-0000-4000-8000-000000001004';
  update public.collections set image_url = '/ph/songoskriti/hero-artisans.jpg'
   where id = 'a50a0000-0000-4000-8000-000000001005';

  -- Dead references: two seeded products pointed at artwork that never
  -- existed. They are re-pointed to existing theme art.
  update public.products set image_url = '/ph/songoskriti/prod-panjabi.png'
   where id = 'e50a0000-0000-4000-8000-000000002003';
  update public.products set image_url = '/ph/songoskriti/cat-living.png'
   where id = 'e50a0000-0000-4000-8000-000000002004';
end;
$$;

grant execute on function public.theme_apply_songoskriti_asset_paths() to authenticated;

select public.theme_apply_songoskriti_asset_paths();
```

Verify the row ids against `supabase/migrations/20260924_songoskriti_demo.sql` before committing — the ids must be the ones that carry the retired paths:

```bash
cd /opt/frame28
grep -n "prod-kurta.png\|prod-kantha.png\|cat-kids.png\|cat-men.png\|hero-festive.png\|hero-weaves.png\|hero-artisans.png" supabase/migrations/20260924_songoskriti_demo.sql
```

Each id in the migration must appear on the line that holds the retired path. If an id differs, use the id from the seed file.

- [ ] **Step 2: Verify the migration does not contain a retired path as a value**

The migration must not contain any retired `/ph/songoskriti/….png` **value** for the nine renamed assets (it keys on ids). Confirm:

```bash
cd /opt/frame28
grep -nE "campaign-men|cat-kids|cat-men|edit-festive-main|hero-artisans|hero-festive|hero-weaves|ugc-1|ugc-2|prod-kurta|prod-kantha" supabase/migrations/20261019000000_songoskriti_asset_paths.sql
```

Expected: every hit is a `.jpg` value or a comment — **no** `.png` value for those eleven names.

- [ ] **Step 3: Verify the migration is syntactically valid**

Run: `bun run db:migrate:check` (or `node scripts/db-migrate.mjs --dry`) against the local database if one is configured; otherwise at minimum confirm the file parses as one statement group with `plpgsql` and that `bun run db:migrate:check` reports no checksum drift for the applied seed.

Expected: the applied seed `20260924_songoskriti_demo.sql` is untouched (`git diff --stat supabase/migrations/20260924_songoskriti_demo.sql` is empty) and the new file is the only migration added.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261019000000_songoskriti_asset_paths.sql
git commit -m "fix(songoskriti): repair seeded catalogue paths after the asset rename

The applied seed is idempotent and re-applies the retired .png paths on any
purge/re-seed cycle, so the repair is a re-runnable function keyed by row id
rather than a one-shot UPDATE."
```

---

### Task 8: Wiring and documentation

**Files:**
- Modify: `package.json` (two scripts + one `gates:release` entry)
- Modify: `docs/themes/creation.md` (§14.3 + runbook + status line)
- Modify: `docs/themes/songoskriti-port-map.md` (asset-path row)
- Modify: `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` (§7 allow-list amendment + §10 acceptance entry)
- Modify: `src/lib/package-zip.ts` (comment only, lines 31-32)
- Modify: `.superpowers/sdd/2026-10-18-songoskriti-unified-port/progress.md` (local, untracked — not committed)

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: the `assets:songoskriti` / `assets:songoskriti:gen` scripts and the documented rules.

- [ ] **Step 1: Wire the package.json scripts**

In `package.json`, next to the other gate scripts, add:

```json
"assets:songoskriti": "node scripts/songoskriti-assets-check.mjs",
"assets:songoskriti:gen": "node scripts/gen-songoskriti-assets.mjs --check",
```

and insert at the **head** of `gates:release` (before `perf:budget`):

```json
"gates:release": "bun run assets:songoskriti && bun run perf:budget && bun run seo:weight && bun run a11y:gate && bun run vitals:gate && bun run responsive:sweep && bun run console:gate && bun run rhythm:gate && bun run design:gate && bun run doc:gate && bun run e2e:browsers",
```

- [ ] **Step 2: Fix the misleading package-zip comment**

`src/lib/package-zip.ts` lines 31-32 currently say the 32 MB cap exists because "official Songoskriti ships ~25MB of imagery". Official themes are not archive-packaged, so the comment misleads. Replace it with a comment that states the real reason (the cap protects the review-gated upload lane) — no code change:

```ts
/* 32MB default: the cap protects the review-gated upload lane (a custom
   theme package with its own assets); it has nothing to do with official
   themes, which are source-rendered and never packaged as archives. */
```

- [ ] **Step 3: Document the rules in `docs/themes/creation.md` §14.3**

Add a subsection to §14.3 ("Schemas, assets, bilingual copy") titled **"Songoskriti asset rules"** containing:

- where theme art lives (`public/ph/songoskriti/`, referenced as `/ph/songoskriti/<file>`) and the other approved locations (`/api/public/ph/<seed>` placeholders, merchant fonts, the two Google font origins, inline tabler icons);
- the format rule: a file's bytes must match its extension, and the generator refuses to write a mismatched payload;
- the budgets (3,000,000 B per file, 28,000,000 B total, 2.0 B/px PNG, 1.0 B/px JPEG);
- the gate command (`bun run assets:songoskriti`) and the generator check (`bun run assets:songoskriti:gen`);
- the seed runbook:

```markdown
### Seeded catalogue paths

The seeded Songoskriti catalogue is repaired by
`supabase/migrations/20261019000000_songoskriti_asset_paths.sql`, which
creates `public.theme_apply_songoskriti_asset_paths()`. The applied seed
re-applies the retired paths after any demo purge, so re-apply them after a
re-seed:

```sql
select public.theme_apply_songoskriti_asset_paths();
```

Verify afterwards that no retired path remains:

```sql
select image_url from public.products
 where image_url like '/ph/songoskriti/%' and image_url ~ '\.png$'
   and image_url not in ('/ph/songoskriti/prod-panjabi.png',
                         '/ph/songoskriti/prod-saree.png',
                         '/ph/songoskriti/prod-necklace.png',
                         '/ph/songoskriti/cat-women.png',
                         '/ph/songoskriti/cat-newin.png',
                         '/ph/songoskriti/cat-living.png',
                         '/ph/songoskriti/cat-jewelry.png');
```
```

**Wording check before committing** (the doc gate is CI): the new prose must not put `official` with `downloadable`/`ZIP`, `Songoskriti` with `package`/`downloadable`/`ZIP`, or `official theme(s)` with `Level B` on one line. Run `node scripts/doc-gate.mjs` — it must report 0 findings.

- [ ] **Step 4: Refresh the `docs/themes/creation.md` status line**

```bash
cd /opt/frame28
git rev-parse --short=12 HEAD
```

Put that sha on the `Last verified: <date> @ <sha>` line — **before** the commit that adds it, never that commit's own sha.

- [ ] **Step 5: Update the port map**

In `docs/themes/songoskriti-port-map.md`, update the asset-path row (around lines 160-162) to name the current file set and the gate:

```markdown
| theme art | `public/ph/songoskriti/` (21 assets) referenced as `/ph/songoskriti/<file>` | `bun run assets:songoskriti` |
```

- [ ] **Step 6: Amend the port spec**

In `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md`:

- §7 **Editable** — extend the bullet to name the new scripts and the escalated files:

```markdown
**Editable:** … `scripts/**` (including the Songoskriti asset gate scripts
`scripts/songoskriti-assets-{manifest,image,check}.mjs`,
`scripts/songoskriti-assets-expected.json` and
`scripts/gen-songoskriti-assets.mjs`) …
```

- §10 — add an acceptance entry:

```markdown
- [ ] Songoskriti asset correctness is green: `bun run assets:songoskriti` reports zero findings and `bun run assets:songoskriti:gen` reproduces the expected output set without a key.
```

- Do **not** change §7's **Prohibited** list; the escalated core edits are recorded in the asset gate spec §9.3 and approved by the owner.

- [ ] **Step 7: Update the local SDD ledger**

Append to `.superpowers/sdd/2026-10-18-songoskriti-unified-port/progress.md` (local, untracked — never `git add` it): the root cause (JPEG bytes under `.png` names, a stale 15-entry manifest, three dangling editorial refs, two dead seeded products), the fix, the verification evidence, and the escalation record.

- [ ] **Step 8: Commit**

```bash
git add package.json src/lib/package-zip.ts docs/themes/creation.md docs/themes/songoskriti-port-map.md docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md
git commit -m "chore(songoskriti): wire the asset gate and document the asset rules"
```

---

### Task 9: Full verification

**Files:**
- No file changes expected. Any change means something above is wrong.

- [ ] **Step 1: Run the gate**

```bash
cd /opt/frame28
node scripts/songoskriti-assets-check.mjs; echo "exit=$?"
```
Expected: `songoskriti asset gate — 0 finding(s), N note(s).` and `exit=0`.

- [ ] **Step 2: Run the generator check**

```bash
node scripts/gen-songoskriti-assets.mjs --check; echo "exit=$?"
```
Expected: `songoskriti asset check GREEN — 21 planned assets match the expectation.` and `exit=0`.

- [ ] **Step 3: Run the whole test suite**

```bash
bun run test
```
Expected: all suites pass. The known pre-existing failure in `src/lib/site.server.test.ts` (an environment flake) may still appear — it is **not** caused by this work and that file is off-limits; confirm its status matches the pre-change baseline and say so in the report.

- [ ] **Step 4: Typecheck, lint and format the touched files**

```bash
bun run typecheck
bun run lint
bunx prettier --check scripts/songoskriti-assets-manifest.mjs scripts/songoskriti-assets-image.mjs scripts/songoskriti-assets-check.mjs scripts/songoskriti-assets-expected.json scripts/gen-songoskriti-assets.mjs src/lib/themes/songoskriti-assets.ts src/lib/themes/songoskriti-assets.test.ts src/lib/themes/songoskriti-asset-paths.test.ts
```
Expected: typecheck clean, lint clean, prettier reports only files this change touched. (Repo-wide `prettier --check .` is pre-existing red — not an acceptance criterion.)

- [ ] **Step 5: Verify the doc gate and the tree state**

```bash
node scripts/doc-gate.mjs; echo "exit=$?"
git status --short
```
Expected: doc gate exits 0; `git status` shows only the three known churn files (`.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf`) and the untracked `.output-snapshots/`.

- [ ] **Step 6: Record the database-side verification as pending**

The seeded catalogue lives in PostgreSQL, which this environment does not
reach. The plan verifies the migration's *content* (Task 7) and publishes the
query in the runbook (Task 8), but the actual result is an **operator step**:

```sql
select public.theme_apply_songoskriti_asset_paths();
select image_url from public.products
 where image_url = any (array['/ph/songoskriti/campaign-men.png',
   '/ph/songoskriti/cat-kids.png', '/ph/songoskriti/cat-men.png',
   '/ph/songoskriti/edit-festive-main.png', '/ph/songoskriti/hero-artisans.png',
   '/ph/songoskriti/hero-festive.png', '/ph/songoskriti/hero-weaves.png',
   '/ph/songoskriti/ugc-1.png', '/ph/songoskriti/ugc-2.png',
   '/ph/songoskriti/prod-kurta.png', '/ph/songoskriti/prod-kantha.png']);
-- must return 0 rows
```

Report this as **pending operator verification** in the final summary — do not
claim the seeded catalogue is repaired until the query has actually run.

- [ ] **Step 7: Preview smoke**

Start the preview (`bun run dev` or the built server) and confirm the renamed assets return 200 and the repaired editorial art renders:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ph/songoskriti/hero-festive.jpg
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ph/songoskriti/cat-men.jpg
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ph/songoskriti/ugc-1.jpg
```
Expected: `200` for each, and the preview pages render with unchanged layout.

- [ ] **Step 8: Report**

Summarise: the commits made, the gate's output, the test results, the pre-existing failures that were **not** touched, and the operator step for the seeded catalogue (re-apply the paths after any demo re-seed). No deploy is performed by this plan.
