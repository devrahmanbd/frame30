# Preview Fidelity Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five high-impact preview-fidelity gaps so theme preview shows the clicked content (not generic fallbacks) in the active locale with one click-routing source of truth.

**Architecture:** Extend the existing focus overlay (`resolveDemoFocus`/`applyDemoFocus` in `src/lib/theme-preview-nav.ts`) to categories + product media, delete the Frame-local click-routing duplicate in favor of the nav module, and add `_bn` reads to repeater item-row mappers following the landed footer-sitemap precedent.

**Tech Stack:** TypeScript ESM, React SSR (`renderToStaticMarkup` tests), Vitest, Bun runtime, `@/*` alias.

**Spec:** Analysis reports in `/tmp/opencode/preview-analysis/.analysis-reports/` (theme-system.md §4.1-4.4, page-builder.md §4.3). Plugin preview explicitly OUT of scope (user ruling 2026-09-25).

## Global Constraints

- Bun ESM `"type": "module"` — no `require()`.
- Preview nav stays pure client-safe (`src/lib/theme-preview-nav.ts` — no Supabase/Redis/secrets).
- Bilingual convention: flat `key` + `key_bn` props; bn falls back to en, never blank (`bitext.ts`).
- Tests required (`passWithNoTests: false`); TDD red→green per task.
- Zero NEW lint/typecheck violations vs base per file (repo has pre-existing redness; compare with `git show origin/main:<file>` piped through eslint/tsc).
- CI is CircleCI only — no `.github/` changes.
- Work in `/tmp/opencode/preview-phase1` @ `0c93f88`, branch `fix/preview-fidelity-phase1`, push after each task.

## Review Focus

- `/c/women` (category, not collection) renders Women-titled rows, not `new-in` fallback title — category-filtered rows expected.
- `/products/` list-form href still maps exactly as before dedup (pin the divergent behavior in a test BEFORE deleting either copy).
- Repeater `_bn` absent → EN fallback renders (never blank, never crash).
- Focused product shows its own catalog image, unknown slugs keep current static media.
- No `?slug=` resurgence — `?focus=` contract untouched.

---

### Task 1: Deduplicate click-routing (single source)

**Files:**

- Modify: `src/components/store/ThemePreviewFrame.tsx` (delete local `isPreviewBlockedHref`/`parsePreviewHref`/`previewClickAction`, import from `@/lib/theme-preview-nav`)
- Modify: `src/lib/theme-preview-nav.ts` ONLY if needed to reconcile the `/products/`-list divergence (prefer nav-module behavior; pin with test)
- Test: `src/lib/theme-preview-nav.test.ts` (add `/products/` list-form pin + Frame-import assertion is impossible — instead delete + typecheck)

**Interfaces:**

- Consumes: `previewClickAction`, `isPreviewBlockedHref`, `handlePreviewCanvasClick`, `handlePreviewCanvasSubmit`, `PREVIEW_DISABLED_MESSAGE` from `@/lib/theme-preview-nav`
- Produces: Frame with zero local parser definitions (grep `parsePreviewHref` in Frame → 0 hits)

- [ ] **Step 1: Write the failing/pinning test**

```typescript
// append to src/lib/theme-preview-nav.test.ts
describe("click-routing single source", () => {
  it("maps /products/ list form exactly once", () => {
    expect(previewTemplateForHref("/products/")).toBe("product");
    expect(previewTargetForHref("/products/")).toEqual({
      template: "product",
      slug: null,
      query: null,
    });
  });
});
```

- [ ] **Step 2: Run to verify current behavior**

Run: `vitest run src/lib/theme-preview-nav.test.ts -t "single source"`
Expected: FAIL (test missing) or value mismatch documenting the divergence — record actual, then encode the Frame's behavior if it differs and rule which wins (nav module wins unless Frame's is strictly more correct; ledger the ruling)

- [ ] **Step 3: Delete Frame-local copies, import from lib**

Delete in `ThemePreviewFrame.tsx`: local `BLOCKED_HREF_RE`, `isPreviewBlockedHref`, `parsePreviewHref`, `previewTemplateForHref`, `previewClickAction`/`PreviewClickAction`, local `handlePreviewCanvasClick`/`handlePreviewCanvasSubmit` ONLY if identical duplicates of lib versions (diff first; if Frame's has extra logic, port the extra into lib instead of deleting). Keep `PREVIEW_DISABLED_MESSAGE` re-export if external importers use it (grep first).

- [ ] **Step 4: Run tests**

Run: `vitest run src/lib/theme-preview-nav.test.ts src/components/store/ThemePreviewFrame.test.tsx`
Expected: PASS, same count or more

- [ ] **Step 5: Commit + push**

```bash
git add src/components/store/ThemePreviewFrame.tsx src/lib/theme-preview-nav.ts src/lib/theme-preview-nav.test.ts
git commit -m "fix(preview): single-source click routing in theme-preview-nav"
git push origin fix/preview-fidelity-phase1
```

---

### Task 2: Category slugs resolve in demo focus

**Files:**

- Modify: `src/lib/theme-preview-nav.ts` (`resolveDemoFocus` collection branch ~:334-338)
- Test: `src/lib/theme-preview-nav.test.ts`

**Interfaces:**

- Consumes: `demoCatalogFor(themeKey)` → `catalog.categories[]` (`{slug,name}`), `catalog.products[]` (`category`, `collections[]`)
- Produces: `resolveDemoFocus("songoskriti","collection","women")` → `{ template:"collection", slug:"women", title:"Women", collection:<resolvable key>, category:"women" }` — extend `DemoFocus` with optional `category` ONLY if needed by previewDemoMap; prefer reusing `collection` field when the category has no dedicated collection (filter rows by `category`, same pattern as `preview-demo-data.ts:116-119`)

- [ ] **Step 1: Write the failing test**

```typescript
describe("resolveDemoFocus categories", () => {
  it("resolves a category slug to category-filtered rows", () => {
    const f = resolveDemoFocus("songoskriti", "collection", "women")!;
    expect(f.title).toBe("Women");
    expect(f.slug).toBe("women");
  });
  it("unknown slugs still fall back to new-in", () => {
    expect(
      resolveDemoFocus("songoskriti", "collection", "nope-xyz")?.collection,
    ).toBe("new-in");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `vitest run src/lib/theme-preview-nav.test.ts -t "categories"`
Expected: FAIL — title is humanized "Women" but collection is "new-in" with no category signal (record actual shape)

- [ ] **Step 3: Implement category matching + row filtering**

In `resolveDemoFocus` collection branch: after collections lookup misses, look up `catalog.categories`; on hit return focus carrying the category so rails filter by `product.category === slug` (mirror `preview-demo-data.ts:116-119`). Ensure `applyDemoFocus` rail override uses a collection key that actually resolves rows — if filtering by category, the rail's `collection` param must select those rows (extend `previewDemoMap` collection branch to also match `category` when no collection matches, falling back to current behavior otherwise).

- [ ] **Step 4: Run tests**

Run: `vitest run src/lib/theme-preview-nav.test.ts src/lib/preview-demo-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/theme-preview-nav.ts src/lib/theme-preview-nav.test.ts src/lib/preview-demo-data.ts
git commit -m "fix(preview): demo focus resolves category slugs"
git push origin fix/preview-fidelity-phase1
```

---

### Task 3: Focus overlay keeps `_bn` twins

**Files:**

- Modify: `src/lib/theme-preview-nav.ts` (`applyDemoFocus` ~:357-390)
- Test: `src/lib/theme-preview-nav.test.ts` (unit on section arrays) — check existing applyDemoFocus tests first

**Interfaces:**

- Consumes: `DemoFocus { title }`, section props possibly containing `text_bn`/`heading_bn`
- Produces: focused heading keeps authored `text_bn`/`heading_bn` when present; humanized-slug titles leave `_bn` empty (falls back to EN per `resolveBiText`, never blank)

- [ ] **Step 1: Write the failing test**

```typescript
it("focus keeps authored _bn twins", () => {
  const sections = [
    {
      id: "h",
      type: "heading",
      props: { text: "New in", text_bn: "নতুন এসেছে" },
    },
  ];
  const out = applyDemoFocus(sections as never, {
    template: "collection",
    slug: "festive",
    title: "Eid & Festive",
    collection: "festive",
  });
  expect(out[0].props.text).toBe("Eid & Festive");
  expect(out[0].props.text_bn).toBe("নতুন এসেছে"); // currently blanked
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `vitest run src/lib/theme-preview-nav.test.ts -t "_bn"`
Expected: FAIL — `text_bn` is `""`

- [ ] **Step 3: Stop blanking twins in `applyDemoFocus`**

Remove the `text_bn: ""` / `heading_bn: ""` overwrites; only set the EN text. (Catalog has no bn names — a bn-name lookup is out of scope; fallback covers it.)

- [ ] **Step 4: Run tests**

Run: `vitest run src/lib/theme-preview-nav.test.ts`
Expected: PASS

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/theme-preview-nav.ts src/lib/theme-preview-nav.test.ts
git commit -m "fix(preview): focus overlay preserves authored _bn twins"
git push origin fix/preview-fidelity-phase1
```

---

### Task 4: Focused product feeds `product_media`

**Files:**

- Modify: `src/lib/theme-preview-nav.ts` (`applyDemoFocus`) and/or `src/components/store/ThemePreviewFrame.tsx` (whichever owns media override — check how product template is assembled in `songoskriti/preview.ts:81-87`)
- Test: extend `src/lib/theme-preview-nav.test.ts` or frame test

**Interfaces:**

- Consumes: matched catalog product (`image_url`), `product_media` section props (`image1..image4`)
- Produces: focused known product slug → media images from catalog; unknown slug → current static images unchanged

- [ ] **Step 1: Write the failing test** (assert media images equal the catalog product's `image_url` for a known slug; currently static)
- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Override `product_media` image props from the matched catalog product** (first image at minimum; map up to 4 if catalog art allows; never touch unknown-slug path)
- [ ] **Step 4: Run tests** — `vitest run` on touched suites, PASS
- [ ] **Step 5: Commit + push** — `fix(preview): focused product feeds product_media art`

---

### Task 5: Repeater item-row `_bn` reads

**Files:**

- Modify: hero/faq/trust/announcement/lookbook item-row mappers — locate via `widgets.tsx:861-871`, `widgets.tsx:1384-1397`, `chrome.tsx` trust/announcement/lookbook rows (same `row.key`/`row.key_bn` direct-read pattern as the landed footer fix in `chrome.tsx:360-377`)
- Modify: `src/lib/studio/model.ts` ONLY the remaining `seed*Items` migrations that drop twins (footer already done — check `seedQaItems/seedHeroItems/seedTrustItems/seedAnnouncementItems/seedLookbookItems/seedSpecItems :454-604`)
- Test: extend `hero-locale.test.tsx`-style coverage + model migration tests mirroring the footer precedent

**Interfaces:**

- Consumes: row objects possibly carrying `<key>_bn`
- Produces: bn locale renders row `_bn` when present, EN fallback otherwise (never blank)

- [ ] **Step 1: Write failing tests** (one per mapper family + one per seed migration touched)
- [ ] **Step 2: Run to verify they fail**
- [ ] **Step 3: Add `_bn` reads (locale-pick, EN fallback) + carry twins in seeding**
- [ ] **Step 4: Run full touched suites** — PASS, zero new lint/typecheck violations vs base
- [ ] **Step 5: Commit + push** — `fix(i18n): repeater item rows read _bn twins`

---

### Task 6: Verify + merge-ready

- [ ] **Step 1: Full preview-related suites**

Run: `vitest run src/lib/theme-preview-nav.test.ts src/components/store/ThemePreviewFrame.test.tsx src/components/builder/hero-locale.test.tsx src/components/builder/footer-locale.test.tsx src/lib/studio/model.test.ts src/lib/preview-demo-data.test.ts`
Expected: PASS, zero new failures vs base (record pre-existing failures if any)

- [ ] **Step 2: Lint + typecheck touched files** — zero NEW violations vs `origin/main` baseline per file
- [ ] **Step 3: Push branch** (already pushed per task; confirm `origin/fix/preview-fidelity-phase1` == local HEAD)
