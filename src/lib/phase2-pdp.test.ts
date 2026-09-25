/**
 * Phase 2.3 — PDP widget contract tests.
 *
 * Pure helpers only: variant selection, option-axis parsing, review
 * aggregation and star clamping. Renderers are covered by the shared
 * theme-independence scan in `widget-registry.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultVariant,
  variantAxes,
  reviewStats,
} from "@/components/builder/pdp";
import {
  clampRating,
  histogramPercents,
} from "@/components/builder/primitives/Stars";
import { swatchStyle } from "@/components/builder/primitives/SwatchDot";
import {
  SECTION_CATALOG,
  BITEXT_FIELDS,
  type SectionType,
} from "./builder-ast";
import { widgetMeta } from "./widget-registry";

const PDP_TYPES: SectionType[] = [
  "buy_box",
  "variant_picker",
  "delivery_promise",
  "stock_delivery",
  "rating_summary",
  "review_list",
  "product_qna",
  "seller_card",
  "sticky_buy_bar",
];

const row = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, title: id, ...extra }) as never;

describe("variant selection", () => {
  it("prefers the cheapest in-stock variant", () => {
    const rows = [
      row("a", { priceMinor: 900, inStock: false }),
      row("b", { priceMinor: 1500, inStock: true }),
      row("c", { priceMinor: 1200, inStock: true }),
    ];
    expect(defaultVariant(rows)?.id).toBe("c");
  });

  it("falls back to a sold-out variant when nothing is in stock", () => {
    const rows = [row("a", { priceMinor: 900, inStock: false })];
    expect(defaultVariant(rows)?.id).toBe("a");
  });

  it("returns nothing for an empty set", () => {
    expect(defaultVariant([])).toBeUndefined();
    expect(defaultVariant(undefined)).toBeUndefined();
  });
});

describe("option axes", () => {
  it("splits slash paths into de-duplicated ordered axes", () => {
    const rows = [
      row("1", { options: "Red / M" }),
      row("2", { options: "Red / L" }),
      row("3", { options: "Blue / M" }),
    ];
    expect(variantAxes(rows)).toEqual([
      ["Red", "Blue"],
      ["M", "L"],
    ]);
  });

  it("handles single-axis products", () => {
    expect(variantAxes([row("1", { options: "500g" })])).toEqual([["500g"]]);
  });
});

describe("review aggregation", () => {
  it("averages and buckets ratings", () => {
    const rows = [
      row("1", { rating: 5 }),
      row("2", { rating: 4 }),
      row("3", { rating: 5 }),
    ];
    const stats = reviewStats(rows);
    expect(stats.total).toBe(3);
    expect(Math.round(stats.average * 100) / 100).toBe(4.67);
    expect(stats.buckets).toEqual([0, 0, 0, 1, 2]);
  });

  it("clamps out-of-range ratings and empty sets", () => {
    expect(clampRating(9)).toBe(5);
    expect(clampRating(-2)).toBe(0);
    expect(clampRating(null)).toBe(0);
    expect(reviewStats([]).average).toBe(0);
    expect(histogramPercents([0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
    expect(histogramPercents([1, 0, 0, 0, 3])).toEqual([25, 0, 0, 0, 75]);
  });
});

describe("swatch safety", () => {
  it("only accepts hex, linear-gradient and image values", () => {
    expect(swatchStyle({ hex: "#ff0000" }).backgroundColor).toBe("#ff0000");
    expect(swatchStyle({ hex: "red; background:url(x)" }).backgroundColor).toBe(
      "hsl(var(--muted))",
    );
    expect(
      swatchStyle({ gradient: "linear-gradient(90deg,#000,#fff)" })
        .backgroundImage,
    ).toContain("linear-gradient");
    expect(swatchStyle({ gradient: "url(evil)" }).backgroundColor).toBe(
      "hsl(var(--muted))",
    );
  });
});

describe("PDP catalogue wiring", () => {
  it("registers every PDP widget with a catalogue entry and bitext prose", () => {
    for (const type of PDP_TYPES) {
      const entry = SECTION_CATALOG.find((e) => e.type === type);
      expect(entry, `${type} catalogue entry`).toBeTruthy();
      expect(BITEXT_FIELDS[type]?.length, `${type} bitext`).toBeGreaterThan(0);
    }
  });

  it("binds the data-driven PDP widgets to a batched source", () => {
    const sources: Partial<Record<SectionType, string>> = {
      buy_box: "variants",
      variant_picker: "variants",
      stock_delivery: "variants",
      sticky_buy_bar: "variants",
      rating_summary: "reviews",
      review_list: "reviews",
      product_qna: "qna",
    };
    for (const [type, source] of Object.entries(sources) as [
      SectionType,
      string,
    ][]) {
      expect(widgetMeta(type)!.data?.source, `${type} source`).toBe(source);
    }
  });

  it("never divides money in the PDP renderers", () => {
    const src = readFileSync("src/components/builder/pdp.tsx", "utf8");
    expect(src).not.toMatch(/Minor\s*\/\s*100/);
    expect(src).not.toMatch(/toFixed\(2\)/);
  });
});

describe("sticky buy bar — cart-lane parity", () => {
  const src = readFileSync("src/components/builder/pdp.tsx", "utf8");
  const region = src.slice(
    src.indexOf("const StickyBuyBar"),
    src.indexOf("export const PDP_WIDGETS"),
  );

  it("announces the re-quoted price to screen readers in both locales", () => {
    expect(region).toContain("sr-only");
    expect(region).toContain('aria-live="polite"');
    expect(region).toContain('aria-atomic="true"');
    // Bilingual announcement chrome; the figure itself is render-only money().
    expect(region).toContain("দাম");
    expect(region).toContain("Price");
    expect(region).toContain("money(variant.priceMinor");
  });

  it("gates press/state motion behind motion-safe with 44px targets", () => {
    expect(region).toContain("motion-safe:transition");
    expect(region).toContain("motion-safe:active:scale-");
    expect(region).toContain("focus-visible:ring-2");
    // h-11 is exactly 44px; the CTA keeps its full-height target.
    expect(region).toMatch(/h-11/);
  });

  it("keeps overlay ownership out and hardcodes no raw colour", () => {
    expect(region).not.toMatch(/body\.style\.overflow/);
    expect(region).not.toMatch(/aria-modal/);
    expect(region.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(region).not.toMatch(/theme|preset|bazaar|atelier|circuit|rupaboti/i);
  });
});
