/**
 * Task 3 — freeze fixtures (serialized literals + static pins).
 *
 * Literal pins later tasks must not change without an explicit update:
 *  - homepage composition (21 sections / 12 distinct types)
 *  - per-TEMPLATE_KEYS zone/type composition (main, plus header/footer)
 *  - static-markup pins for chrome + homepage singleton types
 *
 * Self-contained: no imports from other test files.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newSection,
  type PropValue,
  type Section,
  type SectionType,
  type SectionBuilder,
  type TemplateKey,
} from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import { widgetReader, type WidgetComponent, type WidgetCtx } from "./widgets";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import { HERITAGE_WIDGETS } from "./heritage";
import { WIDGET_COMPONENTS } from "./widgets";
import { buildHomepageMain as buildSongoskritiHomepage } from "@/lib/themes/songoskriti/homepage";
import {
  buildSongoskritiFooter,
  type FooterSectionBuilder,
} from "@/lib/themes/songoskriti/footer";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";

function ctxFor(
  section: Section,
  locale: Locale = "en",
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
  locale: Locale = "en",
): string {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
}

function stubBuilder<T>(): T {
  const s = (type: string, props: Record<string, PropValue> = {}) => ({
    ...newSection(type as SectionType),
    props,
  });
  return s as unknown as T;
}

const TEMPLATE_MAIN: Record<string, string[]> = {
  index: [
    "hero_carousel",
    "department_grid",
    "product_rail",
    "craft_story",
    "product_rail",
    "split_feature",
    "product_rail",
    "recently_viewed",
    "finder_row",
    "split_feature",
    "product_rail",
    "product_rail",
    "split_feature",
    "collection_story",
    "product_rail",
    "craft_story",
    "ugc_gallery",
    "testimonials",
    "split_feature",
    "trust_footer",
    "store_locator",
  ],
  product: ["heading", "columns", "rich_text", "product_rail"],
  collection: [
    "category_header",
    "result_toolbar",
    "product_grid",
    "product_rail",
  ],
  account: ["heading", "profile_card", "orders_list"],
  page: ["breadcrumb", "page_content"],
  blog: ["blog_terms", "blog_archive", "blog_pager"],
  cart: ["heading", "columns"],
  checkout: ["heading", "checkout_steps", "columns"],
  search: [
    "category_header",
    "result_toolbar",
    "facet_sidebar",
    "filter_chips",
    "product_grid",
    "pagination",
    "empty_state",
  ],
  // Phase 3 (Decision D1') — the content archive. Its ORDERED composition is
  // frozen like the other nine: a reordering of these six sections, or a
  // seventh one added, is a change this suite must catch. The order is the
  // theme's own shipped body (`src/lib/themes/songoskriti/preview.ts:242-303`).
  archive: [
    "category_header",
    "blog_terms",
    "blog_archive",
    "blog_pager",
    "pagination",
    "empty_state",
  ],
};

describe("Task 3 — freeze: homepage composition", () => {
  it("homepage composition is frozen: 21 sections / 12 distinct types", () => {
    const sections = buildSongoskritiHomepage(stubBuilder<never>());
    expect(sections.map((x) => x.type)).toEqual([
      "hero_carousel",
      "department_grid",
      "product_rail",
      "craft_story",
      "product_rail",
      "split_feature",
      "product_rail",
      "recently_viewed",
      "finder_row",
      "split_feature",
      "product_rail",
      "product_rail",
      "split_feature",
      "collection_story",
      "product_rail",
      "craft_story",
      "ugc_gallery",
      "testimonials",
      "split_feature",
      "trust_footer",
      "store_locator",
    ]);
    expect(new Set(sections.map((x) => x.type)).size).toBe(12);
  });
});

describe("Task 3 — freeze: per-template zone/type composition", () => {
  for (const key of [
    "index",
    "product",
    "collection",
    "account",
    "page",
    "blog",
    "cart",
    "checkout",
    "search",
    "archive",
  ]) {
    it(`${key} template main zone is frozen`, () => {
      const source = songoskritiPreviewSource();
      const s = stubBuilder<SectionBuilder>();
      const main = source.main(key as TemplateKey, s)!;
      expect(main.map((x: Section) => x.type)).toEqual(TEMPLATE_MAIN[key]);
      const header = source.header(
        key as TemplateKey,
        stubBuilder<SectionBuilder>(),
      );
      const footer = source.footer(
        key as TemplateKey,
        stubBuilder<SectionBuilder>(),
      );
      expect(header.map((x: Section) => x.type)).toEqual([]);
      if (key === "checkout") {
        expect(footer.map((x: Section) => x.type)).toEqual([]);
      } else {
        expect(footer.map((x: Section) => x.type)).toEqual([
          "footer_sitemap",
          "rich_text",
        ]);
      }
    });
  }
});

describe("Task 3 — freeze: chrome + singleton static pins", () => {
  it("header chrome (mega_menu) static pin", () => {
    const section = { ...newSection("mega_menu" as SectionType), props: {} };
    const html = render(SONGOSKRITI_WIDGETS["mega_menu"], section, "en");
    expect(html).toContain('aria-label="Shop"');
  });

  it("footer chrome (footer_sitemap) static pin", () => {
    const sections =
      buildSongoskritiFooter(stubBuilder<FooterSectionBuilder>());
    const sitemap = sections.find((n) => n.type === "footer_sitemap")!;
    const html = render(SONGOSKRITI_WIDGETS["footer_sitemap"], sitemap, "en");
    expect(html).toContain("© 2026 Songoskriti");
  });

  it("hero_carousel singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "hero_carousel")!;
    const html = render(HERITAGE_WIDGETS["hero_carousel"], section, "en");
    expect(html).toContain('aria-label="Hero carousel"');
  });

  it("department_grid singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "department_grid")!;
    const html = render(SONGOSKRITI_WIDGETS["department_grid"], section, "en");
    expect(html).toContain("SHOP THE COLLECTION");
  });

  it("recently_viewed singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "recently_viewed")!;
    const html = render(WIDGET_COMPONENTS["recently_viewed"], section, "en");
    expect(html).toBe("");
  });

  it("finder_row singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "finder_row")!;
    const html = render(SONGOSKRITI_WIDGETS["finder_row"], section, "en");
    expect(html).toContain("lg:col-span-5");
  });

  it("collection_story singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "collection_story")!;
    const html = render(SONGOSKRITI_WIDGETS["collection_story"], section, "en");
    expect(html).toContain("bg-[var(--theme-muted)]");
  });

  it("ugc_gallery singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "ugc_gallery")!;
    const html = render(SONGOSKRITI_WIDGETS["ugc_gallery"], section, "en");
    expect(html).toContain("WORN BY YOU");
  });

  it("testimonials singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "testimonials")!;
    const html = render(SONGOSKRITI_WIDGETS["testimonials"], section, "en");
    expect(html).toContain('aria-label="Testimonials"');
  });

  it("trust_footer singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "trust_footer")!;
    const html = render(SONGOSKRITI_WIDGETS["trust_footer"], section, "en");
    expect(html).toContain("grid-cols-2 lg:grid-cols-4");
  });

  it("store_locator singleton static pin", () => {
    const home = buildSongoskritiHomepage(stubBuilder<never>());
    const section = home.find((s) => s.type === "store_locator")!;
    const html = render(SONGOSKRITI_WIDGETS["store_locator"], section, "en");
    expect(html).toContain("VISIT SONGOSKRITI");
  });
});
