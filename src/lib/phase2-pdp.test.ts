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
  cartLineForVariant,
  defaultVariant,
  resolveChannelVariant,
  variantAxes,
  variantChannelIndex,
  variantOptionLabel,
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

describe("variant channel selection (Track V)", () => {
  const rows = [
    row("s", { options: "Size S", priceMinor: 1000, inStock: true }),
    row("m", { options: "Size M", priceMinor: 1200, inStock: true }),
    row("xl", { options: "Size XL / Red", priceMinor: 1500, inStock: true }),
  ];

  it("pick-XL-adds-XL: the published index resolves back to the picked variant", () => {
    const published = String(variantChannelIndex(rows, "xl"));
    expect(published).toBe("2");
    expect(resolveChannelVariant(rows, [published])?.id).toBe("xl");
  });

  it("stamps variant_id plus the human-readable options string on the cart line", () => {
    const picked = rows[2]!;
    const line = cartLineForVariant(picked, 2);
    expect(line.variantId).toBe("xl");
    expect(line.quantity).toBe(2);
    expect(line.variantName).toBe("Size XL / Red");
    expect(variantOptionLabel(picked)).toBe("Size XL / Red");
  });

  it("no-selection-falls-back: empty and unknown payloads keep today's default", () => {
    expect(resolveChannelVariant(rows, [])?.id).toBe(
      defaultVariant(rows)?.id,
    );
    expect(resolveChannelVariant(rows, undefined)?.id).toBe(
      defaultVariant(rows)?.id,
    );
    expect(resolveChannelVariant(rows, ["nope"])?.id).toBe(
      defaultVariant(rows)?.id,
    );
    expect(resolveChannelVariant(rows, ["99"])?.id).toBe(
      defaultVariant(rows)?.id,
    );
    expect(resolveChannelVariant([], ["0"])).toBeUndefined();
    expect(resolveChannelVariant(undefined, ["0"])).toBeUndefined();
  });

  it("sold-out selection cannot be submitted, with bilingual product-variant copy", () => {
    const src = readFileSync("src/components/builder/pdp.tsx", "utf8");
    const buyBox = src.slice(
      src.indexOf("const BuyBox"),
      src.indexOf("const VariantPicker"),
    );
    const sticky = src.slice(src.indexOf("const StickyBuyBar"));
    for (const region of [buyBox, sticky]) {
      expect(region).toContain("resolveChannelVariant");
      expect(region).toContain("cartLineForVariant");
      expect(region).toContain("variant.inStock === false");
      expect(region).toContain("disabled");
      expect(region).toContain("This product variant is out of stock");
      expect(region).toContain("এই প্রোডাক্ট ভ্যারিয়েন্টটি স্টকে নেই");
    }
    // Copy says product variant — never theme variation.
    expect(src).not.toMatch(/theme variation/i);
    expect(src).not.toMatch(/variation/i);
  });

  it("the picker publishes every selection mode on the variant channel", () => {
    const src = readFileSync("src/components/builder/pdp.tsx", "utf8");
    const picker = src.slice(
      src.indexOf("const VariantPicker"),
      src.indexOf("const DeliveryPromise"),
    );
    expect(picker).toContain('useSectionChannel(storeSlug ?? "demo", "variant")');
    expect(picker).toContain("variantChannelIndex");
    // dropdown, matrix, shade, swatch and chip all route through select():
    // no event handler writes the raw state setter anymore.
    expect(picker).toContain("const select = (id: string)");
    expect(picker).not.toMatch(/=>\s*(match\s*&&\s*)?setSelected\(/);
    expect(picker).not.toMatch(/onChange=\{\(e\) => setSelected/);
  });

  it("dashboard line shows the options string via the existing variant_name column", () => {
    const pricing = readFileSync("src/lib/pricing.server.ts", "utf8");
    const orders = readFileSync("src/lib/orders.server.ts", "utf8");
    const dashboard = readFileSync(
      "src/routes/_authenticated/dashboard/orders/$orderId.tsx",
      "utf8",
    );
    // Quote resolves the human variant name by id…
    expect(pricing).toContain("variantName: v.name");
    // …orders persist it…
    expect(orders).toContain("variant_name: l.variantName");
    // …and the dashboard renders that column (read-only, inherits accuracy).
    expect(dashboard).toContain("{i.variant_name}");
  });
});
