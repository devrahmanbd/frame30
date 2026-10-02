# Topbar Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the chrome topbar band above the masthead for oceanblue entirely (`variant: "none"`), deleting the ticker marquee branch and falling the language toggle back to the header action cluster, while songoskriti's split strip stays untouched.

**Architecture:** The `ThemeHeaderChrome.announcement.variant` union narrows from `"split" | "ticker"` to `"split" | "none"` and the ticker-only `items` field is deleted. `StoreHeader` computes one `showBand` flag (`headerChrome !== null && variant !== "none"`); the band wrapper renders only when `showBand`, the ticker ternary branch is deleted, and the cluster `LanguageToggle` condition flips from `!isLuxury` to `!showBand`. Oceanblue's fallback announcement sets `variant: "none"` (dormant `left`/`center` copy stays — type-required).

**Tech Stack:** TypeScript, React 19 (static markup tests via `renderToStaticMarkup`), Vitest, TanStack Start.

**Spec:** `docs/superpowers/specs/2026-10-01-topbar-removal-design.md` (approved).

## Global Constraints

- No shared component or import in themes: prod files under `src/lib/themes/<theme>/` import engine lib only (`@/lib/*`), never `@/components/*` (AGENTS.md rule 7). This plan edits shared chrome + theme _data_ only — no new theme imports.
- `@keyframes fq-marquee` in `src/styles.css:349` **must stay** — shared by `discovery.tsx`, `heritage.tsx`, `widgets.tsx`.
- No homepage prop changes → **no migration regen** (`supabase/migrations/20260930120000_oceanblue_registry_row.sql` untouched); `schema:check` unaffected.
- Untouched surfaces: rotating campaign strip below the masthead (`src/lib/themes/oceanblue/header.ts` `announcement_bar`, incl. Wedding Edit), songoskriti split strip, skins/GSAP/GenericTestimonials, `wiring.test.ts` / `preview.test.ts` `["announcement_bar"]` expectations, `isLuxury`'s other jobs (wordmark, mega panel, 44px targets).
- Verification order (AGENTS.md): `typecheck` → `test` → `test:contracts` (+ `lint` on touched files).
- Never commit `ops/routing/canary-weights.conf` or `ops/routing/upstream.conf` (build-timestamp churn).
- Commit style: `feat(theme): …` subject + bullet body.

---

### Task 1: Config + data + render flip (atomic, typecheck-coupled)

The union change, data change, and render change are one typecheck unit: narrowing the union breaks `StoreHeader`'s `variant === "ticker"` / `.items` reads, and the data's `"ticker"` literal fails the narrowed union. They land in one commit with their tests.

**Files:**

- Modify: `src/components/store/theme-chrome.ts` (announcement type, ~lines 40–54)
- Modify: `src/lib/themes/oceanblue/header-fallback.ts` (`OCEANBLUE_HEADER_ANNOUNCEMENT`, lines 298–314)
- Modify: `src/components/store/StoreHeader.tsx` (~lines 103–108 `showBand`, ~182–259 band block, ~489 cluster toggle)
- Test: `src/components/store/theme-chrome.test.ts` (lines 31–51)
- Test: `src/components/store/StoreHeader.test.tsx` (describe lines 368–407)

**Interfaces:**

- Consumes: `themeChromeFor(key)` returning `ThemeHeaderChrome | null`; existing `renderHeader({ slug, name, themeKey, pathname?, initialLang? })` test helper; `LanguageToggle` (unchanged).
- Produces: `showBand: boolean` in `StoreHeader`; `announcement.variant?: "split" | "none"` on `ThemeHeaderChrome` with **no** `items` field; `OCEANBLUE_HEADER_ANNOUNCEMENT.variant === "none"`.

- [ ] **Step 1: Rewrite the theme-chrome tests (fail first)**

In `src/components/store/theme-chrome.test.ts`, replace these two tests (current lines 31–51):

```ts
it("registers the oceanblue theme entry with a ticker announcement", () => {
  expect(themeChromeKeys()).toContain("oceanblue");
  const chrome = themeChromeFor("oceanblue");
  expect(chrome).not.toBeNull();
  expect(chrome!.announcement.variant).toBe("ticker");
  expect(chrome!.announcement.items?.length).toBeGreaterThanOrEqual(2);
  // Every ticker item carries an en + bn twin (bilingual storefront).
  for (const item of chrome!.announcement.items ?? []) {
    expect(item.text.length).toBeGreaterThan(0);
    expect(item.bn && item.bn.length).toBeGreaterThan(0);
  }
  // Split-copy fallback stays present for aria/single-item rendering.
  expect(chrome!.announcement.center.length).toBeGreaterThan(0);
  expect(chrome!.announcement.center_bn.length).toBeGreaterThan(0);
});

it("songoskriti keeps the default split strip (no ticker config)", () => {
  const chrome = themeChromeFor("songoskriti");
  expect(chrome!.announcement.variant).toBeUndefined();
  expect(chrome!.announcement.items).toBeUndefined();
});
```

with:

```ts
it("registers the oceanblue theme entry with no topbar band", () => {
  expect(themeChromeKeys()).toContain("oceanblue");
  const chrome = themeChromeFor("oceanblue");
  expect(chrome).not.toBeNull();
  expect(chrome!.announcement.variant).toBe("none");
  // Split copy stays in config (type-required) but renders no band.
  expect(chrome!.announcement.left.length).toBeGreaterThan(0);
  expect(chrome!.announcement.center.length).toBeGreaterThan(0);
  expect(chrome!.announcement.center_bn.length).toBeGreaterThan(0);
});

it("songoskriti keeps the default split strip (no variant override)", () => {
  const chrome = themeChromeFor("songoskriti");
  expect(chrome!.announcement.variant).toBeUndefined();
});
```

- [ ] **Step 2: Rewrite the StoreHeader oceanblue tests (fail first)**

In `src/components/store/StoreHeader.test.tsx`, replace the whole `describe("oceanblue ticker announcement strip", …)` block (current lines 368–407, three tests ending with the songoskriti split-strip test) with:

```ts
describe("oceanblue has no topbar band", () => {
  it("renders no band above the masthead (no marquee, no split shell)", () => {
    const html = renderHeader({
      slug: "oceanblue",
      name: "Oceanblue",
      themeKey: "oceanblue",
    });
    // No ticker marquee, no split-strip 3-column shell, no band shell.
    expect(html).not.toContain("fq-marquee");
    expect(html).not.toContain("w-1/3 text-center");
    expect(html).not.toContain("h-[36px]");
    // Ticker copy is gone from config entirely.
    expect(html).not.toContain("CASH ON DELIVERY NATIONWIDE");
    // Masthead itself still renders (logo lockup present).
    expect(html).toContain("logo-lockup");
  });

  it("falls the language toggle back to the header action cluster", () => {
    const html = renderHeader({
      slug: "oceanblue",
      name: "Oceanblue",
      themeKey: "oceanblue",
    });
    // LanguageToggle's group label — with the band gone, this can only
    // come from the header cluster slot.
    expect(html).toContain('aria-label="Language / ভাষা"');
  });

  it("renders the same no-band header under the bn locale", () => {
    const html = renderHeader({
      slug: "oceanblue",
      name: "Oceanblue",
      themeKey: "oceanblue",
      initialLang: "bn",
    });
    expect(html).not.toContain("fq-marquee");
    expect(html).toContain('aria-label="Language / ভাষা"');
  });

  it("songoskriti keeps the split strip — no marquee in its markup", () => {
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).not.toContain("fq-marquee");
    expect(html).toContain("w-1/3 text-center");
    expect(html).toContain('aria-label="Language / ভাষা"');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/components/store/theme-chrome.test.ts src/components/store/StoreHeader.test.tsx`
Expected: FAIL — theme-chrome oceanblue test gets `"ticker"` where `"none"` expected; StoreHeader oceanblue test finds `fq-marquee` in markup.

- [ ] **Step 4: Narrow the config type + drop `items`**

In `src/components/store/theme-chrome.ts`, replace the `announcement` block of `ThemeHeaderChrome` (current lines 40–54):

```ts
  /** Announcement-bar copy for the luxury variant. */
  announcement: {
    left: string;
    center: string;
    center_bn: string;
    /**
     * Presentation variant, theme-authored: "split" (the default 3-column
     * strip) or "ticker" (a marquee of `items` across the full width).
     * Absent means "split" — songoskriti and generic chrome keep the
     * existing strip untouched.
     */
    variant?: "split" | "ticker";
    /** Ticker copy (used when `variant === "ticker"`). */
    items?: ReadonlyArray<{ text: string; bn?: string }>;
  };
```

with:

```ts
  /** Announcement-bar copy for the luxury variant. */
  announcement: {
    left: string;
    center: string;
    center_bn: string;
    /**
     * Presentation variant, theme-authored: "split" (the default 3-column
     * strip) or "none" (no band above the masthead at all — the masthead
     * is the top of the page). Absent means "split" — songoskriti and
     * generic chrome keep the existing strip untouched.
     */
    variant?: "split" | "none";
  };
```

- [ ] **Step 5: Flip the oceanblue data to `variant: "none"`**

In `src/lib/themes/oceanblue/header-fallback.ts`, replace `OCEANBLUE_HEADER_ANNOUNCEMENT` (current lines 298–314):

```ts
/** Announcement-bar copy for the oceanblue header variant. */
export const OCEANBLUE_HEADER_ANNOUNCEMENT = {
  left: "EASY 7-DAY EXCHANGE",
  center: "Free delivery across Bangladesh on orders over BDT 2,000",
  center_bn: "২০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
  // A full-width marquee strip — the shared header renders `items` as a
  // scrolling ticker instead of the default 3-column split bar.
  variant: "ticker",
  items: [
    { text: "EASY 7-DAY EXCHANGE", bn: "সহজ ৭ দিনের এক্সচেঞ্জ" },
    {
      text: "FREE DELIVERY OVER BDT 2,000",
      bn: "২০০০ টাকার উপরে ফ্রি ডেলিভারি",
    },
    { text: "CASH ON DELIVERY NATIONWIDE", bn: "সারা দেশে ক্যাশ অন ডেলিভারি" },
    {
      text: "SECURE CHECKOUT, EVERY ORDER",
      bn: "প্রতিটি অর্ডারে সিকিউর চেকআউট",
    },
    { text: "AW26 IS HERE", bn: "AW26 এসেছে" },
  ],
} as const;
```

with:

```ts
/** Announcement-bar copy for the oceanblue header variant. */
export const OCEANBLUE_HEADER_ANNOUNCEMENT = {
  left: "EASY 7-DAY EXCHANGE",
  center: "Free delivery across Bangladesh on orders over BDT 2,000",
  center_bn: "২০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
  // No band above the masthead — the rotating campaign strip below it
  // (header.ts announcement_bar) carries announcements instead. The
  // split copy above stays (type-required) dormant until a variant flip.
  variant: "none",
} as const;
```

- [ ] **Step 6: Gate the band + delete the ticker branch in `StoreHeader.tsx`**

Three edits in `src/components/store/StoreHeader.tsx`:

**(a)** Immediately after `const isLuxury = headerChrome !== null;` (current line 108), add:

```ts
// The band above the masthead renders only when the theme asks for a
// split strip; `variant: "none"` puts the masthead at the top of the
// page. Generic stores (null) also render no band.
const showBand =
  headerChrome !== null && headerChrome.announcement.variant !== "none";
```

**(b)** Band block (current lines 182–259): change the wrapper condition from `{headerChrome && (` to `{headerChrome && showBand && (`, then delete the ticker ternary — the condition line `{headerChrome.announcement.variant === "ticker" ? (`, the whole marquee `<div>` JSX (track, `--fq-marquee` style, aria-hidden duplicate, band-local `LanguageToggle`), the `) : (` separator, and the ternary's closing `)}` — so the split strip becomes the band's only child. Resulting band block:

```tsx
{
  headerChrome && showBand && (
    <div
      className={`w-full overflow-hidden transition-all duration-250 ease-out motion-reduce:transition-none border-b border-[#eaeaea] ${scrolled ? "h-0 opacity-0 border-transparent" : "h-[36px] opacity-100"}`}
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="hidden sm:block text-[10px] font-medium tracking-wide text-[#1a1a1a]/60 w-1/3 text-left">
          {headerChrome.announcement.left}
        </div>
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#1a1a1a] w-full sm:w-1/3 text-center">
          {t(
            headerChrome.announcement.center,
            headerChrome.announcement.center_bn,
          )}
        </div>
        <div className="hidden sm:flex justify-end w-1/3">
          <LanguageToggle />
        </div>
      </div>
    </div>
  );
}
```

**(c)** Header-cluster toggle (current line 489): `{!isLuxury && <LanguageToggle />}` →

```tsx
{
  !showBand && <LanguageToggle />;
}
```

(`isLuxury` itself is untouched — it keeps its other jobs.)

- [ ] **Step 7: Typecheck — must be clean**

Run: `bun run typecheck`
Expected: no errors. If `variant === "ticker"` or `.items` references remain anywhere, they surface here — fix by locating the leftover (`rg '"ticker"' src/components src/lib`).

- [ ] **Step 8: Run the two touched test files — must pass**

Run: `bunx vitest run src/components/store/theme-chrome.test.ts src/components/store/StoreHeader.test.tsx`
Expected: PASS (all tests in both files).

- [ ] **Step 9: Full unit + contract suites**

Run: `bun run test` then `bun run test:contracts`
Expected: all green (previous baseline 4823 passed / 2 skipped; 258 contracts).

- [ ] **Step 10: Stray-reference sweep**

Run: `rg '"ticker"' src/`
Expected: only unrelated keyword hits (`src/lib/studio/catalog.ts`, `src/lib/widget-metadata.ts`) — zero in `components/store/` or `themes/oceanblue/`.
Run: `rg 'announcement\.items|\.items \?\?' src/components/store/`
Expected: no hits.

- [ ] **Step 11: Commit**

```bash
git add src/components/store/theme-chrome.ts src/components/store/theme-chrome.test.ts \
  src/components/store/StoreHeader.tsx src/components/store/StoreHeader.test.tsx \
  src/lib/themes/oceanblue/header-fallback.ts
git commit -m "feat(theme): remove oceanblue chrome topbar band (variant none)" -m \
"- theme-chrome announcement variant narrows to split | none; ticker items field dropped
- StoreHeader band gated on showBand; marquee branch deleted; LanguageToggle falls to the header action cluster
- oceanblue fallback sets variant none (split copy stays dormant); songoskriti split untouched
- tests: no-band + cluster-toggle assertions replace the ticker suite"
```

Expected: commit created on `feat/oceanblue-theme`.

---

### Task 2: Full verification + browser proof + docs commit

**Files:**

- Create: `docs/superpowers/specs/2026-10-01-topbar-removal-design.md` (already written during spec review — stage it)
- Create: `docs/superpowers/plans/2026-10-01-topbar-removal.md` (this file — stage it)

**Interfaces:**

- Consumes: Task 1's shipped code (branch state after the feature commit).
- Produces: green gate evidence + committed docs; ready for push.

- [ ] **Step 1: Lint + full gate suite**

Run: `bun run lint && bun run typecheck && bun run test && bun run test:contracts`
Expected: all green; lint clean on touched files.

- [ ] **Step 2: Production build**

```bash
VITE_SUPABASE_URL=http://dummy.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=dummy bun run build
```

Expected: build completes (`.output/` written).

- [ ] **Step 3: Browser proof on the local preview**

Ensure the local server is up (if `lsof -i :3000` is empty: `VITE_SUPABASE_URL=http://dummy.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=dummy bun run dev > /tmp/nitro-3000.log 2>&1 &`).

Then, via chrome-devtools:

1. Navigate `http://localhost:3000/theme-preview/oceanblue`.
2. `take_snapshot` → assert: **no** band above the masthead (no marquee text, no "EASY 7-DAY EXCHANGE" chrome line); masthead logo + nav at the very top.
3. Assert `aria-label="Language / ভाषা"` control present in the header action cluster; click "বাং" → BN copy applies; click "EN" → back.
4. Assert the rotating campaign strip ("New Season AW'26…") still renders below the masthead.
5. Navigate `http://localhost:3000/theme-preview/songoskriti` → split strip still present (`EASY 7-DAY EXCHANGE` center line + no marquee).
6. `list_console_messages(types=["error"])` → zero errors on both pages.
7. `take_screenshot` (oceanblue) as evidence.

- [ ] **Step 4: Commit docs**

```bash
git add docs/superpowers/specs/2026-10-01-topbar-removal-design.md \
  docs/superpowers/plans/2026-10-01-topbar-removal.md
git commit -m "docs: topbar removal spec + implementation plan"
```

- [ ] **Step 5: Push the branch**

```bash
git push origin feat/oceanblue-theme
```

Expected: push succeeds. **Deployment and the dated CHANGELOG entry are a separate, explicitly-approved follow-up** (same pattern as `1b06337`: deploy only on request, then `## [date] — … (<hash>, deployed)` + mem0 memory).

---

## Self-Review (done by planner)

- **Spec coverage:** §2 config → Task 1 Steps 4–5; §3 render + toggle matrix → Step 6 (a/b/c) + Step 2 tests; §4 theme data → Step 5; §5 tests → Steps 1–2; §6 non-goals → Global Constraints; §7 verification → Task 2 Steps 1–3 (schema:check impact noted as none); §8 risks (stray `"ticker"` grep) → Step 10.
- **Placeholder scan:** all steps carry exact code/commands; no TBD/"similar to" references.
- **Type consistency:** `showBand` defined in Step 6a, consumed in 6b/6c and asserted via tests in Step 2; `variant?: "split" | "none"` in Step 4 matches data in Step 5 and tests in Step 1; `items` removed from type, data, and both test files in the same commit.
