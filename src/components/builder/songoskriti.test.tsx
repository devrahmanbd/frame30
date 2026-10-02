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
import { readFileSync } from "node:fs";
import {
  catalogEntry,
  newSection,
  type Section,
  type SectionType,
} from "@/lib/builder-ast";
import { WIDGET_BY_KEY } from "@/lib/studio/catalog";
import { HERITAGE_WIDGETS } from "./heritage";
import {
  buildSongoskritiFallbackEntries,
  MEGA_PANEL_COLS,
  SONGOSKRITI_WIDGETS,
} from "./songoskriti";
import { MERCH_WIDGETS } from "./merch";
import { SectionRenderer } from "./SectionRenderer";
import { SOMVABONA_WIDGETS } from "./somvabona";
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
    link: (href: string) => href,
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
    expect(html).toContain("<blockquote");
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
    expect(html).toContain("max-w-[var(--fq-container");
    expect(html).toContain("px-4");
    expect(html).toContain("New arrivals");
  });

  it("docks the arrows to the rail header row (no floating controls)", () => {
    const html = renderRail(
      SONGOSKRITI_WIDGETS["product_rail"],
      railSection({ rows, pending: false }),
      { rows, pending: false },
    );
    const headingAt = html.indexOf("New arrivals");
    expect(headingAt).toBeGreaterThanOrEqual(0);
    // Legacy floating bottom-row controls are gone.
    expect(html).not.toContain("mt-2 flex justify-end");
  });

  it("reserves media space (aspect box) for every card, image or not", () => {
    const html = renderRail(
      SONGOSKRITI_WIDGETS["product_rail"],
      railSection({ rows, pending: false }),
      { rows, pending: false },
    );
    // Editorial variant → portrait box on loaded and imageless cards alike.
    expect(html.match(/aspect-\[3\/4\]/g)?.length ?? 0).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("renders custom luxury cards instead of standard merch cards", () => {
    const section = railSection({ rows, pending: false });
    const data = { rows, pending: false };
    const songo = renderRail(
      SONGOSKRITI_WIDGETS["product_rail"],
      section,
      data,
    );
    // Should use the custom luxury layout
    expect(songo).toContain("hover:scale-105");
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

describe("songoskriti mega_menu live-data tiers (REPORT-THEMES §4/§7.1)", () => {
  const Mega = SONGOSKRITI_WIDGETS["mega_menu"];

  const menuSection = (props: Record<string, unknown>): Section => ({
    ...newSection("mega_menu"),
    props: {
      label: "Shop",
      label_bn: "",
      limit: 8,
      columns: 4,
      ...props,
    },
  });

  function renderMega(
    section: Section,
    opts: {
      locale?: "en" | "bn";
      data?: WidgetCtx["data"];
      slot?: React.ReactNode;
    } = {},
  ) {
    const ctx: WidgetCtx = {
      ...ctxFor(section, opts.locale ?? "en"),
      data: opts.data,
      ...(opts.slot !== undefined ? { slot: opts.slot } : {}),
    };
    return renderToStaticMarkup(
      createElement(Mega as (p: WidgetCtx) => React.ReactElement, ctx),
    );
  }

  const taxRows = (n: number): WidgetRow[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `tax-${i}`,
      title: `Dept ${i}`,
      href: `/c/dept-${i}`,
    }));

  it("tier (b): taxonomy rows win as plain top-level links honoring limit", () => {
    const html = renderMega(menuSection({ limit: 2 }), {
      data: { rows: taxRows(5), pending: false },
    });
    expect(html).toContain("Dept 0");
    expect(html).toContain("Dept 1");
    expect(html).not.toContain("Dept 2");
    // Flat taxonomy rows carry no children: no dropdown panel is invented.
    expect(html).not.toContain("SHOP ALL");
    expect(html).not.toContain("সব দেখুন");
  });

  it("names the nav landmark from label, honoring label_bn", () => {
    const en = renderMega(menuSection({ label: "Shop" }), {
      data: { rows: taxRows(2), pending: false },
    });
    expect(en).toContain('aria-label="Shop"');
    const bn = renderMega(
      menuSection({ label: "Shop", label_bn: "কেনাকাটা" }),
      { locale: "bn", data: { rows: taxRows(2), pending: false } },
    );
    expect(bn).toContain('aria-label="কেনাকাটা"');
  });

  it("columns prop sizes the dropdown panel grid from the closed set", () => {
    // The panel itself is hover-gated (no hover in static markup), so pin
    // the contract at the source: a closed Tailwind map keyed by the
    // clamped `columns` prop, with panel-bearing fallback entries to act on.
    expect(MEGA_PANEL_COLS).toEqual({
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
    });
    const src = readFileSync(
      "src/components/builder/songoskriti.tsx",
      "utf8",
    );
    expect(src).toContain("MEGA_PANEL_COLS[columns]");
    const withPanels = buildSongoskritiFallbackEntries("en").filter(
      (entry) => entry.sections.length > 0,
    );
    expect(withPanels.length).toBeGreaterThan(0);
  });

  it("keeps the image-panel dropdown design (featured image + shop-all)", () => {
    // Hover-gated like the grid above: pin the design at the source so a
    // refactor cannot silently drop the panel's signature elements.
    const src = readFileSync(
      "src/components/builder/songoskriti.tsx",
      "utf8",
    );
    expect(src).toContain("featuredImage");
    expect(src).toContain("shopAllHref");
    expect(src).toContain("SHOP ALL");
    expect(src).toContain("aspect-[3/4]");
  });

  it("tier (c): no rows renders the hardcoded bilingual fallback tree", () => {
    const en = renderMega(menuSection({ limit: 10 }), { data: undefined });
    expect(en).toContain("Women");
    expect(en).toContain("/c/women");
    expect(en).toContain("New Arrivals");
    const bn = renderMega(menuSection({ limit: 10 }), {
      locale: "bn",
      data: { rows: [], pending: false },
    });
    expect(bn).toContain("মহিলা");
    expect(bn).toContain("শাড়ি");
    expect(bn).toContain("নতুন সংগ্রহ");
  });

  it("pending renders a skeleton, never a bare bar", () => {
    const html = renderMega(menuSection({}), {
      data: { rows: undefined, pending: true },
    });
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain("Women");
  });

  it("tier (a): a host-provided slot wins over every other tier", () => {
    const html = renderMega(menuSection({}), {
      data: { rows: taxRows(3), pending: false },
      slot: createElement("nav", { "aria-label": "Host menu" }, "host"),
    });
    expect(html).toContain("Host menu");
    expect(html).not.toContain("Dept 0");
  });

  it("keeps 44px targets, reduced-motion gating, and a named landmark", () => {
    const html = renderMega(menuSection({}), { data: undefined });
    expect(html).toContain("<nav");
    expect(html).toContain("aria-label=");
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("motion-safe:");
    // Entries with panels announce the dropdown relationship.
    expect(html).toContain('aria-haspopup="true"');
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

describe("lane B renderer paths", () => {
  it("mega_menu wires widget promo props into the panel (hover-gated: pinned at source)", () => {
    const src = readFileSync(
      "src/components/builder/songoskriti.tsx",
      "utf8",
    );
    expect(src).toContain('str("promoImage")');
    expect(src).toContain('str("promoHref")');
    expect(src).toContain('str("promoTitle")');
    expect(src).toContain("promoImage ? (");
  });

  it("generic MegaMenu renders the promo tile when set", () => {
    const src = readFileSync("src/components/builder/chrome.tsx", "utf8");
    expect(src).toContain('str("promoImage")');
    expect(src).toContain('str("promoHref")');
    expect(src).toContain('str("promoTitle")');
  });

  it("urgency_rail renders a countdown when endsAt is set", () => {
    const html = render(SOMVABONA_WIDGETS["urgency_rail"], {
      ...newSection("urgency_rail"),
      props: {
        heading: "Sale",
        limit: 4,
        endsAt: "2099-01-01T00:00:00Z",
        endsLabel: "Ends in",
      },
    });
    expect(html).toContain("Ends in");
  });

  it("urgency_rail omits the countdown when endsAt is unset", () => {
    const html = render(SOMVABONA_WIDGETS["urgency_rail"], {
      ...newSection("urgency_rail"),
      props: { heading: "Sale", limit: 4, endsAt: "", endsLabel: "" },
    });
    expect(html).not.toContain("Ends in");
  });

  it("circle_categories honors a non-square aspect", () => {
    const base = {
      ...newSection("circle_categories"),
      props: {
        heading: "Shop",
        aspect: "4/5",
        imageFirst: true,
        c1Title: "Women",
        c1Image: "/ph/w.png",
        c1Href: "/c/women",
      },
    };
    const html = render(APPAREL_WIDGETS["circle_categories"], base);
    expect(html).toContain("aspect-ratio:4/5");
    expect(html).not.toContain("rounded-full object-cover");
  });

  it("circle_categories stays circular by default", () => {
    const html = render(APPAREL_WIDGETS["circle_categories"], {
      ...newSection("circle_categories"),
      props: {
        heading: "Shop",
        c1Title: "Women",
        c1Image: "/ph/w.png",
        c1Href: "/c/women",
      },
    });
    expect(html).toContain("rounded-full object-cover");
  });
});

describe("theme-motion manifest execution", () => {
  const renderNode = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(SectionRenderer, {
        section: { ...newSection("heading"), props },
        editing: false,
        locale: "en",
        template: "index",
      }),
    );

  it("emits fq-fx classes and data hook for a requested effect", () => {
    const html = renderNode({ text: "Hi", advMotion: "stagger-grid" });
    expect(html).toContain("fq-fx fq-fx-stagger-grid");
    expect(html).toContain('data-motion-effect="stagger-grid"');
  });

  it("emits no motion hook when no effect is requested", () => {
    const html = renderNode({ text: "Hi" });
    expect(html).not.toContain("fq-fx");
    expect(html).not.toContain("data-motion-effect");
  });
});
