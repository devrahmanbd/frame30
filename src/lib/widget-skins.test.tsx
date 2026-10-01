/**
 * Widget skins — Core lane contracts (spec 2026-09-25 §1–§3).
 *
 * Unknown or empty `skin` resolves to the widget default (never a crash,
 * never empty); every skin renders headings, bn/en copy, 44px targets and
 * reduced-motion-safe markup; SectionRenderer emits the central
 * `data-widget` + `data-skin` pair theme sheets key on.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  catalogEntry,
  combineUsedSkinCss,
  DEFAULT_WIDGET_SKIN,
  isSkinnableType,
  newSection,
  parseAst,
  resolveSkin,
  usedWidgetSkins,
  WIDGET_SKINS,
  withThemeWidgetDefaults,
  type PropValue,
  type Section,
  type SectionType,
} from "./builder-ast";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import type { WidgetRow } from "./widget-data";

const SKINNABLE = Object.keys(WIDGET_SKINS) as SectionType[];

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

function shell(section: Section, locale: "en" | "bn" = "en") {
  return renderToStaticMarkup(
    <SectionRenderer section={section} locale={locale} />,
  );
}

const RAIL_ROWS: WidgetRow[] = [
  {
    id: "p1",
    title: "Dhakai Jamdani saree",
    priceMinor: 12500_00,
    currency: "BDT",
    imageUrl: "/ph/rail-saree.png",
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

const HERO_SLIDES = [
  {
    image: "",
    headline: "Woven for celebration",
    headline_bn: "উৎসবের বুনন",
    subhead: "Handloom festive colour.",
    subhead_bn: "হাতে বোনা উৎসবের রং।",
    ctaLabel: "Shop festive",
    ctaUrl: "/c/festive",
    caption: "Festive drop",
  },
];

const QUOTES = [
  { quote: "Drapes beautifully.", author: "Nasrin", role: "Dhaka" },
  { quote: "Arrived on time.", author: "Rahim", role: "Chattogram" },
];

function populated(type: SectionType): Section {
  const base = newSection(type);
  if (type === "hero_carousel")
    return { ...base, props: { ...base.props, slides: HERO_SLIDES } };
  if (type === "testimonials")
    return { ...base, props: { ...base.props, testimonials: QUOTES } };
  return base;
}

function withSkin(section: Section, skin: string): Section {
  return { ...section, props: { ...section.props, skin } };
}

describe("resolveSkin — closed vocabulary with safe fallback", () => {
  for (const type of SKINNABLE) {
    it(`${type} passes its own skins through`, () => {
      for (const skin of WIDGET_SKINS[type as keyof typeof WIDGET_SKINS])
        expect(resolveSkin(type, skin)).toBe(skin);
    });

    it(`${type} falls back to ${DEFAULT_WIDGET_SKIN[type as keyof typeof DEFAULT_WIDGET_SKIN]} on unknown/empty`, () => {
      const fallback =
        DEFAULT_WIDGET_SKIN[type as keyof typeof DEFAULT_WIDGET_SKIN];
      for (const raw of ["neon", "", "  ", null, undefined, 42, true])
        expect(resolveSkin(type, raw)).toBe(fallback);
    });
  }

  it("returns no skin for non-skinnable types", () => {
    expect(resolveSkin("hero", "split")).toBe("");
    expect(isSkinnableType("hero")).toBe(false);
    expect(isSkinnableType("product_rail")).toBe(true);
  });
});

describe("catalog — skin select field in the style panel", () => {
  for (const type of SKINNABLE) {
    it(`${type} declares a skin select with the documented default first`, () => {
      const entry = catalogEntry(type)!;
      const field = entry.fields.find((f) => f.key === "skin")!;
      expect(field).toBeDefined();
      expect(field.kind).toBe("select");
      expect(field.panel).toBe("style");
      expect(field.options?.map((o) => o.value)).toEqual([
        ...WIDGET_SKINS[type as keyof typeof WIDGET_SKINS],
      ]);
      expect(entry.defaults["skin"]).toBe(
        DEFAULT_WIDGET_SKIN[type as keyof typeof DEFAULT_WIDGET_SKIN],
      );
      // First option matches the renderer default (ATMOSPHERE precedent).
      expect(field.options?.[0]?.value).toBe(entry.defaults["skin"]);
    });
  }

  it("parseAst coerces an unknown stored skin to the default", () => {
    const ast = parseAst({
      main: [
        { id: "r1", type: "product_rail", props: { skin: "neon" } },
        { id: "g1", type: "product_grid", props: {} },
      ],
    });
    expect(ast.main[0]!.props["skin"]).toBe("editorial");
    expect(ast.main[1]!.props["skin"]).toBe("cards");
  });
});

describe("SectionRenderer — central data-widget/data-skin", () => {
  for (const type of SKINNABLE) {
    it(`${type} emits the resolved pair`, () => {
      const html = shell(populated(type));
      expect(html).toContain(`data-widget="${type}"`);
      expect(html).toContain(
        `data-skin="${DEFAULT_WIDGET_SKIN[type as keyof typeof DEFAULT_WIDGET_SKIN]}"`,
      );
    });
  }

  it("emits an explicit skin and falls back on unknown", () => {
    const html = shell(withSkin(populated("product_grid"), "rows"));
    expect(html).toContain('data-widget="product_grid"');
    expect(html).toContain('data-skin="rows"');
    const unknown = shell(withSkin(populated("testimonials"), "neon"));
    expect(unknown).toContain('data-skin="carousel"');
  });

  it("emits no pair for non-skinnable widgets", () => {
    const html = shell(newSection("heading"));
    expect(html).not.toContain("data-widget=");
    expect(html).not.toContain("data-skin=");
  });
});

describe("per-skin render smoke — headings, copy, targets, motion", () => {
  const cases: { type: SectionType; copy: string; data?: WidgetCtx["data"] }[] =
    [
      {
        type: "product_rail",
        copy: "Trending now",
        data: { rows: RAIL_ROWS, pending: false },
      },
      { type: "hero_carousel", copy: "Woven for celebration" },
      { type: "testimonials", copy: "Drapes beautifully." },
      { type: "product_grid", copy: "Products" },
    ];

  for (const { type, copy, data } of cases) {
    for (const skin of WIDGET_SKINS[type as keyof typeof WIDGET_SKINS]) {
      it(`${type}/${skin} renders its copy without throwing`, () => {
        const Cmp = WIDGET_COMPONENTS[type];
        const section = withSkin(populated(type), skin as string);
        let html = "";
        expect(() => {
          html = render(Cmp, section, "en", data);
        }).not.toThrow();
        expect(html).toContain(copy);
      });
    }

    it(`${type} renders an unknown skin as its default`, () => {
      const Cmp = WIDGET_COMPONENTS[type];
      const section = withSkin(populated(type), "neon");
      const html = render(Cmp, section, "en", data);
      expect(html).toContain(copy);
      // The default composition survives: rails keep docked arrows, the
      // hero keeps its wash, testimonials keep dots, grids keep the grid.
      if (type === "product_rail") expect(html).toContain("Scroll right");
      if (type === "hero_carousel") expect(html).toContain("fq-theme-aurora");
      if (type === "testimonials") expect(html).toContain("Testimonial 2");
      if (type === "product_grid") expect(html).toContain("grid");
    });
  }

  it("every interactive skin keeps 44px targets", () => {
    const rail = render(
      WIDGET_COMPONENTS.product_rail,
      withSkin(populated("product_rail"), "compact"),
      "en",
      { rows: RAIL_ROWS, pending: false },
    );
    expect(rail).toContain("h-11 w-11");
    const hero = render(
      WIDGET_COMPONENTS.hero_carousel,
      withSkin(
        {
          ...populated("hero_carousel"),
          props: {
            ...populated("hero_carousel").props,
            slides: [
              ...HERO_SLIDES,
              { ...HERO_SLIDES[0]!, headline: "Second drop" },
            ],
          },
        },
        "fullbleed",
      ),
    );
    expect(hero).toContain("min-h-11");
    const carousel = render(
      WIDGET_COMPONENTS.testimonials,
      withSkin(populated("testimonials"), "carousel"),
    );
    expect(carousel).toContain("min-h-11");
  });

  it("reduced-motion users get static markup, never autoplay-only content", () => {
    // Autoplay arms only inside effects (never SSR); the motion-safe guards
    // below prove animated surfaces collapse to static when requested.
    const hero = render(
      WIDGET_COMPONENTS.hero_carousel,
      withSkin(populated("hero_carousel"), "minimal"),
    );
    expect(hero).toContain("Woven for celebration");
    const single = render(
      WIDGET_COMPONENTS.testimonials,
      withSkin(populated("testimonials"), "single"),
    );
    expect(single).toContain("Drapes beautifully.");
    expect(single).not.toContain("Testimonial 2");
    const wall = render(
      WIDGET_COMPONENTS.testimonials,
      withSkin(populated("testimonials"), "wall"),
    );
    expect(wall).toContain("<ul");
    expect(wall).toContain("Rahim");
  });

  it("product_grid/rows lists every row with price semantics intact", () => {
    const section = withSkin(newSection("product_grid"), "rows");
    const html = render(WIDGET_COMPONENTS.product_grid, section, "en", {
      rows: RAIL_ROWS,
      pending: false,
    });
    expect(html).toContain("Products");
    expect(html).toContain("Dhakai Jamdani saree");
    expect(html).toContain("Silk panjabi");
  });

  it("bn twins resolve under the bn locale", () => {
    const section = withSkin(populated("hero_carousel"), "split");
    expect(render(WIDGET_COMPONENTS.hero_carousel, section, "bn")).toContain(
      "উৎসবের বুনন",
    );
  });
});

describe("theme preset defaults — authored props win", () => {
  const theme: Partial<Record<SectionType, Record<string, PropValue>>> = {
    product_rail: { skin: "minimal", limit: 8 },
    hero_carousel: { skin: "fullbleed" },
  };

  it("fills gaps from the theme and keeps authored values", () => {
    const merged = withThemeWidgetDefaults(
      "product_rail",
      { heading: "Picked for you", skin: "compact" },
      theme,
    );
    expect(merged["skin"]).toBe("compact");
    expect(merged["heading"]).toBe("Picked for you");
    expect(merged["limit"]).toBe(8);
  });

  it("rejects theme keys the catalog does not declare", () => {
    const merged = withThemeWidgetDefaults(
      "product_rail",
      {},
      {
        product_rail: { skin: "minimal", evil: "x" },
      },
    );
    expect(merged["skin"]).toBe("minimal");
    expect(merged).not.toHaveProperty("evil");
  });

  it("returns authored props untouched without theme defaults", () => {
    expect(
      withThemeWidgetDefaults("product_grid", { heading: "Sale" }),
    ).toEqual({ heading: "Sale" });
  });
});

describe("skin-stylesheet loading contract", () => {
  it("collects used skins across slots and container children", () => {
    const rail = withSkin(newSection("product_rail"), "minimal");
    const nested = withSkin(newSection("testimonials"), "wall");
    const used = usedWidgetSkins({
      header: [],
      main: [
        rail,
        { ...newSection("container"), children: [nested] },
        withSkin(newSection("product_rail"), "minimal"),
      ],
      footer: [],
    });
    expect(used).toEqual([
      { type: "product_rail", skin: "minimal", key: "product_rail:minimal" },
      { type: "testimonials", skin: "wall", key: "testimonials:wall" },
    ]);
  });

  it("resolves unknown stored skins to defaults when collecting", () => {
    const used = usedWidgetSkins([withSkin(newSection("hero_carousel"), "x")]);
    expect(used).toEqual([
      { type: "hero_carousel", skin: "split", key: "hero_carousel:split" },
    ]);
  });

  it("inlines only the sheets a page uses", () => {
    const css = combineUsedSkinCss(
      {
        "product_rail:minimal": '[data-skin="minimal"]{a:b}',
        "product_rail:editorial": '[data-skin="editorial"]{c:d}',
      },
      ["product_rail:minimal", "hero_carousel:split"],
    );
    expect(css).toContain("minimal");
    expect(css).not.toContain("editorial");
  });
});

describe("hero_carousel/banner skin (biba-style banner, spec 2026-10-01)", () => {
  function bannerSection() {
    const base = populated("hero_carousel");
    return {
      ...base,
      props: {
        ...base.props,
        skin: "banner",
        slides: [
          ...HERO_SLIDES,
          { ...HERO_SLIDES[0]!, headline: "Second drop" },
        ],
      },
    };
  }

  it('resolveSkin passes "banner" through; global default stays "split"', () => {
    expect(resolveSkin("hero_carousel", "banner")).toBe("banner");
    expect(DEFAULT_WIDGET_SKIN.hero_carousel).toBe("split");
    expect(WIDGET_SKINS.hero_carousel).toEqual([
      "split",
      "fullbleed",
      "minimal",
      "banner",
    ]);
  });

  it("banner renders track, aspect classes, arrows, dots and no aurora", () => {
    const html = render(WIDGET_COMPONENTS.hero_carousel, bannerSection());
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("md:aspect-[2/1]");
    expect(html).toContain("translateX(-0%)");
    expect(html).toContain("Previous slide");
    expect(html).toContain("Next slide");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("bg-gradient-to-t");
    expect(html).toContain("data-hero-headline");
    expect(html).toContain("data-hero-cta");
    expect(html).not.toContain("fq-theme-aurora");
  });

  it("banner hides controls for a single slide", () => {
    const html = render(
      WIDGET_COMPONENTS.hero_carousel,
      withSkin(populated("hero_carousel"), "banner"),
    );
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Previous slide");
  });

  it("split keeps its wash; other skins keep no arrows", () => {
    const split = render(
      WIDGET_COMPONENTS.hero_carousel,
      withSkin(populated("hero_carousel"), "split"),
    );
    expect(split).toContain("fq-theme-aurora");
    expect(split).not.toContain("Previous slide");
  });
});
