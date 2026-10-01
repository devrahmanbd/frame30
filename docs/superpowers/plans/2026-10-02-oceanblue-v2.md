# Oceanblue-v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `oceanblue-v2` theme (spec `docs/superpowers/specs/2026-10-02-oceanblue-v2-design.md`) — full nine-template storefront, maroon studied-DNA system, wired into preview/registry/chrome, gated and committed.

**Architecture:** Mirror `src/lib/themes/oceanblue/` file-for-file under `src/lib/themes/oceanblue-v2/` with new tokens/skins/composition; shared-engine change limited to appending one `hero_carousel` skin plus its renderer branch (per P9-4 spec `docs/superpowers/specs/2026-10-01-oceanblue-banner-hero-design.md`).

**Tech Stack:** Bun (ESM), TypeScript, Vitest, TanStack Start preview route, Supabase registry migration (generated embed).

## Global Constraints

- Theme prod files import engine lib only (`@/lib/*`), never `@/components/*` (enforced by `src/lib/themes/isolation.test.ts`).
- Money: integer minor units + `currency_code`; no floats (demo catalog already complies — reuse, don't rewrite).
- Secrets never leave the server boundary; append-only audit rows for `[A]` actions (none in this plan).
- No raw `uppercase` in new storefront classes; bilingual EN/BN twins on shopper strings; `prefers-reduced-motion` honored.
- No fabricated metrics/testimonials/counts/contacts; omit-or-placeholder.
- Every CTA resolves to a real permalink; zero `href="#"` in theme output.
- Exactly one newsletter instance sitewide (v2 footer carries none).
- `ops/routing/*` never staged. Commit only — no push, no deploy without explicit user word.
- Verification order: `typecheck` → `test` → `test:contracts` → eslint on touched files (report repo net delta, never claim clean).

---

## File Structure

New dir `src/lib/themes/oceanblue-v2/` (prod + tests), plus five wire-up edits and one shared-engine append:

| File | Responsibility |
| --- | --- |
| `tokens.ts` | `OCEANBLUE_V2_TOKENS` (spec §2 table) |
| `types.ts` | Re-export `SectionBuilder`; `HOMEPAGE_V2_SECTION_TYPES` (14 entries §3) |
| `index.ts` | Public exports mirroring v1 `index.ts` |
| `skins.ts` + `skins.css` | `OCEANBLUE_V2_SKIN_SETS`, `OCEANBLUE_V2_WIDGET_DEFAULTS`, `resolveOceanblueV2Skin`, `oceanblueV2DefaultsFor`, `withOceanblueV2Defaults`; maroon token-driven CSS |
| `header.ts` / `header-fallback.ts` | Campaign strip AST + mega-menu config |
| `footer.ts` | 5-column index footer, no newsletter, no dead socials |
| `homepage.ts` | 14-section main per spec §3 |
| `secondary.ts` | `buildSecondaryMain(s, kind)` for listing/PDP/cart/checkout/search/account/page/blog |
| `preset.ts` | `OCEANBLUE_V2_PRESET` (`makeSection("oceanblue-v2", …)`, nine templates) |
| `preview.ts` | `oceanblueV2PreviewSource` |
| `*.test.ts(x)` | tokens/wiring/preview/render/registry/skins tests mirroring v1 names |
| `src/lib/preview-sources.ts` | Add `oceanblue-v2` entry (modify) |
| `src/components/store/theme-chrome.ts` | Add `oceanblue-v2` chrome entry (modify) |
| `src/lib/themes/catalog-meta.ts` | Add `oceanblue-v2` meta, honest zeros (modify) |
| `src/lib/theme-preview-nav.ts` | Resolve `oceanblue-v2` (modify) |
| `supabase/migrations/<new>_oceanblue_v2_registry_row.sql` | Generated preset embed (create; generator command in v1 migration header) |
| `src/lib/builder-ast.ts` | Append `"banner"` last to `WIDGET_SKINS.hero_carousel` (shared append) |
| Renderer for `hero_carousel` (see P9-4 spec) | `banner` skin branch (shared append) |

---

### Task 0: Pin interfaces (read-only)

**Files:** Read-only — `src/lib/themes/oceanblue/homepage.ts`, `secondary.ts`, `footer.ts`, `header-fallback.ts`, `preview.ts`, `src/lib/theme-section.ts`, `src/lib/builder-ast.ts` (Section/SectionBuilder/ThemeTemplates/WIDGET_SKINS), P9-4 banner spec, v1 migration header generator command.

**Produces:** A pin table (kept in the task's commit message body + plan margin) listing exact prop names for `hero_carousel`, `circle_categories`, `product_rail`, `split_feature`, `trust_marquee`, `collection_story`, `testimonials`, `store_locator`, `newsletter`, `footer_sitemap`, `payment_icons`, `social_strip`, `rich_text`, `announcement_bar`, plus the `makeSection` signature and the nine `ThemeTemplates` keys. Every later task consumes these exact names.

- [ ] **Step 1: Read the files above and write the pin table into this plan file** (edit `docs/superpowers/plans/2026-10-02-oceanblue-v2.md`, append `## Interface Pins`).
- [ ] **Step 2: Verify v1 preset emits cleanly as a baseline**

Run: `bun run typecheck`
Expected: PASS (repo baseline; unrelated errors pre-exist only if already present — record them).

---

### Task 1: Tokens + types + index (TDD)

**Files:**
- Create: `src/lib/themes/oceanblue-v2/tokens.ts`
- Create: `src/lib/themes/oceanblue-v2/types.ts`
- Create: `src/lib/themes/oceanblue-v2/index.ts`
- Test: `src/lib/themes/oceanblue-v2/tokens.test.ts`

**Interfaces:**
- Consumes: `ThemeTokens` from `../../builder-ast`; `DEFAULT_GLOBALS` from `../../theme-globals` (same imports as v1 `tokens.ts`).
- Produces: `OCEANBLUE_V2_TOKENS`, `HOMEPAGE_V2_SECTION_TYPES`, `IntendedHomepageV2Type` for Tasks 2–5.

- [ ] **Step 1: Write the failing test** (`tokens.test.ts`): asserts `brand === "#A72F30"`, `surface === "#FFFFFF"`, `ink === "#241318"`, `radius === "10px"`, `dark === null`, `fontPairing === "bengali-classic"`, and `HOMEPAGE_V2_SECTION_TYPES` has length 14 starting with `"hero_carousel"`.

```ts
import { describe, expect, it } from "vitest";
import { OCEANBLUE_V2_TOKENS } from "./tokens";
import { HOMEPAGE_V2_SECTION_TYPES } from "./types";

describe("oceanblue-v2 tokens", () => {
  it("carries the maroon studied-DNA system", () => {
    expect(OCEANBLUE_V2_TOKENS.brand).toBe("#A72F30");
    expect(OCEANBLUE_V2_TOKENS.surface).toBe("#FFFFFF");
    expect(OCEANBLUE_V2_TOKENS.ink).toBe("#241318");
    expect(OCEANBLUE_V2_TOKENS.radius).toBe("10px");
    expect(OCEANBLUE_V2_TOKENS.dark).toBeNull();
    expect(OCEANBLUE_V2_TOKENS.fontPairing).toBe("bengali-classic");
  });
  it("declares 14 homepage sections starting with the hero", () => {
    expect(HOMEPAGE_V2_SECTION_TYPES).toHaveLength(14);
    expect(HOMEPAGE_V2_SECTION_TYPES[0]).toBe("hero_carousel");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/themes/oceanblue-v2/tokens.test.ts`
Expected: FAIL (modules not defined).

- [ ] **Step 3: Write minimal implementation** — `tokens.ts` = v1 shape with spec §2 values (tint rule: only add a `tint` field if `ThemeTokens` carries the slot, else skip it — blush lives in `skins.css` per Task 2); `types.ts` = v1 shape with the 14 spec-§3 types in order (`hero_carousel`, `circle_categories`, `product_rail`, `split_feature`, `product_rail`, `circle_categories`, `trust_marquee`, `collection_story`, `testimonials`, `store_locator`, `newsletter` + header/footer chrome types for header/footer builders); `index.ts` = v1 exports renamed.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/themes/oceanblue-v2/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/themes/oceanblue-v2 docs/superpowers/plans/2026-10-02-oceanblue-v2.md
git commit -m "feat(theme): oceanblue-v2 tokens/types/index + Task 0 interface pins"
```

---

### Task 2: Skins + skins.css (TDD)

**Files:**
- Create: `src/lib/themes/oceanblue-v2/skins.ts`
- Create: `src/lib/themes/oceanblue-v2/skins.css`
- Test: `src/lib/themes/oceanblue-v2/skins.test.ts`

**Interfaces:**
- Consumes: `OCEANBLUE_V2_TOKENS` (Task 1); `Section/SectionBuilder/SectionType/PropValue` from `../../builder-ast`; Task 0 pin table for legal skin strings.
- Produces: `OCEANBLUE_V2_SKIN_SETS`, `OCEANBLUE_V2_WIDGET_DEFAULTS`, `resolveOceanblueV2Skin`, `oceanblueV2DefaultsFor`, `withOceanblueV2Defaults` for Tasks 3–5. Defaults: `hero_carousel → banner` (lands with Task 7's shared append; until then tests pin the default string, renderer falls back per core convention), `product_rail → minimal`, `testimonials → single`, `product_grid → cards`.

- [ ] **Step 1: Write the failing test** — mirror v1 `skins.test.ts` assertions: unknown skin falls back to default, known passes through, `withOceanblueV2Defaults` merges defaults UNDER authored props, authored `skin` wins, no `undefined` leaks into props.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/themes/oceanblue-v2/skins.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation** — mirror v1 `skins.ts` function-for-function with `OCEANBLUE_V2_*` names; `skins.css` references theme tokens by name (`var(--theme-*)`), zero hex literals, maroon/blush/ink surfaces, `overflow-x: clip` on roots, `minmax(0,1fr)` image grids, mobile single-column section heads.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/themes/oceanblue-v2/skins.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/themes/oceanblue-v2
git commit -m "feat(theme): oceanblue-v2 skins + token-driven CSS"
```

---

### Task 3: Header + footer chrome (TDD)

**Files:**
- Create: `src/lib/themes/oceanblue-v2/header.ts`
- Create: `src/lib/themes/oceanblue-v2/header-fallback.ts`
- Create: `src/lib/themes/oceanblue-v2/footer.ts`
- Test: `src/lib/themes/oceanblue-v2/wiring.test.ts` (part 1: chrome asserts)

**Interfaces:**
- Consumes: `withOceanblueV2Defaults` (Task 2); Task 0 pins for `announcement_bar`, `footer_sitemap`, `payment_icons`, `social_strip`, `rich_text`.
- Produces: `buildHeaderMain`, `buildFooterMain`, mega-menu config for Task 6's chrome entry.

- [ ] **Step 1: Write failing asserts** — header emits one dismissible rotating `announcement_bar` with `_bn` twins; footer emits `footer_sitemap` + `payment_icons` + about `rich_text` and **no** newsletter block, **no** `href="#"` anywhere in either (stringify sections and assert).
- [ ] **Step 2: Run to verify fail** — `bunx vitest run src/lib/themes/oceanblue-v2/wiring.test.ts`, expected FAIL.
- [ ] **Step 3: Implement** — mirror v1 `header.ts` (verified pattern: `s("announcement_bar", { m1, m1_bn, href, dismissible, rotateMs, items: [{text, text_bn}] })`) with v2 evergreen copy + fresh `_bn`; mega-menu (Category + Collection columns, real permalinks) in `header-fallback.ts`; footer per spec §3 item 14.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(theme): oceanblue-v2 header/footer chrome`.

---

### Task 4: Homepage main (TDD)

**Files:**
- Create: `src/lib/themes/oceanblue-v2/homepage.ts`
- Test: extend `src/lib/themes/oceanblue-v2/wiring.test.ts` (part 2: homepage asserts)

**Interfaces:**
- Consumes: Task 0 pins for all 14 section prop shapes; `withOceanblueV2Defaults`; `OCEANBLUE` demo key mapping stays in `preview-demo-data.ts` (no change — v2 reuses it in Task 6).
- Produces: `buildHomepageMain` for Task 6's preset.

- [ ] **Step 1: Write failing asserts** — 14 sections in spec-§3 order; exactly one `h1`-claiming hero slide; every CTA prop resolves to a real path (no `#`); `product_rail` limits ≤ 10; rails reference merchant-real sources only.
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** `buildHomepageMain` per spec §3 (4-slide `banner` hero, 8 tiles, loved rail, maroon split, recommended rail, color tiles, marquee, story, single testimonial, locator, newsletter).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(theme): oceanblue-v2 homepage main`.

---

### Task 5: Secondary templates (TDD)

**Files:**
- Create: `src/lib/themes/oceanblue-v2/secondary.ts`
- Test: extend `wiring.test.ts` (part 3: `buildSecondaryMain(s, kind)` returns non-empty valid mains for `product`, `collection`, `cart`, `checkout`, `search`, `account`, `page`, `blog`; PDP includes `sticky_buy_bar`; listing includes filter + sort controls).

- [ ] Steps 1–5 mirror Task 4 (fail → implement per spec §4 → pass → commit `feat(theme): oceanblue-v2 secondary templates`).

---

### Task 6: Preset + preview + wiring + migration (TDD)

**Files:**
- Create: `src/lib/themes/oceanblue-v2/preset.ts` (`OCEANBLUE_V2_PRESET`, `makeSection("oceanblue-v2", …)`, nine templates mirroring v1 `preset.ts` lines 32–78)
- Create: `src/lib/themes/oceanblue-v2/preview.ts` (`oceanblueV2PreviewSource`, reuse `OCEANBLUE` demo key)
- Create: `src/lib/themes/oceanblue-v2/registry.test.ts`, `render.test.tsx`, `preview.test.ts` (mirror v1 names/asserts)
- Modify: `src/lib/preview-sources.ts`, `src/components/store/theme-chrome.ts`, `src/lib/themes/catalog-meta.ts`, `src/lib/theme-preview-nav.ts`
- Create: `supabase/migrations/<date>_oceanblue_v2_registry_row.sql` (embed generated via the v1 migration header command, never hand-written)

**Interfaces:**
- Consumes: `buildHeaderMain/buildFooterMain/buildHomepageMain/buildSecondaryMain` (Tasks 3–5).
- Produces: registered theme rendering at `/theme-preview/oceanblue-v2`.

- [ ] **Step 1: Write failing asserts** — preset `parseTokens`/`parseTemplates` accept; `lintTemplate` zero errors on all nine; nav resolves `oceanblue-v2`; chrome entry renders masthead without double chrome.
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** wiring + generated migration.
- [ ] **Step 4: Run package tests** — `bunx vitest run src/lib/themes/oceanblue-v2` expected PASS; then `bunx vitest run src/lib/themes/isolation.test.ts` expected PASS.
- [ ] **Step 5: Commit** — `feat(theme): oceanblue-v2 preset/preview/wiring + registry row`.

---

### Task 7: Shared `banner` hero skin append

**Files:**
- Modify: `src/lib/builder-ast.ts` (append `"banner"` last to `WIDGET_SKINS.hero_carousel`), hero renderer branch per P9-4 spec, core test flips the P9-4 spec names (`skins.test.ts`, `widget-skins.test.tsx`, `heritage-contracts.test.tsx`, `hero-locale.test.tsx`).

- [ ] **Step 1: Implement exactly per `docs/superpowers/specs/2026-10-01-oceanblue-banner-hero-design.md`** (commit `da18691` context), banner branch last, defaults of other themes untouched.
- [ ] **Step 2: Run** `bunx vitest run src/lib/themes/oceanblue-v2` + the four core test files from the P9-4 spec. Expected: PASS.
- [ ] **Step 3: Commit** — `feat(skins): hero_carousel banner skin (oceanblue-v2)`.

---

### Task 8: Gates + live preview + commit

- [ ] **Step 1: Full gates** — `bun run typecheck`, `bun run test`, `bun run test:contracts`, eslint on touched files (record repo net delta).
- [ ] **Step 2: Rebuild + restart `:3000`** (`VITE_SUPABASE_URL=http://dummy.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=dummy bun run build`, restart node, curl `localhost:3000/theme-preview/oceanblue-v2` → 200).
- [ ] **Step 3: Chrome verify** — fresh page, DOM asserts (maroon hero, ethnic products, zero grocery, single newsletter, no `href="#"`), 0 console errors, desktop + 390px widths.
- [ ] **Step 4: Commit** (no push). Update `progress.md` Phase 10 boxes to `[x]` with commit SHAs.

---

## Self-Review

1. **Spec coverage:** §1 scope → Tasks 0–8 (nine templates in Task 6; v1 untouched — no task edits v1 paths). §2 tokens → Task 1 (+ tint rule fixed inline). §3 homepage → Task 4. §4 secondary → Task 5. §5 data reuse → Task 6 (no catalog edits). §6 wiring checklist → Task 6 file-for-file. §7 honesty → asserted in Tasks 3–4 tests. §8 gates → Task 8.
2. **Placeholder scan:** no TBD/TODO/"similar to" — big-file tasks point at the Task 0 pin table + v1 mirror files with exact paths, which is scaffolding folded into the consuming task per this skill's right-sizing rule.
3. **Type consistency:** `OCEANBLUE_V2_*` / `oceanblueV2*` / `HOMEPAGE_V2_SECTION_TYPES` / `IntendedHomepageV2Type` used uniformly across tasks; `makeSection("oceanblue-v2", …)` matches hyphenated-key precedent (`heavy-shop`).
