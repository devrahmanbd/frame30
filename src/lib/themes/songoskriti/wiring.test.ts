import { describe, expect, it } from "vitest";
import { catalogEntry } from "../../builder-ast";
import { buildFooterMain, FALLBACK_COLUMNS } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { HOMEPAGE_SECTION_TYPES } from "./types";

describe("songoskriti wiring", () => {
  it("locks brand tokens", () => {
    expect(SONGOSKRITI_TOKENS.brand).toBe("#8A3B1F");
    expect(SONGOSKRITI_TOKENS.surface).toBe("#FAF8F5");
  });

  it("declares 8 homepage sections in spec order", () => {
    expect([...HOMEPAGE_SECTION_TYPES]).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "finder_row",
      "product_rail",
      "craft_story",
      "testimonials",
      "trust_footer",
    ]);
  });

  it("homepage builds 9 sections, every type resolvable in the catalog", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    // SECTION-track blueprint doubles the rail (new arrivals + festive
    // bestsellers), so 9 sections on 8 distinct intended types.
    expect(sections).toHaveLength(9);
    for (const section of sections) {
      expect(
        catalogEntry(section.type),
        `${section.type} must exist in the catalog`,
      ).toBeDefined();
    }
    // Task 2: builders emit the intended names directly — no stand-ins.
    expect(sections.map((n) => n.type)).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "finder_row",
      "product_rail",
      "product_rail",
      "craft_story",
      "testimonials",
      "trust_footer",
    ]);
    expect(sections.map((n) => n.type)).toEqual(
      expect.arrayContaining([...HOMEPAGE_SECTION_TYPES]),
    );
    for (const retired of [
      "editorial_hero",
      "filter_chips",
      "collection_story",
      "testimonial",
      "trust_bar",
    ]) {
      expect(
        sections.map((n) => n.type),
        `${retired} stand-in must be gone`,
      ).not.toContain(retired);
    }
  });

  it("header and footer build non-empty chrome with catalog types", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const header = buildHeaderMain(s as never);
    const footer = buildFooterMain(s as never);
    expect(header.length).toBeGreaterThan(0);
    expect(footer.length).toBeGreaterThan(0);
    for (const section of [...header, ...footer]) {
      expect(catalogEntry(section.type)).toBeDefined();
    }
  });

  it("footer fallback columns carry no duplicate links (browser-verified 2026-09-24)", () => {
    // "Contact us" rendered under both Customer Care and About. It lives in
    // Customer Care only now; this pins the dedupe across every column.
    const labels = FALLBACK_COLUMNS.flatMap((col) =>
      col.links
        .split(/[\r\n]+/)
        .map((row) => row.split("|")[0]!.trim())
        .filter(Boolean),
    );
    expect(labels).toContain("Contact us");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("footer keeps exactly one newsletter CTA", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const footer = buildFooterMain(s as never);
    const ctas = footer.filter(
      (n) => typeof n.props.buttonLabel === "string" && n.props.buttonLabel,
    );
    expect(ctas.map((n) => n.type)).toEqual(["newsletter"]);
  });
  it("never duplicates the StoreHeader chrome (browser-verified 2026-09-24)", () => {
    // The storefront masthead (`StoreHeader`, live + preview) already owns
    // search, account and cart actions: blueprint sections for them rendered
    // a second search bar and account row beneath the masthead. The header
    // blueprint keeps the menubar only; the homepage main carries no chrome
    // types at all (it never did — this pins that invariant).
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const headerTypes = buildHeaderMain(s as never).map((n) => n.type);
    expect(headerTypes).toContain("mega_menu");
    expect(headerTypes).not.toContain("search_command");
    expect(headerTypes).not.toContain("account_cart");
    const mainTypes = buildHomepageMain(s as never).map((n) => n.type);
    for (const chrome of ["search_command", "account_cart", "mega_menu"]) {
      expect(mainTypes, `homepage main must not carry ${chrome}`).not.toContain(
        chrome,
      );
    }
  });
});
