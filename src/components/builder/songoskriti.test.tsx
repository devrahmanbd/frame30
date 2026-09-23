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
    expect(html).not.toMatch(/\d{3,}/);
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
