import { describe, expect, it } from "vitest";
import { catalogEntry } from "../../builder-ast";
import { buildFooterMain, FALLBACK_COLUMNS } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { HOMEPAGE_SECTION_TYPES } from "./types";

describe("songoskriti wiring", () => {
  it("locks brand tokens", () => {
    // Ink-black editorial rebrand (fashion-catalog rebuild): brand and ink
    // share the charcoal key, surface is editorial ivory.
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

  it("homepage builds complete curated sections, every type resolvable in the catalog", () => {
    let counter = 0;
    const s = (type: string, props = {}) =>
      ({ id: `${type}-${counter++}`, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    expect(sections.length).toBeGreaterThanOrEqual(15);

    // Every section type must resolve in builder catalog
    for (const section of sections) {
      expect(
        catalogEntry(section.type),
        `${section.type} must exist in the catalog`,
      ).toBeDefined();
    }

    // Core commerce & editorial sections must all be present
    const types = sections.map((n) => n.type);
    for (const coreType of [
      "hero_carousel",
      "department_grid",
      "product_rail",
      "split_feature",
      "craft_story",
      "collection_story",
      "ugc_gallery",
      "trust_footer",
    ]) {
      expect(types, `homepage must include ${coreType}`).toContain(coreType);
    }

    // No duplicate section IDs
    const ids = sections.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Retired Task-2 stand-ins stay gone
    for (const retired of [
      "editorial_hero",
      "filter_chips",
      "testimonial",
      "trust_bar",
    ]) {
      expect(types, `${retired} stand-in must be gone`).not.toContain(retired);
    }

    // Content quality assertions: unverified testimonials empty
    const testimonials = sections.find((n) => n.type === "testimonials");
    if (testimonials) {
      expect(
        (testimonials.props as { testimonials?: unknown[] })?.testimonials ??
          [],
      ).toHaveLength(0);
    }

    // Trust footer carries verified customer care
    const trustFooter = sections.find((n) => n.type === "trust_footer");
    expect(trustFooter).toBeDefined();
    const items =
      (trustFooter?.props as { items?: { title: string; body: string }[] })
        ?.items ?? [];
    expect(items.some((it) => it.title === "CUSTOMER CARE")).toBe(true);
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
    // "Contact" lives in Customer Care only now (the Contact column carries
    // store/phone rows instead); this pins the dedupe across every column
    // of the 28-link fallback set.
    const labels = FALLBACK_COLUMNS.flatMap((col) =>
      col.links
        .split(/[\r\n]+/)
        .map((row) => row.split("|")[0]!.trim())
        .filter(Boolean),
    );
    expect(labels).toContain("Contact");
    expect(labels).toHaveLength(24);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("footer carries exactly one newsletter form (in-sitemap zone)", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const footer = buildFooterMain(s as never);
    const forms = footer.filter(
      (n) =>
        typeof n.props.newsletterHeading === "string" &&
        n.props.newsletterHeading,
    );
    expect(forms.map((n) => n.type)).toEqual(["footer_sitemap"]);
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
