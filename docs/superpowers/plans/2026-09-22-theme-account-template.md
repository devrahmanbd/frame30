# Highly Customizable Themes, Phase 1: Account Template + Context Widgets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every storefront surface — including the shopper account area — renders from the active theme, with a built-in fallback so no store ever goes blank.

**Architecture:** Add an `account` template key end-to-end (union, slots, lint, gates) plus account context widgets fed by the existing server-bundle pattern; `ThemeChrome` hosts the account routes with a default AST fallback (same `fallback` pattern the collection route already uses), so existing themes keep working untouched.

**Tech Stack:** TanStack Start, existing builder-ast catalog, WidgetData bundle/map, RLS-scoped order/customer reads.

**Spec:** `docs/themes/creation.md` areas 11–12 (explicitly revised by this plan: the account area IS theme-driven now; sign-in/up credential forms stay platform-owned).

## Global Constraints

- No new runtime dependencies. No raw HTML in templates (sanitiser boundary holds).
- `account` behaves like other context templates: data widgets skeleton-spin nowhere (preview demo rows required), exactly one H1, bn ≥ 0.9.
- Shopper data is session-scoped: account widgets read only the signed-in shopper's orders/profile (mirror the tightest existing WITH CHECK pattern found in Task 2 discovery).
- TDD + targeted suites green; full-suite diff vs main baseline must show zero new failures.
- Never edit applied migrations; no seed rewrites by hand (generator only).

## Review Focus

- Cross-shopper data leak via account widgets (rows must be session-filtered server-side, never client-filtered).
- Signed-out visitors hitting account widgets (must render sign-in prompt, never empty crash).
- H1 duplication between theme account template and route fallback.
- Preview with no shopper session (demo rows, no skeleton-spin).
- Version skew: old published themes without `account` must fall back, never 404.

---

### Task 1: `account` template key end-to-end

**Files:**
- Modify: `src/lib/builder-ast.ts` (union ~L85, `TEMPLATE_KEYS` ~L46-59, slots, catalog gating)
- Modify: `src/lib/builder-seo.ts`, docs list in `docs/themes/creation.md` areas 11–12
- Test: extend `src/lib/theme-presets.test.ts`? No — add `src/lib/account-template.test.ts` (create)

**Interfaces:**
- Consumes: `SectionType`, `TemplateKey`, `TEMPLATE_KEYS`, slot arrays.
- Produces: `account` accepted everywhere `collection` is (parse, lint, coverage, gates).

- [ ] **Step 1: Inspect key/slot wiring (discovery, read-only)**

Run: `sed -n '46,60p;79,84p' src/lib/builder-ast.ts` and `grep -n "collection" src/lib/builder-ast.ts | grep -i "slot\|template" | head -n 20`
Record: exact `TEMPLATE_KEYS` tuple, which slot arrays gate `collection`, and every switch/if that enumerates template keys (route param validators, `templateOf`, SEO helpers).

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  TEMPLATE_KEYS,
  lintTemplate,
  parseTemplates,
} from "./builder-ast";

describe("account template key", () => {
  it("is a known template key", () => {
    expect((TEMPLATE_KEYS as readonly string[]).includes("account")).toBe(
      true,
    );
  });

  it("parses and lints an empty account template", () => {
    const parsed = parseTemplates({
      account: { header: [], main: [], footer: [] },
    });
    expect(parsed.account).toBeTruthy();
    expect(lintTemplate(parsed.account!, "account")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/account-template.test.ts`
Expected: FAIL (unknown key / dropped template).

- [ ] **Step 4: Write minimal implementation**

Add `"account"` to the `SectionType`-adjacent template union, `TEMPLATE_KEYS`, and every enumeration found in Step 1 (same arms as `collection`; no new logic). Update `docs/themes/creation.md` areas 11–12: account area is theme-driven via the `account` key; credential forms stay platform routes.

- [ ] **Step 5: Run test to verify it passes + commit**

Run: `npx vitest run src/lib/account-template.test.ts src/lib/theme-presets.test.ts`
Expected: PASS.

```bash
git add src/lib/builder-ast.ts src/lib/account-template.test.ts docs/themes/creation.md
git commit -m "feat(themes): account template key end-to-end"
```

### Task 2: Account context widgets (orders + profile)

**Files:**
- Modify: `src/lib/builder-ast.ts` (catalog entries: `orders_list`, `profile_card`)
- Modify: `src/components/builder/` (new `account.tsx` renderers + registry wiring in `widgets.tsx`)
- Modify: `src/lib/widget-data.ts` (sources), `src/lib/preview-demo-data.ts` (demo rows)
- Test: `src/components/builder/account-widgets.test.tsx` (create)

**Interfaces:**
- Consumes: `WidgetCtx { str, data, locale, money }`, `WidgetRow` shape, `collectWidgetRequests` bundle.
- Produces: `orders_list` (signed-in shopper's orders w/ status + totals) and `profile_card` (name/contact + sign-in prompt when signed out); preview resolves demo rows so nothing skeleton-spins.

- [ ] **Step 1: Inspect data patterns (discovery, read-only)**

Run: `grep -n "source" src/lib/widget-data.ts | head -n 20` and `grep -n "product_rail\|order_tracker" src/lib/builder-ast.ts | head`
Read: one data widget end-to-end (`merch.tsx` ProductRail + its `builder-ast` entry + a `preview-demo-data.ts` branch) and the shopper-session read used by `store.$slug.account.tsx` (find how it scopes to the signed-in shopper; copy that scoping, never client-filter).

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { WIDGET_COMPONENTS } from "./widgets";
import { widgetReader, type WidgetCtx } from "./widgets";

function ctxFor(section: Section): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, "en"),
    Heading: "h2",
    primary: false,
    editing: false,
    locale: "en",
    storeSlug: "test",
    data: undefined,
    renderChildren: () => null,
  };
}

describe("account context widgets", () => {
  it("orders_list renders a sign-in prompt without a shopper", () => {
    const Cmp = WIDGET_COMPONENTS["orders_list"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(newSection("orders_list")),
      ),
    );
    expect(html.toMatch(/sign in/i)).toBeTruthy();
  });

  it("profile_card renders without crashing dataless", () => {
    const Cmp = WIDGET_COMPONENTS["profile_card"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(newSection("profile_card")),
      ),
    );
    expect(html.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/builder/account-widgets.test.tsx`
Expected: FAIL (`WIDGET_COMPONENTS["orders_list"]` undefined → render throws).

- [ ] **Step 4: Write minimal implementation**

Catalog entries (slots `["main"]`, `templates: ["account"]`, bilingual heading/body/empty strings + defaults), renderers in `src/components/builder/account.tsx` (server-safe: no `window`/`localStorage` at render; signed-out → sign-in prompt linking `/account`), registry merge in `widgets.tsx` (same spread pattern as other groups), bundle sources + preview demo rows (2 demo orders w/ BDT totals, 1 demo profile).

- [ ] **Step 5: Run test to verify it passes + commit**

Run: `npx vitest run src/components/builder/account-widgets.test.tsx src/lib/preview-demo-data.test.ts`
Expected: PASS.

```bash
git add src/lib/builder-ast.ts src/components/builder/account.tsx src/components/builder/widgets.tsx src/lib/widget-data.ts src/lib/preview-demo-data.ts src/components/builder/account-widgets.test.tsx
git commit -m "feat(themes): account context widgets with demo rows"
```

### Task 3: ThemeChrome hosts the account routes (with fallback)

**Files:**
- Modify: `src/routes/account.tsx`, `src/routes/store.$slug.account.tsx`
- Create: `src/lib/default-account-ast.ts` (fallback template)
- Test: extend `src/lib/account-template.test.ts`

**Interfaces:**
- Consumes: `ThemeChrome` (`template`, `ast`, `fallback` props — same call shape as `c.$collectionSlug.tsx:154-173`), `templateOf(templates, "account")`.
- Produces: account pages render theme `account` template when published, default AST otherwise; never blank, never 404 for signed-in shoppers.

- [ ] **Step 1: Inspect host call shape (discovery, read-only)**

Read: `src/routes/c.$collectionSlug.tsx:149-174` and `src/components/store/ThemeChrome.tsx:30-60,95-150`. Record exact prop names (`ownsPrimary`, `chrome`, `productSlot`/`collectionSlot`, `fallback`).

- [ ] **Step 2: Write the failing test**

Append to `src/lib/account-template.test.ts`:

```ts
import { defaultAccountAst } from "./default-account-ast";

it("ships a default account AST with orders + profile", () => {
  const ast = defaultAccountAst();
  const types = ast.main.map((s) => s.type);
  expect(types).toContain("orders_list");
  expect(types).toContain("profile_card");
  expect(lintTemplate(ast, "account")).toEqual([]);
});
```

Run: `npx vitest run src/lib/account-template.test.ts` — FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

`default-account-ast.ts` builds sections via `makeSection`-equivalent used by blueprints (check how `newSection` + defaults work; reuse, don't reinvent) with bilingual copy. Both account routes: load published `account` template; pass `fallback={defaultAccountAst()}`; signed-out visitors get the platform sign-in prompt (existing behavior preserved — verify current signed-out branch first and keep it).

- [ ] **Step 4: Run test to verify it passes + commit**

Run: `npx vitest run src/lib/account-template.test.ts`
Expected: PASS.

```bash
git add src/lib/default-account-ast.ts src/routes/account.tsx src/routes/store.$slug.account.tsx src/lib/account-template.test.ts
git commit -m "feat(themes): account routes render theme templates with fallback"
```

### Task 4: Gates, presets, and blast-radius proof

**Files:**
- Modify: blueprint `account` templates where cheap (optional — fallback covers all, so this task only wires gates)
- Test: existing suites (no new file)

**Interfaces:**
- Consumes: publish-gate code paths, `theme-presets.test.ts`, definition-of-done lists.
- Produces: green gates with the new key present; baseline-diffed full suite.

- [ ] **Step 1: Enumerate gate touchpoints (discovery, read-only)**

Run: `grep -rn "TEMPLATE_KEYS\|templateKeys" src/lib/*gate*.ts src/lib/builder-seo.ts src/scripts/*gate*.mjs 2>/dev/null | head -n 20`
Record every place that assumes the 8-key set.

- [ ] **Step 2: Update gates + preset tests**

Add `account` wherever the 8-key set is enumerated (same treatment as `search`). Update counts/expectations that hardcode 8.

- [ ] **Step 3: Full-suite baseline diff**

Run full `npx vitest run` on the branch and on pristine `origin/main` (separate worktrees); diff failing-test lists. Zero new failures permitted; document any delta as parked findings with rulings.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(themes): account key in gates and preset suites"
```

## Self-Review

- [ ] Spec coverage: creation.md 12 areas → account area (Tasks 1–3), gates (Task 4). Credential forms stay platform-side per revised areas 11–12.
- [ ] Placeholder scan: no TBDs; discovery steps cite exact files/commands.
- [ ] Type consistency: `TemplateKey`/`ThemeAst` reused; no redefined unions.
- [ ] Review Focus: all five lines pinned (Task 2 tests sign-out/preview; Task 3 fallback/H1; Task 4 version skew needs an `api`-range assertion — add before implementing).
