/**
 * PILOT (frame30): per-widget delegation proof for exactly three studio
 * renderers — `heading`, `faq`, `product_grid`.
 *
 * Scope: this file + the three `case` bodies in `studio/renderers.tsx` are
 * the pilot's entire footprint. Nothing shared is touched.
 *
 * Method: `renderToStaticMarkup(StudioWidget)` with crafted `StudioNode`s.
 * Each test pins the DELEGATED (shared-component) contract, so every test
 * here FAILS against the pre-delegation inline markup (red) and passes
 * after the three cases delegate (green). The faq repeater-vs-scalar
 * decision and every known pre/post delta are asserted explicitly — see
 * the DECISIONS block below.
 *
 * DECISIONS (adapter: studio node → shared Section props):
 * - heading: studio `level` is numeric-or-`"hN"` (renderer clamps 1-6);
 *   shared only renders h1 (primary) / h2 / h3. Adapter: numeric 1 (or
 *   "h1") → primary (h1); 2/"h2"/other → h2; >=3/"h3" → h3. h4-h6
 *   COLLAPSE to h3 (shared has no h4+; documented delta). Empty text keeps
 *   the studio canvas fallback "Add your heading text" (adapter-injected,
 *   so empty headings don't collapse to nothing). `align: center` now
 *   applies `text-center` (studio ignored it; catalog ALIGN field says it
 *   should). Inline editing is NOT forwarded (InlineWidget already wraps
 *   heading nodes in contentEditable; forwarding would nest editors).
 * - faq: REPEATER WINS. `items` rows (`question`/`answer`) win when
 *   non-empty; scalar q1/a1..q3/a3 are the fallback. This mirrors BOTH
 *   renderers' existing repeater-first branches AND `seedQaItems`
 *   (model.ts), which migrates scalars → items on load without overwriting
 *   author edits — so post-seed the repeater is the source of truth and
 *   the adapter just passes both bags through and lets the shared
 *   renderer pick. Known DOM deltas: `details`/`summary` → Disclosure
 *   (`button[aria-expanded]` + region), section heading h3 → h2 (shared
 *   Heading is h1|h2 only), empty faq placeholder → null (shared returns
 *   null when there are no rows).
 * - product_grid: studio rendered a "renders on the storefront" placeholder;
 *   shared renders heading + DataGrid. Studio has no data layer, so the
 *   adapter passes `data: undefined` and the shared skeleton branch
 *   renders (box-model-identical loading state, same as the storefront's
 *   first paint). columns/skin/cardVariant/density/promise/showRating pass
 *   through (studio keys equal shared keys). Known DOM delta:
 *   placeholder → skeleton grid (intended: single-sourced live markup).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioWidget } from "@/components/builder/studio/renderers";
import type { StudioNode } from "@/lib/studio/model";

function node(el: string, settings: StudioNode["settings"]): StudioNode {
  return { id: `pilot-${el}`, el, settings };
}

function htmlFor(el: string, settings: StudioNode["settings"]): string {
  return renderToStaticMarkup(
    createElement(StudioWidget, {
      node: node(el, settings),
      device: "desktop",
    }),
  );
}

describe("pilot delegation: heading → shared heading widget", () => {
  it("renders the shared heading voice (h2 + display class), not the inline leading-tight hN", () => {
    const html = htmlFor("heading", { text: "Hello", level: 2 });
    expect(html).toContain("<h2");
    expect(html).toContain("font-bangla-display");
    expect(html).toContain("Hello");
    expect(html).not.toContain("leading-tight");
  });

  it("maps studio level 1 to the shared primary h1", () => {
    const html = htmlFor("heading", { text: "Top", level: 1 });
    expect(html).toContain("<h1");
  });

  it("maps catalog string levels (h3) to shared h3", () => {
    const html = htmlFor("heading", { text: "Sub", level: "h3" });
    expect(html).toContain("<h3");
  });

  it("keeps the studio empty-text fallback instead of rendering nothing", () => {
    const html = htmlFor("heading", { text: "", level: 2 });
    expect(html).toContain("Add your heading text");
  });

  it("honours align center via the shared text-center class", () => {
    const html = htmlFor("heading", {
      text: "Centered",
      level: 2,
      align: "center",
    });
    expect(html).toContain("text-center");
  });
});

describe("pilot delegation: faq → shared faq widget (repeater wins)", () => {
  const items = [
    { question: "Repeater Q1", answer: "Repeater A1" },
    { question: "Repeater Q2", answer: "Repeater A2" },
  ];

  it("renders Disclosure buttons (shared a11y model), not native details/summary", () => {
    const html = htmlFor("faq", { heading: "FAQ", items });
    expect(html).toContain("aria-expanded");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
  });

  it("repeater items win over scalar q1/a1 pairs when both are present", () => {
    const html = htmlFor("faq", {
      heading: "FAQ",
      items,
      q1: "Scalar Q?",
      a1: "Scalar A.",
    });
    expect(html).toContain("Repeater Q1");
    expect(html).toContain("Repeater Q2");
    expect(html).not.toContain("Scalar Q?");
  });

  it("scalar q1/a1 pairs remain the fallback when items is empty", () => {
    const html = htmlFor("faq", {
      heading: "FAQ",
      items: [],
      q1: "Scalar Q?",
      a1: "Scalar A.",
    });
    expect(html).toContain("Scalar Q?");
    expect(html).toContain("Scalar A.");
  });

  it("renders the section heading through the shared h2 slot", () => {
    const html = htmlFor("faq", { heading: "Need help?", items });
    expect(html).toContain("Need help?");
    expect(html).toContain("<h2");
  });

  it("empty faq renders nothing (shared null contract, not the studio placeholder)", () => {
    expect(htmlFor("faq", { heading: "", items: [] })).toBe("");
  });
});

describe("pilot delegation: product_grid → shared product_grid widget", () => {
  it("renders the shared skeleton grid, not the storefront placeholder", () => {
    const html = htmlFor("product_grid", { heading: "Products", columns: 4 });
    expect(html).not.toContain("renders on the storefront");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("Products");
  });

  it("rows skin renders the shared stacked skeleton list", () => {
    const html = htmlFor("product_grid", {
      heading: "Products",
      columns: 4,
      skin: "rows",
    });
    expect(html).not.toContain("renders on the storefront");
    expect(html).toContain("animate-pulse");
  });
});

describe("pilot scope guard: neighbours are untouched", () => {
  it("text widget markup is byte-identical to the pre-delegation inline render", () => {
    const html = htmlFor("text", { text: "Neighbour copy" });
    expect(html).toBe('<p class="leading-relaxed">Neighbour copy</p>');
  });
});
