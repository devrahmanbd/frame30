/**
 * LANE B2-3 — data-part hooks + urgency_rail skin vocabulary.
 *
 * - urgency_rail reuses the product_rail skin vocabulary (same cards, same
 *   rail); core default is editorial, Somvabona overrides to compact.
 * - Renderers emit stable `data-part` hooks theme skin sheets key on:
 *   price / title / promise / caption / author (+ badge where a badge
 *   element exists). Attributes only — no class, style or copy change.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  catalogEntry,
  DEFAULT_WIDGET_SKIN,
  newSection,
  parseAst,
  parsePickedHandles,
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

// `Link` needs a live router; the picked-rows cases below are about which
// rows render, so the router is stubbed down to the anchor it would emit
// (BlogArchiveTheme.test.tsx precedent). No case in this file renders inside
// a RouterProvider, and none of the other widgets touch `Link`.
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...rest
    }: Record<string, unknown> & { children?: unknown }) => {
      const path = String(to ?? "").replace(/\$(\w+)/g, (_m, key: string) =>
        String((params as Record<string, string> | undefined)?.[key] ?? ""),
      );
      return (
        <a href={path} {...(rest as Record<string, unknown>)}>
          {children as React.ReactNode}
        </a>
      );
    },
  };
});

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

describe("Phase 4 parsePickedHandles", () => {
  it("normalises comma-separated picks like stored slugs", () => {
    expect(
      parsePickedHandles(" Silk-Saree ,, jamdani-dupatta,SILK-SAREE "),
    ).toEqual(["silk-saree", "jamdani-dupatta"]);
  });

  it("degrades unparseable input to empty, never throws", () => {
    expect(parsePickedHandles("")).toEqual([]);
    expect(parsePickedHandles(undefined)).toEqual([]);
    expect(parsePickedHandles(null)).toEqual([]);
    expect(parsePickedHandles(42)).toEqual([]);
    expect(parsePickedHandles("!!! , ---")).toEqual([]);
    expect(parsePickedHandles(["a"])).toEqual([]);
  });

  it("caps picks at MAX_ARRAY_ROWS", () => {
    const raw = Array.from({ length: 40 }, (_, i) => `pick-${i}`).join(",");
    expect(parsePickedHandles(raw)).toHaveLength(24);
  });
});

describe("Phase 4 picker binding round-trip", () => {
  it("parseAst preserves every picker binding", () => {
    // Nodes sit in legal slots (mega_menu / search_command are header-only,
    // footer_sitemap is footer-only) so parse keeps them instead of flagging
    // illegal_slot placeholders.
    const ast = parseAst({
      header: [
        { id: "m2", type: "mega_menu", props: { menuId: "shop-menu" } },
        { id: "m6", type: "search_command", props: { query: "jamdani saree" } },
      ],
      main: [
        { id: "m1", type: "nav_menu", props: { menuId: "primary" } },
        {
          id: "m3",
          type: "compare_table",
          props: { handles: "silk-saree, jamdani" },
        },
        { id: "m4", type: "blog_archive", props: { handles: "eid-edit" } },
      ],
      footer: [
        { id: "m5", type: "footer_sitemap", props: { pages: "about, stores" } },
      ],
    });
    const byId = Object.fromEntries(
      [...ast.header, ...ast.main, ...ast.footer].map((s) => [s.id, s.props]),
    );
    expect(byId["m1"]!["menuId"]).toBe("primary");
    expect(byId["m2"]!["menuId"]).toBe("shop-menu");
    expect(byId["m3"]!["handles"]).toBe("silk-saree, jamdani");
    expect(byId["m4"]!["handles"]).toBe("eid-edit");
    expect(byId["m5"]!["pages"]).toBe("about, stores");
    expect(byId["m6"]!["query"]).toBe("jamdani saree");
  });

  it("unbound widgets default to empty bindings", () => {
    expect(newSection("nav_menu").props["menuId"]).toBe("");
    expect(newSection("mega_menu").props["menuId"]).toBe("");
    expect(newSection("compare_table").props["handles"]).toBe("");
    expect(newSection("blog_archive").props["handles"]).toBe("");
    expect(newSection("footer_sitemap").props["pages"]).toBe("");
    expect(newSection("search_command").props["query"]).toBe("");
  });

  it("catalog declares each picker field in the content panel", () => {
    const fieldOf = (type: "compare_table" | "blog_archive" | "footer_sitemap" | "search_command" | "nav_menu" | "mega_menu", key: string) =>
      catalogEntry(type)!.fields.find((f) => f.key === key)!;
    expect(fieldOf("compare_table", "handles").kind).toBe("text");
    expect(fieldOf("blog_archive", "handles").kind).toBe("text");
    expect(fieldOf("footer_sitemap", "pages").kind).toBe("text");
    expect(fieldOf("search_command", "query").kind).toBe("text");
    expect(fieldOf("nav_menu", "menuId").kind).toBe("text");
    expect(fieldOf("mega_menu", "menuId").kind).toBe("text");
  });
});

describe("Phase 4 picked-rows degradation", () => {
  const productRows: WidgetRow[] = [
    { id: "a", handle: "first", title: "First", priceMinor: 100, currency: "BDT" },
    { id: "b", handle: "second", title: "Second", priceMinor: 200, currency: "BDT" },
    { id: "c", handle: "third", title: "Third", priceMinor: 300, currency: "BDT" },
  ];

  it("compare_table renders picks in pick order and drops unknown handles", () => {
    const base = newSection("compare_table");
    const section: Section = {
      ...base,
      props: { ...base.props, handles: "second,missing,first" },
    };
    const html = render(WIDGET_COMPONENTS.compare_table, section, "en", {
      rows: productRows,
      pending: false,
    });
    expect(html).toContain("Second");
    expect(html).toContain("First");
    expect(html).not.toContain("Third");
    expect(html.indexOf("Second")).toBeLessThan(html.indexOf("First"));
  });

  it("compare_table with only unknown picks renders nothing, never crashes", () => {
    const base = newSection("compare_table");
    const section: Section = {
      ...base,
      props: { ...base.props, handles: "gone, also-gone" },
    };
    const html = render(WIDGET_COMPONENTS.compare_table, section, "en", {
      rows: productRows,
      pending: false,
    });
    expect(html).toBe("");
  });

  it("compare_table without picks keeps the collection rows", () => {
    const html = render(
      WIDGET_COMPONENTS.compare_table,
      newSection("compare_table"),
      "en",
      { rows: productRows, pending: false },
    );
    expect(html).toContain("First");
    expect(html).toContain("Third");
  });

  it("blog_archive renders picked articles in pick order", () => {
    const base = newSection("blog_archive");
    const section: Section = {
      ...base,
      props: { ...base.props, handles: "sample-3,sample-1" },
    };
    const html = render(WIDGET_COMPONENTS.blog_archive, section);
    expect(html).toContain("Sample article 3");
    expect(html).toContain("Sample article 1");
    expect(html).not.toContain("Sample article 2");
    expect(html.indexOf("Sample article 3")).toBeLessThan(
      html.indexOf("Sample article 1"),
    );
  });

  it("blog_archive with only unknown slugs renders the empty state", () => {
    const base = newSection("blog_archive");
    const section: Section = {
      ...base,
      props: { ...base.props, handles: "no-such-post" },
    };
    const html = render(WIDGET_COMPONENTS.blog_archive, section);
    expect(html).toContain("No articles yet.");
  });

  it("footer_sitemap appends a Pages column for picked pages", () => {
    const base = newSection("footer_sitemap");
    const section: Section = {
      ...base,
      props: { ...base.props, pages: "about, size-guide" },
    };
    const html = render(WIDGET_COMPONENTS.footer_sitemap, section);
    expect(html).toContain(">Pages<");
    expect(html).toContain("/pages/about");
    expect(html).toContain("/pages/size-guide");
    expect(html).toContain("Size Guide");
  });

  it("footer_sitemap with garbage pages appends no column", () => {
    const base = newSection("footer_sitemap");
    const section: Section = {
      ...base,
      props: { ...base.props, pages: "!!! , ---" },
    };
    const html = render(WIDGET_COMPONENTS.footer_sitemap, section);
    // The legal-links row always carries /pages/terms + /pages/privacy, so
    // the assertion targets the picked column title, not the prefix.
    expect(html).not.toContain(">Pages<");
  });
});
