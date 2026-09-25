# Clothing Heritage Aarong-parity rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/theme-preview/clothing-heritage` render a complete realistic Aarong-grade storefront with demo data, zero empty sections.

**Architecture:** Dual-read renderer fixes (backward compatible) + blueprint rewrite with filled props + preview duplication fix. No new routes, no schema changes.

**Tech Stack:** TanStack Start, React 19, Tailwind v4, Vitest, existing widget registry.

**Spec:** `docs/superpowers/specs/2026-09-22-clothing-heritage-aarong-parity-design.md`

## Global Constraints

- No hotlinked stock photography; `/api/public/ph/` placeholders + lattice only.
- Bilingual EN/BN: every authored string keeps its `_bn` twin where schema has it.
- TDD: failing test first, watch it fail correctly, minimal code, full touched-file suite green.
- No new dependencies. Follow existing repeater dual-read precedent (items > scalars).
- Targeted `vitest run <files>` + `tsgo --noEmit` on touched files only (CI owns full suite).

## Review Focus

- Empty-section render (blueprint prop present but renderer reads different key → null in production).
- Newline-separated footer marks rendering as one blob pill.
- Duplicate language toggle in preview (utility_bar + StoreHeader).
- Bangla headline clipping (negative tracking or tight line-height).
- Marquee label vs items contract (single marquee per page).

---

### Task 1: Renderer dual-read fixes (heritage.tsx + chrome.tsx)

**Files:**

- Modify: `src/components/builder/heritage.tsx`
- Modify: `src/components/builder/chrome.tsx`
- Test: `src/components/builder/heritage-contracts.test.tsx` (create)

**Interfaces:**

- Consumes: existing `WidgetCtx { str, section, Heading, locale }`, `rowsOf` helper.
- Produces: same component signatures; renderers accept legacy + studio keys.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { HERITAGE_WIDGETS } from "./heritage";
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

describe("heritage contract dual-read", () => {
  it("heritage_story reads heading/cta aliases", () => {
    const section = {
      ...newSection("heritage_story"),
      props: {
        ...newSection("heritage_story").props,
        heading: "Tangail & Jamdani",
        body: "Woven craft",
        ctaLabel: "Read the story",
        ctaHref: "/blog/x",
      },
    };
    const Cmp = HERITAGE_WIDGETS["heritage_story"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Tangail &amp; Jamdani");
    expect(html).toContain("Read the story");
  });

  it("textile_showcase reads items[]", () => {
    const section = {
      ...newSection("textile_showcase"),
      props: {
        ...newSection("textile_showcase").props,
        headline: "Our textiles",
        items: [
          {
            image: "/api/public/ph/a.svg",
            title: "Jamdani",
            subtitle: "Royal drape",
          },
        ],
      },
    };
    const Cmp = HERITAGE_WIDGETS["textile_showcase"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Jamdani");
  });

  it("editorial_banner reads heading/body aliases", () => {
    const section = {
      ...newSection("editorial_banner"),
      props: {
        ...newSection("editorial_banner").props,
        heading: "Silk panjabi",
        body: "Breathable fibers",
        ctaLabel: "See collection",
        ctaHref: "/c/x",
      },
    };
    const Cmp = HERITAGE_WIDGETS["editorial_banner"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Silk panjabi");
  });

  it("marquee_strip reads label fallback", () => {
    const section = {
      ...newSection("marquee_strip"),
      props: {
        ...newSection("marquee_strip").props,
        label: "Handloom · Fair Trade",
      },
    };
    const Cmp = HERITAGE_WIDGETS["marquee_strip"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Handloom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/builder/heritage-contracts.test.tsx`
Expected: FAIL (heading/cta missing, items ignored, label ignored).

- [ ] **Step 3: Write minimal implementation**

In `heritage.tsx`: HeritageStory headline=`str("headline")||str("heading")`,
eyebrow=`str("eyebrow")||str("caption")`, cta=`str("ctaLabel")||str("buttonLabel")`,
href likewise, render eyebrow + CTA link. TextileShowcase products =
`rowsOf("products")` mapped OR `rowsOf("items")` mapped (image/title/subtitle),
headline=`str("headline")||str("heading")`. EditorialBanner headline=
`str("headline")||str("heading")`, subhead=`str("subhead")||str("body")`,
cta=`str("cta_label")||str("ctaLabel")`, url likewise, eyebrow render.
MarqueeStrip items OR `str("label")` split on `·|,|\n` into items.
DepartmentGrid dept name=`readString(row,"name")||readString(row,"title")`.
In `chrome.tsx` PaymentIcons: `str("marks").split(/[,\\n]+/)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/builder/heritage-contracts.test.tsx src/components/builder/heritage-occasions.test.tsx src/components/builder/heritage-rewards.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/builder/heritage.tsx src/components/builder/chrome.tsx src/components/builder/heritage-contracts.test.tsx
git commit -m "fix(heritage): dual-read renderer contracts + payment split"
```

### Task 2: Blueprint rewrite (theme-blueprints.ts clothingHeritage)

**Files:**

- Modify: `src/lib/theme-blueprints.ts`
- Test: `src/lib/theme-blueprints.heritage.test.ts` (create)

**Interfaces:**

- Consumes: `bound(k)`, `tokens()`, `withSearch()`, `COLS()`, section factory.
- Produces: `clothingHeritage(): ThemePreset` with filled props per Task 1 contracts.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { BLUEPRINT_PRESETS } from "./theme-blueprints";

describe("clothing-heritage aarong parity", () => {
  const preset = BLUEPRINT_PRESETS.find((p) => p.key === "clothing-heritage")!;
  it("homepage has no empty contract sections", () => {
    const types = preset.templates.index.main.map((s) => s.type);
    for (const need of [
      "hero_carousel",
      "trust_bar",
      "department_grid",
      "product_rail",
      "collection_story",
      "lookbook",
      "textile_showcase",
      "wedding_shop",
      "gift_finder",
      "heritage_story",
      "editorial_banner",
      "testimonial_carousel",
      "rewards_club",
      "subbrand_spotlight",
      "marquee_strip",
    ]) {
      expect(types, need).toContain(need);
    }
    const dept = preset.templates.index.main.find(
      (s) => s.type === "department_grid",
    )!;
    expect(
      (dept.props["departments"] as unknown[]).length,
    ).toBeGreaterThanOrEqual(8);
    const textile = preset.templates.index.main.find(
      (s) => s.type === "textile_showcase",
    )!;
    expect(
      ((textile.props["items"] ?? textile.props["products"]) as unknown[])
        .length,
    ).toBeGreaterThanOrEqual(4);
  });
  it("header has no duplicate language toggle", () => {
    const util = preset.templates.index.header.find(
      (s) => s.type === "utility_bar",
    )!;
    expect(util.props["showLanguage"]).toBe(false);
  });
  it("footer payment marks are comma-separated", () => {
    const pay = preset.templates.index.footer.find(
      (s) => s.type === "payment_icons",
    )!;
    expect(String(pay.props["marks"])).toContain(",");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/theme-blueprints.heritage.test.ts`
Expected: FAIL (missing sections/props).

- [ ] **Step 3: Write minimal implementation**

Rewrite `clothingHeritage()`: header subbrand+announcement+utility(showLanguage false)+mega_menu("Shop by Category",8,4);
index.main per spec §4 with filled departments[8], trust items, collection_story Puja,
textile items[4], wedding c1-3, gift o1-3, heritage headline variant, editorial headline
variant, rewards tiers+button, subbrand_spotlight 4 brands, marquee items[];
radius 4px; footer marks comma-separated; mirror fixes to collection/product/page/blog.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/theme-blueprints.heritage.test.ts src/lib/preview-demo-data.test.ts src/lib/phase4-demo-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme-blueprints.ts src/lib/theme-blueprints.heritage.test.ts
git commit -m "feat(heritage): aarong-parity blueprint with filled contracts"
```
