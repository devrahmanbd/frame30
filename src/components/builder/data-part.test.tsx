/**
 * LANE B2-3 — data-part hooks + urgency_rail skin vocabulary.
 *
 * - urgency_rail reuses the product_rail skin vocabulary (same cards, same
 *   rail); core default is editorial.
 * - Renderers emit stable `data-part` hooks theme skin sheets key on:
 *   price / title / promise / caption / author (+ badge where a badge
 *   element exists). Attributes only — no class, style or copy change.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  catalogEntry,
  DEFAULT_WIDGET_SKIN,
  newSection,
  parseAst,
  resolveSkin,
  WIDGET_SKINS,
  type Section,
} from "@/lib/builder-ast";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import type { WidgetRow } from "@/lib/widget-data";

function ctxFor(
  section: Section,
  locale: "en" | "bn" = "en",
  data?: WidgetCtx["data"],
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    data,
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function render(
  Cmp: WidgetComponent,
  section: Section,
  locale: "en" | "bn" = "en",
  data?: WidgetCtx["data"],
) {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale, data),
    ),
  );
}

const ROWS: WidgetRow[] = [
  {
    id: "p1",
    title: "Dhakai Jamdani saree",
    priceMinor: 12500_00,
    compareAtMinor: 15000_00,
    currency: "BDT",
    imageUrl: "/ph/rail-saree.png",
    inStock: true,
  },
];

describe("B2-3 urgency_rail skin vocabulary", () => {
  it("reuses the product_rail vocabulary with editorial first", () => {
    expect([...WIDGET_SKINS.urgency_rail]).toEqual([
      ...WIDGET_SKINS.product_rail,
    ]);
    expect(WIDGET_SKINS.urgency_rail[0]).toBe("editorial");
    expect(DEFAULT_WIDGET_SKIN.urgency_rail).toBe("editorial");
  });

  it("catalog declares the skin select in the style panel", () => {
    const entry = catalogEntry("urgency_rail")!;
    const field = entry.fields.find((f) => f.key === "skin")!;
    expect(field.kind).toBe("select");
    expect(field.panel).toBe("style");
    expect(field.options?.map((o) => o.value)).toEqual([
      "editorial",
      "compact",
      "minimal",
    ]);
    expect(entry.defaults["skin"]).toBe("editorial");
  });

  it("parseAst round-trips the skin and coerces unknown to editorial", () => {
    const kept = parseAst({
      main: [{ id: "u1", type: "urgency_rail", props: { skin: "compact" } }],
    });
    expect(kept.main[0]!.props["skin"]).toBe("compact");
    const fallback = parseAst({
      main: [{ id: "u2", type: "urgency_rail", props: { skin: "neon" } }],
    });
    expect(fallback.main[0]!.props["skin"]).toBe("editorial");
    const def = parseAst({
      main: [{ id: "u3", type: "urgency_rail", props: {} }],
    });
    expect(def.main[0]!.props["skin"]).toBe("editorial");
    expect(resolveSkin("urgency_rail", "compact")).toBe("compact");
  });

  it("SectionRenderer emits the urgency_rail pair", () => {
    const html = renderToStaticMarkup(
      <SectionRenderer section={newSection("urgency_rail")} locale="en" />,
    );
    expect(html).toContain('data-widget="urgency_rail"');
    expect(html).toContain('data-skin="editorial"');
  });
});

describe("B2-3 data-part hooks (attributes only)", () => {
  it("product cards expose title, price, badge and promise", () => {
    const section: Section = {
      ...newSection("product_rail"),
      props: {
        ...newSection("product_rail").props,
        promise: "Cash on delivery",
        badgeLabel: "Save",
        showRating: false,
      },
    };
    const html = render(WIDGET_COMPONENTS.product_rail, section, "en", {
      rows: ROWS,
      pending: false,
    });
    expect(html).toContain('data-part="title"');
    expect(html).toContain('data-part="price"');
    // Save-% badge (compare-at leg present).
    expect(html).toContain('data-part="badge"');
    expect(html).toContain('data-part="promise"');
    // Copy untouched.
    expect(html).toContain("Dhakai Jamdani saree");
    expect(html).toContain("Cash on delivery");
  });

  it("deal cards expose their badge", () => {
    const html = render(WIDGET_COMPONENTS.deal_card, newSection("deal_card"));
    expect(html).toContain('data-part="badge"');
  });

  it("hero slides expose their caption", () => {
    const base = newSection("hero_carousel");
    const section: Section = {
      ...base,
      props: {
        ...base.props,
        slides: [
          {
            image: "",
            headline: "Woven for celebration",
            headline_bn: "",
            subhead: "Handloom festive colour.",
            subhead_bn: "",
            ctaLabel: "Shop festive",
            ctaUrl: "/c/festive",
            caption: "Festive drop",
          },
        ],
      },
    };
    const html = render(WIDGET_COMPONENTS.hero_carousel, section);
    expect(html).toContain('data-part="caption"');
    expect(html).toContain("Festive drop");
  });

  it("testimonials expose their author", () => {
    const base = newSection("testimonials");
    const section: Section = {
      ...base,
      props: {
        ...base.props,
        testimonials: [
          { quote: "Drapes beautifully.", author: "Nasrin", role: "Dhaka" },
        ],
      },
    };
    const html = render(WIDGET_COMPONENTS.testimonials, section);
    expect(html).toContain('data-part="author"');
    expect(html).toContain("Nasrin");
  });

  it("buy box exposes price and promise", () => {
    const base = newSection("buy_box");
    const section: Section = {
      ...base,
      props: { ...base.props, promise: "Ships in 24h" },
    };
    const html = render(WIDGET_COMPONENTS.buy_box, section, "en", {
      rows: ROWS,
      pending: false,
    });
    expect(html).toContain('data-part="price"');
    expect(html).toContain('data-part="promise"');
  });

  it("urgency rails expose card hooks plus the stock badge", () => {
    const base = newSection("urgency_rail");
    const section: Section = {
      ...base,
      props: { ...base.props, promise: "Ships in 24h" },
    };
    const html = render(WIDGET_COMPONENTS.urgency_rail, section, "en", {
      rows: [{ ...ROWS[0]!, count: 2 }],
      pending: false,
    });
    expect(html).toContain('data-part="title"');
    expect(html).toContain('data-part="price"');
    expect(html).toContain('data-part="badge"');
    expect(html).toContain('data-part="promise"');
  });
});
