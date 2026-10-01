import { describe, expect, it } from "vitest";
import { catalogEntry, lintTemplate, type PropValue } from "../../builder-ast";
import { buildFooterMain, FALLBACK_COLUMNS } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { OCEANBLUE_TOKENS } from "./tokens";
import { HOMEPAGE_SECTION_TYPES } from "./types";

describe("oceanblue wiring", () => {
  it("locks brand tokens", () => {
    // Premium clean minimal: deep-ocean brand on white, muted-gold accent
    // (decorative roles only), slate ink, 8px radius, Inter faces.
    expect(OCEANBLUE_TOKENS.brand).toBe("#0B3A5B");
    expect(OCEANBLUE_TOKENS.accent).toBe("#C08A3E");
    expect(OCEANBLUE_TOKENS.surface).toBe("#FFFFFF");
    expect(OCEANBLUE_TOKENS.dark).toBeNull();
  });

  it("declares homepage main types in spec order", () => {
    expect([...HOMEPAGE_SECTION_TYPES]).toEqual([
      "hero_carousel",
      "circle_categories",
      "product_rail",
      "split_feature",
      "trust_marquee",
      "collection_story",
      "testimonials",
      "store_locator",
      "newsletter",
    ]);
  });

  it("homepage builds 11 sections, every type resolvable in the catalog", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    // Big-catalog discovery rhythm: hero shops three campaigns, circle
    // tiles + Shop-by-Color carry discovery, Most Loved / Recommended
    // rails prove demand, trust + story + single voice + locator close.
    expect(sections.map((n) => n.type)).toEqual([
      "hero_carousel",
      "circle_categories",
      "product_rail",
      "split_feature",
      "product_rail",
      "circle_categories",
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
    // Retired stand-ins stay gone.
    for (const retired of [
      "editorial_hero",
      "filter_chips",
      "testimonial",
      "trust_bar",
    ]) {
      expect(
        sections.map((n) => n.type),
        `${retired} stand-in must be gone`,
      ).not.toContain(retired);
    }
  });

  it("authors scroll motion through persist-safe props", () => {
    // `reveal` (universal style prop) + hero `atmosphere` survive parse;
    // `advAnimation` does not (inspector-only layer), so themes must not
    // author it. Trust marquee carries its own motion.
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const byType = new Map<string, Record<string, PropValue>>(
      buildHomepageMain(s as never).map((n) => [n.type, n.props] as const),
    );
    const rising = [
      "circle_categories",
      "product_rail",
      "split_feature",
      "store_locator",
    ];
    for (const t of rising) {
      expect(byType.get(t)!.reveal, `${t} reveal`).toBe("rise");
    }
    for (const t of ["collection_story", "testimonials", "newsletter"]) {
      expect(byType.get(t)!.reveal, `${t} reveal`).toBe("fade");
    }
    expect(byType.get("hero_carousel")!.atmosphere).toBe("wash");
    const all = buildHomepageMain(s as never);
    for (const n of all) {
      expect(
        Object.keys(n.props).filter((k) => k.startsWith("adv")),
        `${n.type} must not author inspector-only adv props`,
      ).toEqual([]);
    }
  });

  it("index carries exactly one primary-heading claimant", () => {
    // Unique ids like the real factory (makeSection counter) — duplicate
    // ids are a lint error of their own and would mask the H1 assertion.
    let n = 0;
    const s = (type: string, props = {}) =>
      ({ id: `${type}-${n++}`, type, props }) as never;
    const ast = {
      header: [],
      main: buildHomepageMain(s as never),
      footer: [],
    } as never;
    const issues = lintTemplate(ast, "index");
    expect(
      issues.filter((i) => i.level === "error"),
      JSON.stringify(issues),
    ).toEqual([]);
  });

  it("header carries the campaign strip and footer builds chrome", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const header = buildHeaderMain(s as never);
    const footer = buildFooterMain(s as never);
    // Redesigned topbar: one rotating campaign strip below the masthead.
    // The masthead itself (logo/nav/icons) stays shared chrome.
    expect(header.map((n) => n.type)).toEqual(["announcement_bar"]);
    expect(footer.length).toBeGreaterThan(0);
    for (const section of [...header, ...footer]) {
      expect(catalogEntry(section.type)).toBeDefined();
    }
  });

  it("footer fallback columns carry unique links", () => {
    const labels = FALLBACK_COLUMNS.flatMap((col) =>
      col.links
        .split(/[\r\n]+/)
        .map((row) => row.split("|")[0]!.trim())
        .filter(Boolean),
    );
    // Shop + care + about + contact across 24 links, no duplicates.
    expect(labels).toContain("Stores");
    expect(labels).toContain("Contact");
    expect(labels).toHaveLength(24);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("footer carries no newsletter CTA — page main owns signup", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const footer = buildFooterMain(s as never);
    const ctas = footer.filter(
      (n) => typeof n.props.buttonLabel === "string" && n.props.buttonLabel,
    );
    // P9-2 audit: every content page (homepage §11, blog, journal, search)
    // renders a main-slot newsletter — a footer copy doubled the signup on
    // every page, so the footer must carry no `buttonLabel` CTA at all.
    expect(ctas.map((n) => n.type)).toEqual([]);
    expect(footer.map((n) => n.type)).toEqual([
      "footer_sitemap",
      "payment_icons",
      "rich_text",
    ]);
  });

  it("never duplicates the StoreHeader chrome", () => {
    // The storefront masthead (`StoreHeader`, live + preview) already owns
    // search, account, cart actions, AND the menubar (dashboard menus win,
    // header-fallback supplies the 8-item Biba tree). Theme sections must
    // not carry those chrome types; the redesigned topbar is the campaign
    // announcement strip only.
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const headerTypes = buildHeaderMain(s as never).map((n) => n.type);
    expect(headerTypes).toEqual(["announcement_bar"]);
    const mainTypes = buildHomepageMain(s as never).map((n) => n.type);
    for (const chrome of ["search_command", "account_cart", "mega_menu"]) {
      expect(mainTypes, `homepage main must not carry ${chrome}`).not.toContain(
        chrome,
      );
    }
  });
});
