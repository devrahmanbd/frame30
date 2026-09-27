import { describe, expect, it } from "vitest";
import { catalogEntry } from "../../builder-ast";
import { buildFooterMain, FALLBACK_COLUMNS } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { HOMEPAGE_SECTION_TYPES } from "./types";

describe("songoskriti wiring", () => {
  it("locks brand tokens", () => {
    expect(SONGOSKRITI_TOKENS.brand).toBe("#1a1a1a");
    expect(SONGOSKRITI_TOKENS.surface).toBe("#faf9f7");
  });

  it("declares 9 homepage sections in spec order", () => {
    expect([...HOMEPAGE_SECTION_TYPES]).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "trust_footer",
      "product_rail",
      "finder_row",
      "store_locator",
      "craft_story",
      "testimonials",
    ]);
  });

  it("homepage builds 10 sections, every type resolvable in the catalog", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    // SECTION-track blueprint doubles the rail (new arrivals + festive
    // bestsellers). With the redesign, there are now 20 sections.
    expect(sections).toHaveLength(20);
    for (const section of sections) {
      expect(
        catalogEntry(section.type),
        `${section.type} must exist in the catalog`,
      ).toBeDefined();
    }

    const types = sections.map((n) => n.type);
    expect(types.includes("hero_carousel")).toBe(true);
    expect(types.includes("product_rail")).toBe(true);
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

  it("header and footer build non-empty chrome with catalog types", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const header = buildHeaderMain(s as never);
    const footer = buildFooterMain(s as never);
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
    expect(labels).toContain("Stores");
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
    // search, account, cart actions, AND the menubar. The header blueprint
    // is empty so it does not duplicate chrome types.
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const headerTypes = buildHeaderMain(s as never).map((n) => n.type);
    expect(headerTypes).not.toContain("mega_menu");
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
