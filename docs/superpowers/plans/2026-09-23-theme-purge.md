# Full Theme Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the entire theming system — code, DB registry, and every mention — leaving a single themeless storefront path.

**Architecture:** Delete theme-owned modules outright; decouple shared modules (builder AST, storefront chrome) by removing theme branches while keeping section/widget rendering; retire DB tables via additive migration (stop writing, leave historical rows, drop reads); stores render Studio/builder content with default chrome, no tokens.

**Tech Stack:** TanStack Start, React 19, Tailwind v4, Vitest, Supabase migrations, CircleCI gates.

**Spec:** User order 2026-09-23 — "remove all themes including clothing heritage, everything, every mention of any theme" (scope 2: code + DB registry). No design doc; deletion spec is this plan.

## Global Constraints

- One theme only was prior policy; now zero themes. No new theme keys, no replacement theme system.
- Isolated worktrees under /tmp/opencode/<track>, NEVER /opt/frame28 directly until integration.
- TDD: extend/touch test files first where behavior changes; deleted modules delete their tests with them.
- Targeted `vitest run <files>` + `tsc --noEmit` on touched files only (CI owns full suite).
- No hotlinked stock photography; no new dependencies.
- Branch-only, no deploy, no push to main without explicit user order.
- Ruling (controller): themeless fallback = Studio/builder content + default chrome, zero theme tokens. If wrong, live stores render unstyled-but-complete instead of Welcome-flat. Recorded 2026-09-23.

## Review Focus

- Storefront with previously ACTIVE theme renders complete content with default chrome (not blank, not 500).
- No import in src references a deleted theme module (tsc proves it).
- No live read path queries theme_registry/store_themes (grep proves it).
- theme-preview route + marketplace theme cards gone or return 404, never half-render.
- Migration applies cleanly on top of 20260922120000 (backfill direction verified).

---

### Task 1: Delete clothing-heritage + heritage renderers

**Files:**

- Delete: `src/lib/themes/clothing-heritage/` (9 files), `src/components/builder/heritage.tsx`, `src/components/builder/chrome.tsx` (if theme-only), `src/lib/theme-blueprints.ts`, heritage tests (`heritage-contracts`, `heritage-occasions`, `heritage-rewards`, `theme-blueprints.heritage`, `wiring.test.ts`, `beauty-home*`, `apparel*`, `electronics*` if theme fixtures)
- Modify: importers of the above (find via grep, fix or delete with owner track's consent — record each in report)

**Interfaces:**

- Consumes: nothing (deletion root).
- Produces: list of deleted paths + surviving importer fixes needed by Tasks 3-4.

- [ ] **Step 1:** In worktree /tmp/opencode/purge-heritage, grep all importers of heritage/blueprint modules and list them.
- [ ] **Step 2:** Delete the files; fix importers that this track owns, report the rest with file:line.
- [ ] **Step 3:** Run `vitest run` on touched test dirs + `tsc --noEmit`, record output.
- [ ] **Step 4:** Report DONE/BLOCKED + files + test summary. No commit to main.

### Task 2: Delete appearance/marketplace theme lifecycle

**Files:**

- Modify: `src/lib/themes/appearance*.ts`, `src/lib/marketplace.server.ts`, `src/lib/marketplace-install.server.ts`, `src/lib/marketplace.functions.ts`, `src/components/marketplace/*` (ThemesScreen, ThemeCard, ThemePreviewSplit), `src/routes/_authenticated/dashboard/content/themes*`, `src/routes/_authenticated/dashboard/marketplace/*`, `src/routes/theme-preview.$key.tsx`, `src/components/store/ThemePreviewFrame.tsx`
- Delete: theme-only screens/components, registry seed callers, `VISIBLE_THEME_KEYS` plumbing

**Interfaces:**

- Consumes: Task 1 deleted-path list (do not import them).
- Produces: marketplace without theme tabs/cards/routes; plugin/widget flows untouched.

- [ ] **Step 1:** Failing test first: theme routes return 404 / theme UI absent (new test `theme-purge.test.ts`).
- [ ] **Step 2:** Remove theme lifecycle (install/activate/preview/delete), registry reads, preview route.
- [ ] **Step 3:** Run touched suites + tsc, record output.
- [ ] **Step 4:** Report DONE/BLOCKED + files + tests. No commit to main.

### Task 3: Decouple storefront chrome from themes

**Files:**

- Modify: `src/components/store/ThemeChrome.tsx`, `ThemeSurface.tsx`, `StudioNodes.tsx`, `StoreHomepage.tsx`, `src/routes/store.$slug.*`, `src/routes/p.$productSlug.tsx`, `c.$collectionSlug.tsx`, `pages.$pageSlug.tsx`, `cart.tsx`, `search.tsx`, `src/lib/storefront.server.ts`, `src/lib/storefront-search.server.ts`
- Delete: token application paths (`tokensToCss` callers in storefront), theme template resolution (`loadPageTemplate`)

**Interfaces:**

- Consumes: Tasks 1-2 deletions.
- Produces: themeless render contract — Studio nodes else HTML, default chrome, documented in report.

- [ ] **Step 1:** Failing test: ACTIVE-theme store renders content with default chrome (fixture).
- [ ] **Step 2:** Strip theme AST/tokens branches; keep Studio/HTML paths.
- [ ] **Step 3:** Run touched suites + tsc, record output.
- [ ] **Step 4:** Report DONE/BLOCKED + render contract. No commit to main.

### Task 4: Decouple builder AST core

**Files:**

- Modify: `src/lib/builder-ast.ts` (ThemeAst/ThemeTokens/ThemeTemplates/catalog theme defaults — remove or isolate), `src/components/builder/SectionRenderer.tsx`, `WidgetTray.tsx`, `src/routes/_authenticated/dashboard/builder.tsx`, `src/components/builder/studio/*` theme refs
- Delete: theme-only builder panels (TokenEditor theme presets, theme template pickers)

**Interfaces:**

- Consumes: Tasks 1-3 deletions.
- Produces: builder compiles with zero theme imports; Section/StudioNode types intact.

- [ ] **Step 1:** Grep all `ThemeAst|ThemeTokens|themeKey|preview_theme` uses in builder, list them.
- [ ] **Step 2:** Remove theme branches; keep section/widget editing intact.
- [ ] **Step 3:** Run builder test subset + tsc, record output.
- [ ] **Step 4:** Report DONE/BLOCKED + remaining type exports. No commit to main.

### Task 5: Retire theme tables in DB

**Files:**

- Create: `supabase/migrations/20260923_retire_themes.sql` (stop writes: drop/retire RLS write policies for theme_registry/store_themes/theme_versions; append-only audit note; do NOT drop tables — historical rows stay)
- Modify: `src/lib/themes.server.ts`, theme RPC callers, `20260920_import_rpcs.sql` references (amend, don't rewrite history — new migration only), seed files (remove theme seeds from future seeds)

**Interfaces:**

- Consumes: Task 2-3 read-path removals (no live reads remain).
- Produces: migration applying cleanly; grep shows zero live reads of theme tables.

- [ ] **Step 1:** List every live read/write of theme_registry/store_themes/theme_versions.
- [ ] **Step 2:** Write migration; remove live reads (with owning track consent where shared).
- [ ] **Step 3:** Verify migration chain order + tsc on touched servers.
- [ ] **Step 4:** Report DONE/BLOCKED + migration file + read/write inventory. No commit to main.

### Task 6: Sweep copy — docs, tests, SEO, comments

**Files:**

- Modify: every remaining `theme` mention in `docs/`, `SEO/`, `BUILD.md`, `TODO.md`, `SYSTEM.md`, `DESIGN.md`, code comments, UI copy, error strings (426 files / 3661 lines total scope; this track owns non-code + comments/copy only — never logic)

**Interfaces:**

- Consumes: Tasks 1-5 final deleted-path lists (docs must not reference deleted routes/modules).
- Produces: zero `theme` mentions outside historical CHANGELOG entries (explicitly allowed).

- [ ] **Step 1:** Re-grep full scope, diff against Tasks 1-5 coverage, claim the remainder.
- [ ] **Step 2:** Rewrite/remove mentions; keep historical CHANGELOG lines intact.
- [ ] **Step 3:** Final full grep count + tsc clean on touched files.
- [ ] **Step 4:** Report DONE/BLOCKED + final mention count. No commit to main.
