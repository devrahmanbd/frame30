import { describe, expect, it } from "vitest";
import { catalogEntry } from "../../builder-ast";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { BLUEOCEAN_TOKENS } from "./tokens";
import { HOMEPAGE_BLUEOCEAN_SECTION_TYPES } from "./types";

describe("blueocean wiring", () => {
  it("locks brand tokens", () => {
    // Premium ethnic-editorial: deep lagoon-teal brand on white,
    // muted-marigold accent (decorative roles only), deep-sea ink,
    // 6px radius, Playfair Display + Inter faces.
    expect(BLUEOCEAN_TOKENS.brand).toBe("#0A3642");
    expect(BLUEOCEAN_TOKENS.accent).toBe("#C2913B");
    expect(BLUEOCEAN_TOKENS.surface).toBe("#FFFFFF");
    expect(BLUEOCEAN_TOKENS.dark).toBeNull();
  });

  it("declares homepage main types in spec order", () => {
    expect([...HOMEPAGE_BLUEOCEAN_SECTION_TYPES]).toEqual([
      "hero_carousel",
      "circle_categories",
      "product_rail",
      "split_feature",
      "product_rail",
      "circle_categories",
      "collection_grid",
      "trust_marquee",
      "collection_story",
      "testimonials",
      "store_locator",
      "newsletter",
    ]);
  });

  it("homepage builds 12 sections, every type resolvable in the catalog", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    // Editorial marketplace rhythm: fullbleed hero shops three campaigns,
    // category + colour circles carry discovery, two rails prove demand,
    // festive split breaks the grid, live grid + trust + story + single
    // voice + locator + newsletter close.
    expect(sections.map((n) => n.type)).toEqual([
      "hero_carousel",
      "circle_categories",
      "product_rail",
      "split_feature",
      "product_rail",
      "circle_categories",
      "collection_grid",
      "trust_marquee",
      "collection_story",
      "testimonials",
      "store_locator",
      "newsletter",
    ]);
    for (const section of sections) {
      expect(
        catalogEntry(section.type),
        `${section.type} must exist in the catalog`,
      ).toBeDefined();
    }
    // No cross-theme stand-ins: every section id is built by this theme.
    for (const section of sections) {
      expect(section.id).toBe(section.type);
    }
  });

  it("hero slides carry Bengali twins for the publish gate", () => {
    const s = (type: string, props: Record<string, unknown> = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    const hero = sections[0] as unknown as {
      props: { slides: Record<string, unknown>[] };
    };
    expect(hero.props.slides.length).toBe(3);
    for (const slide of hero.props.slides) {
      expect(slide["headline_bn"], "slide headline twin").toBeTruthy();
      expect(slide["subhead_bn"], "slide subhead twin").toBeTruthy();
    }
  });

  it("header and footer build on declared catalog widgets", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    expect(buildHeaderMain(s as never).map((n) => n.type)).toEqual([
      "announcement_bar",
      "mega_menu",
    ]);
    const footer = buildFooterMain(s as never).map((n) => n.type);
    expect(footer).toContain("footer_sitemap");
    expect(footer).toContain("payment_icons");
    for (const type of [...footer, "announcement_bar", "mega_menu"]) {
      expect(catalogEntry(type), `${type} must exist`).toBeDefined();
    }
  });
});
