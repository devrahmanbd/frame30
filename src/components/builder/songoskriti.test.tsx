/**
 * Songoskriti renderer contracts — TDD for the Task 2 gap pack.
 *
 * Empty `slides`/`testimonials`/`items` arrays render graceful editing
 * placeholders and storefront null — never a throw, never a 500. Populated
 * rows render copy, bilingual twins, and controls (dots, links, badges).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  catalogEntry,
  newSection,
  type Section,
  type SectionType,
} from "@/lib/builder-ast";
import { WIDGET_BY_KEY } from "@/lib/studio/catalog";
import { HERITAGE_WIDGETS } from "./heritage";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import { MERCH_WIDGETS } from "./merch";
import { APPAREL_WIDGETS } from "./apparel";
import type { WidgetRow } from "@/lib/widget-data";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "./widgets";

const GAP_TYPES = [
  "hero_carousel",
  "finder_row",
  "craft_story",
  "testimonials",
  "trust_footer",
] as const satisfies readonly SectionType[];

function ctxFor(
  section: Section,
  locale: "en" | "bn" = "en",
  editing = false,
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing,
    locale,
    storeSlug: "test",
    data: undefined,
    renderChildren: () => null,
  };
}

function render(
  Cmp: WidgetComponent,
  section: Section,
  locale: "en" | "bn" = "en",
  editing = false,
) {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale, editing),
    ),
  );
}

describe("songoskriti gap pack wiring", () => {
  for (const type of GAP_TYPES) {
    it(`${type} has a builder entry, studio def, and renderer`, () => {
      expect(catalogEntry(type)).toBeDefined();
      expect(WIDGET_BY_KEY[type]).toBeDefined();
      expect(typeof WIDGET_COMPONENTS[type]).toBe("function");
    });
  }

  it("defaults instantiate without throwing", () => {
    for (const type of GAP_TYPES) {
      const section = newSection(type);
      const Cmp = WIDGET_COMPONENTS[type];
      expect(() => render(Cmp, section)).not.toThrow();
      expect(() => render(Cmp, section, "bn", true)).not.toThrow();
    }
  });
});

describe("hero_carousel empty state", () => {
  const Cmp = () => HERITAGE_WIDGETS["hero_carousel"];

  it("renders an editing placeholder for slides: []", () => {
    const section = { ...newSection("hero_carousel"), props: { slides: [] } };
    const html = render(Cmp(), section, "en", true);
    expect(html).toContain("at least one slide");
  });

  it("renders null on the storefront for slides: [], never throws", () => {
    const section = { ...newSection("hero_carousel"), props: { slides: [] } };
    expect(render(Cmp(), section)).toBe("");
  });

  it("renders slide copy with a single primary-styled CTA", () => {
    const section = {
      ...newSection("hero_carousel"),
      props: {
        slides: [
          {
            image: "",
            headline: "Woven for celebration",
            subhead: "Handloom festive colour.",
            ctaLabel: "Shop festive",
            ctaUrl: "/c/festive",
            caption: "Festive drop",
          },
        ],
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("Woven for celebration");
    expect(html).toContain("/c/festive");
    expect(html.match(/bg-primary/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

describe("finder_row", () => {
  const Cmp = () => SONGOSKRITI_WIDGETS["finder_row"];

  it("renders an editing placeholder when empty, null on storefront", () => {
    const section = { ...newSection("finder_row"), props: {} };
    expect(render(Cmp(), section, "en", true)).toContain("add occasions");
    expect(render(Cmp(), section)).toBe("");
  });

  it("renders occasion chips linking to collections", () => {
    const section = {
      ...newSection("finder_row"),
      props: {
        heading: "Shop by occasion",
        o1Label: "Eid and festive",
        o1Href: "/c/festive",
        o2Label: "Wedding",
        o2Href: "/c/wedding",
        o3Label: "",
        o3Href: "",
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("Shop by occasion");
    expect(html).toContain('href="/c/festive"');
    expect(html).toContain('href="/c/wedding"');
  });
});

describe("craft_story", () => {
  const Cmp = () => SONGOSKRITI_WIDGETS["craft_story"];

  it("renders an editing placeholder when empty, null on storefront", () => {
    const section = {
      ...newSection("craft_story"),
      props: { heading: "", body: "" },
    };
    expect(render(Cmp(), section, "en", true)).toContain("add a heading");
    expect(render(Cmp(), section)).toBe("");
  });

  it("renders copy with one link and no invented metrics", () => {
    const section = newSection("craft_story");
    const html = render(Cmp(), section);
    expect(html).toContain("From loom to wardrobe");
    expect(html).toContain("/pages/our-craft");
    // Metrics live in copy, not in Tailwind size classes (min-h-14,
    // 1440px containers), so strip tags before asserting.
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\d{3,}/);
  });
});

describe("testimonials", () => {
  const Cmp = () => SONGOSKRITI_WIDGETS["testimonials"];

  it("renders an editing placeholder for testimonials: [], null on storefront", () => {
    const section = {
      ...newSection("testimonials"),
      props: { testimonials: [] },
    };
    expect(render(Cmp(), section, "en", true)).toContain("add a quote");
    expect(render(Cmp(), section)).toBe("");
  });

  it("renders quote, name, and role with line-clamp-3 and dots", () => {
    const section = {
      ...newSection("testimonials"),
      props: {
        testimonials: [
          { quote: "Drapes beautifully.", author: "Nasrin", role: "Dhaka" },
          { quote: "Arrived on time.", author: "Rahim", role: "Chattogram" },
        ],
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("Drapes beautifully.");
    expect(html).toContain("Nasrin");
    expect(html).toContain("Dhaka");
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("Testimonial 2");
  });

  it("prefers বাংলা twins under the bn locale", () => {
    const section = {
      ...newSection("testimonials"),
      props: {
        testimonials: [
          {
            quote: "Drapes beautifully.",
            quote_bn: "চমৎকার।",
            author: "Nasrin",
            author_bn: "নাসরিন",
            role: "Dhaka",
            role_bn: "ঢাকা",
          },
        ],
      },
    };
    const html = render(Cmp(), section, "bn");
    expect(html).toContain("চমৎকার।");
    expect(html).toContain("নাসরিন");
  });
});

describe("trust_footer", () => {
  const Cmp = () => SONGOSKRITI_WIDGETS["trust_footer"];

  it("renders an editing placeholder when empty, null on storefront", () => {
    const section = {
      ...newSection("trust_footer"),
      props: { items: [] },
    };
    expect(render(Cmp(), section, "en", true)).toContain("add badges");
    expect(render(Cmp(), section)).toBe("");
  });

  it("prefers items[] rows when present", () => {
    const section = {
      ...newSection("trust_footer"),
      props: {
        items: [{ icon: "delivery", title: "Fast delivery", body: "" }],
        i1Title: "Ignored fallback",
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("Fast delivery");
    expect(html).not.toContain("Ignored fallback");
  });

  it("falls back to i1–i4 scalar triples", () => {
    const section = {
      ...newSection("trust_footer"),
      props: {
        ...newSection("trust_footer").props,
        items: [],
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("Fast delivery");
    expect(html).toContain("Easy returns");
    expect(html).toContain("Secure payment");
  });
});

describe("songoskriti product_rail rhythm (browser-verified 2026-09-24)", () => {
  const railSection = (data: WidgetCtx["data"]) => ({
    ...newSection("product_rail"),
    props: {
      ...newSection("product_rail").props,
      heading: "New arrivals",
      limit: 8,
      cardVariant: "editorial",
      showRating: true,
      promise: "In stock · Dispatched in 24h",
    },
  });

  const rows: WidgetRow[] = [
    {
      id: "p1",
      title: "Dhakai Jamdani saree",
      priceMinor: 12500_00,
      compareAtMinor: 15000_00,
      currency: "BDT",
      imageUrl: "/ph/songoskriti/prod-saree.png",
      inStock: true,
    },
    {
      id: "p2",
      title: "Silk panjabi",
      priceMinor: 4800_00,
      currency: "BDT",
      imageUrl: null,
      inStock: true,
    },
  ];

  function railCtx(section: Section, data: WidgetCtx["data"]): WidgetCtx {
    return { ...ctxFor(section), data };
  }

  function renderRail(
    Cmp: WidgetComponent,
    section: Section,
    data: WidgetCtx["data"],
  ) {
    return renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        railCtx(section, data),
      ),
    );
  }

  it("wraps the rail in a padded max-w container (H2 never flush)", () => {
    const html = renderRail(
      SONGOSKRITI_WIDGETS["product_rail"],
      railSection({ rows, pending: false }),
      { rows, pending: false },
    );
    expect(html).toContain("max-w-6xl");
    expect(html).toContain("px-4");
    expect(html).toContain("New arrivals");
  });

  it("docks the arrows to the rail header row (no floating controls)", () => {
    const html = renderRail(
      SONGOSKRITI_WIDGETS["product_rail"],
      railSection({ rows, pending: false }),
      { rows, pending: false },
    );
    // Header row carries heading + both arrows before the card list …
    expect(html).toContain("justify-between");
    const headingAt = html.indexOf("New arrivals");
    const arrowsAt = html.indexOf('aria-label="Scroll right"');
    const listAt = html.indexOf("<ul");
    expect(headingAt).toBeGreaterThanOrEqual(0);
    expect(arrowsAt).toBeGreaterThan(headingAt);
    expect(listAt).toBeGreaterThan(arrowsAt);
    // … and the legacy floating bottom-row controls are gone.
    expect(html).not.toContain("mt-2 flex justify-end");
  });

  it("reserves media space (aspect box) for every card, image or not", () => {
    const html = renderRail(
      SONGOSKRITI_WIDGETS["product_rail"],
      railSection({ rows, pending: false }),
      { rows, pending: false },
    );
    // Editorial variant → landscape box on loaded and imageless cards alike.
    expect(html.match(/aspect-\[4\/3\]/g)?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("keeps prices/badges/stars logic identical to the shared merch rail", () => {
    const section = railSection({ rows, pending: false });
    const data = { rows, pending: false };
    const songo = renderRail(
      SONGOSKRITI_WIDGETS["product_rail"],
      section,
      data,
    );
    const merch = renderRail(MERCH_WIDGETS["product_rail"], section, data);
    const cards = (html: string) =>
      html
        .split("<article")
        .slice(1)
        .map((part) => part.split("</article>")[0]);
    // Same cards, same order, byte-identical card markup.
    expect(cards(songo)).toEqual(cards(merch));
    expect(songo).toContain("★★★★★");
  });

  it("renders skeletons while pending and null when empty", () => {
    const section = railSection({ rows, pending: false });
    const pending = renderRail(SONGOSKRITI_WIDGETS["product_rail"], section, {
      rows: undefined,
      pending: true,
    });
    expect(pending).toContain("animate-pulse");
    expect(
      renderRail(SONGOSKRITI_WIDGETS["product_rail"], section, {
        rows: [],
        pending: false,
      }),
    ).toBe("");
  });
});

describe("songoskriti categories rhythm (browser-verified 2026-09-24)", () => {
  const catSection = () => ({
    ...newSection("circle_categories"),
    props: {
      heading: "Shop by category",
      c1Title: "Women",
      c1Image: "/ph/songoskriti/cat-women.png",
      c1Href: "/c/women",
      c2Title: "Men",
      c2Image: "/ph/songoskriti/cat-men.png",
      c2Href: "/c/men",
      c3Title: "",
      c3Image: "",
      c3Href: "",
      c4Title: "",
      c4Image: "",
      c4Href: "",
      c5Title: "",
      c5Image: "",
      c5Href: "",
      c6Title: "",
      c6Image: "",
      c6Href: "",
      c7Title: "",
      c7Image: "",
      c7Href: "",
      c8Title: "",
      c8Image: "",
      c8Href: "",
    },
  });

  it("renders circles with images (not cut-off arcs)", () => {
    const html = render(APPAREL_WIDGETS["circle_categories"], catSection());
    expect(html).toContain('src="/ph/songoskriti/cat-women.png"');
    expect(html).toContain("rounded-full object-cover");
    // The scroll row reserves the ring extent so rings never clip.
    expect(html).toContain("px-1");
    expect(html).toContain("pt-1");
  });

  it("keeps bottom spacing so no void sits between it and the rails", () => {
    const html = render(APPAREL_WIDGETS["circle_categories"], catSection());
    expect(html).toContain("py-4");
  });

  it("names each tile once for assistive tech (decorative image)", () => {
    const html = render(APPAREL_WIDGETS["circle_categories"], catSection());
    // Adjacent label carries the name; a titled alt would announce
    // "Women Women".
    expect(html).toContain('alt=""');
    expect(html).not.toContain('alt="Women"');
  });

  it("centers the section header on the theme display face", () => {
    const html = render(APPAREL_WIDGETS["circle_categories"], catSection());
    expect(html).toContain("justify-center");
    expect(html).toContain("font-theme-display");
    expect(html).not.toContain("font-serif");
  });
});
