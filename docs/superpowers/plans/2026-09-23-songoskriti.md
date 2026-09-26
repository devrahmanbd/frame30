> **Superseded (2026-09-26):** authoritative guides are
> [Builder README](../04-builder/README.md) and
> [Theme authoring](../themes/creation.md). Kept as history; do not edit.

# Songoskriti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship installable, previewable `songoskriti` heritage theme with demo data and motion.

**Architecture:** Additive preset pack on the restored engine: `src/lib/themes/songoskriti/` (tokens/header/footer/homepage), restored preview route, marketplace listing via existing install flow, demo seed migration, additive `songoskriti` demo-catalog key. Widgets appended to catalogs only for proven gaps.

**Tech Stack:** TanStack Start, React 19, Tailwind v4, GSAP 3.15.0, Vitest, Supabase migrations.

**Spec:** `docs/superpowers/specs/2026-09-23-songoskriti-design.md` (rev 3, review-approved)

## Global Constraints

- Single new key `songoskriti`; additive changes only (existing 6 demo verticals untouched).
- Work in `/tmp/opencode/songoskriti` worktrees; branch PRs; no deploy without explicit order.
- TDD with failing test first; targeted `vitest run <files>` + `tsc --noEmit` on touched files.
- `GEMINI_API_KEY` from env only; generation blocked until owner confirms key rotation.
- Copy: no invented metrics; one `cta-primary` per section; sentence case.

## Review Focus

- Empty `slides`/`items` arrays render graceful placeholders, never blank sections or 500s.
- Missing image files fall back to `/api/public/ph` art (never broken `<img>`).
- Reduced-motion users get static first slide and no scroll animation.
- Bengali strings render without layout shift at the same optical size.
- Merchant with no menus still renders menubar (manual-item fallback).

---

### Task 1: Theme scaffold (tokens, header, footer, homepage shell)

**Files:**

- Create: `src/lib/themes/songoskriti/tokens.ts`, `header.ts`, `footer.ts`, `homepage.ts`, `index.ts`, `types.ts`
- Test: `src/lib/themes/songoskriti/wiring.test.ts`

**Interfaces:**

- Consumes: `ThemeTokens`, `Section`, `SectionBuilder` types from `src/lib/builder-ast`; `DEFAULT_PERMALINKS` shape for hrefs (`/c/*`, `/pages/*`).
- Produces: `SONGOSKRITI_TOKENS: ThemeTokens`, `buildHomepageMain(s): Section[]`, `buildHeaderMain(s)`, `buildFooterMain(s)` for Task 2 + Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/themes/songoskriti/wiring.test.ts
import { describe, expect, it } from "vitest";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { buildHomepageMain } from "./homepage";

describe("songoskriti wiring", () => {
  it("locks brand tokens", () => {
    expect(SONGOSKRITI_TOKENS.brand).toBe("#8A3B1F");
    expect(SONGOSKRITI_TOKENS.surface).toBe("#FAF8F5");
  });
  it("homepage builds 8 sections in order", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const types = buildHomepageMain(s as never).map((n) => n.type);
    expect(types).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "finder_row",
      "product_rail",
      "craft_story",
      "testimonials",
      "trust_footer",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vitest run src/lib/themes/songoskriti/wiring.test.ts`
Expected: FAIL with "No such file" (modules don't exist)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/themes/songoskriti/tokens.ts
import type { ThemeTokens } from "../../builder-ast";
export const SONGOSKRITI_TOKENS: ThemeTokens = {
  brand: "#8A3B1F",
  accent: "#C45D3E",
  surface: "#FAF8F5",
  ink: "#2D2A26",
  radius: "4px",
  container: "1320px",
  density: "airy",
  typeScale: "expressive",
  fontPairing: "editorial-serif",
  fontDisplay: "Playfair Display",
  fontBody: "Inter",
  shadow: "soft",
  motion: "subtle",
} as ThemeTokens;
```

`header.ts` / `footer.ts` / `homepage.ts`: section-builder calls with EN + `_bn` twins per string, hrefs from `DEFAULT_PERMALINKS` bases. `index.ts` re-exports all four.

- [ ] **Step 4: Run test to verify it passes**

Run: `vitest run src/lib/themes/songoskriti/wiring.test.ts`
Expected: PASS (adjust section-type names to catalog entries that exist after Task 2 audit; if a type is missing, note it as Task 2 input and use the closest existing type temporarily)

- [ ] **Step 5: Typecheck touched files**

Run: `tsc --noEmit -p tsconfig.json` filtered to `songoskriti`
Expected: zero errors in new files

- [ ] **Step 6: Commit**

```bash
git add src/lib/themes/songoskriti/
git commit -m "feat(songoskriti): theme scaffold with tokens + homepage shell"
```

### Task 2: Widget gap audit + build (append-only)

**Files:**

- Modify: `src/lib/builder-ast.ts` (append catalog entries only), `src/lib/studio/catalog.ts` (append defs only)
- Create: `src/components/builder/songoskriti.tsx` (only if a gap is proven missing)
- Test: extend `src/lib/studio/catalog.test.ts` PORTED list; new `src/components/builder/songoskriti.test.tsx` if renderers created

**Interfaces:**

- Consumes: Task 1 section-type list (the 8 types the homepage needs).
- Produces: every homepage type resolvable via `catalogEntry(type)` + `WIDGET_BY_KEY[type]`; parity report.

- [ ] **Step 1: Write the audit as a failing test** — for each of the 8 types, assert `catalogEntry(type)` and `WIDGET_BY_KEY[type]` exist. Plus empty-state test: `hero_carousel` (or current carousel type) with `slides: []` and rails with `items: []` render placeholders, never throw. Run: RED on missing ones.
- [ ] **Step 2: Implement missing entries** — append catalog entries (steel-man defaults, `_bn` twins) + Studio defs; renderers only if no generic renderer covers the type (check `SectionRenderer` + studio `renderers.tsx` first).
- [ ] **Step 3: Run** `vitest run src/lib/studio/catalog.test.ts` + touched suites — GREEN.
- [ ] **Step 4: Update** catalog-controls-defaults parity test for every new widget.
- [ ] **Step 5: Commit** `feat(songoskriti): catalog gaps for heritage widgets`

### Task 3: Imagery (BLOCKED on key rotation until owner confirms)

**Files:**

- Create: `scripts/gen-songoskriti-assets.mjs`, `public/ph/songoskriti/` (15 files per spec manifest)
- Test: `scripts/gen-songoskriti-assets.test.mjs`? No — verification is file-existence + dimensions gate: `scripts/asset-gate.mjs` extension or a new `scripts/songoskriti-assets-check.mjs` asserting 15 files exist with minimum dimensions.

**Interfaces:**

- Consumes: manifest from spec §4.
- Produces: files referenced by Task 4 blueprint seeds; fallback rule (file-if-exists else `/api/public/ph`).

- [ ] **Step 1: Write the check script first** asserting all 15 paths + min dimensions; run → RED (files missing).
- [ ] **Step 2: Implement generator** — Imagen REST `POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict`, key from `process.env.GEMINI_API_KEY` (throw if absent, never log it), retry ×2 per asset, skip-on-fail with warning (fallback covers it).
- [ ] **Step 3: Run generator only after owner confirms rotation**; run check script → GREEN (or documented fallbacks for failed assets).
- [ ] **Step 4: Commit** assets + script (never the key).

### Task 4: Demo seed + blueprints + marketplace listing

**Files:**

- Create: `supabase/migrations/20260924_songoskriti_demo.sql`, `src/lib/themes/songoskriti/blueprints.ts` (if engine needs per-theme blueprints; else homepage.ts suffices — verify against `theme-blueprints.ts` absence)
- Modify: `src/lib/demo-catalog.ts` (ADD `songoskriti` key only), `src/lib/themes/catalog-meta.ts` (add listing entry if that file drives the marketplace card)
- Test: extend `src/lib/phase4-demo-catalog.test.ts` (songoskriti consistency), new `marketplace-songoskriti.test.ts` (listing present, install path resolves key)

**Interfaces:**

- Consumes: Task 1 builders, Task 3 asset files (or fallback paths).
- Produces: installable key `songoskriti` end-to-end.

- [ ] **Step 1: Failing tests** — listing resolves `songoskriti`; demo catalog has `songoskriti` key with ≥1 product/category/collection; seed SQL parses. Run RED.
- [ ] **Step 2: Implement** — seed migration (BDT minor units, `_bn` twins, homepage designation), catalog key, listing entry.
- [ ] **Step 3: Run** touched suites GREEN + `tsc` clean on touched files.
- [ ] **Step 4: Commit** `feat(songoskriti): demo seed + listing`

### Task 5: Preview route restore + motion + engine smoke

**Files:**

- Create: `src/routes/theme-preview.$key.tsx` (restore from `dddfdc2^`, verify), `src/components/builder/songoskriti-motion.ts`
- Test: `src/lib/theme-preview-nav.test.ts` extension (songoskriti key resolves); motion covered by visual verification + `prefers-reduced-motion` unit test on the controller (static-first-slide branch)

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces: working `/theme-preview/songoskriti` + motion controller honoring reduced motion.

- [ ] **Step 1: Restore route**, failing test first (key resolves, unknown key 404s). RED → GREEN.
- [ ] **Step 2: Motion controller** — hero timeline + batch reveals + carousel controller per spec §3; reduced-motion branch unit-tested.
- [ ] **Step 3: Engine smoke** — install via Appearance, custom CSS open, menu pick, preview render, publish, demo import, sitemap/canonical present. Log results; failures become gap reports, not engine rewrites.
- [ ] **Step 4: Commit** `feat(songoskriti): preview + motion + smoke`

### Task 6: Verification + gates

**Files:**

- Test: screenshots (manual browser pass, saved as PR evidence), existing gates.

**Interfaces:**

- Consumes: Tasks 1–5.

- [ ] **Step 1:** `theme-preview/songoskriti` screenshots desktop + mobile, zero console errors.
- [ ] **Step 2:** a11y ≥ 90, CLS < 0.1, LCP < 2.5s; 4-width matrix (snapshot + screenshot each).
- [ ] **Step 3:** Full `vitest run` on all touched suites + `tsc --noEmit` zero new vs merge-base + `vite build` exit 0.
- [ ] **Step 4:** Open PR (branch-only). No deploy without explicit owner order.
