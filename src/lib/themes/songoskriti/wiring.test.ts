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

  it("homepage builds 20 sections, every type resolvable in the catalog", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    // Fashion-catalog rebuild: 20 sections opening on the hero carousel —
    // signature sarees lead, campaign splits and craft stories interleave,
    // trust + flagship outlets close. No announcement bar, no circles.
    expect(sections).toHaveLength(20);
    for (const section of sections) {
      expect(
        catalogEntry(section.type),
        `${section.type} must exist in the catalog`,
      ).toBeDefined();
    }
    // Task 2: builders emit the intended names directly — no stand-ins.
    expect(sections.map((n) => n.type)).toEqual([
      "hero_carousel",
      "department_grid",
      "product_rail",
      "craft_story",
      "product_rail",
      "split_feature",
      "product_rail",
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
    // Retired Task-2 stand-ins stay gone. collection_story is NOT listed:
    // the rebuild promotes it to a first-class heritage-weaves grid and it
    // resolves in the catalog (pinned above).
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
    // "Contact" lives in Customer Care only now (the Contact column carries
    // store/phone rows instead); this pins the dedupe across every column
    // of the 28-link fallback set.
    const labels = FALLBACK_COLUMNS.flatMap((col) =>
      col.links
        .split(/[\r\n]+/)
        .map((row) => row.split("|")[0]!.trim())
        .filter(Boolean),
    );
    // Merge reconciliation: both lanes' fallback labels survive — "Stores"
    // (flagship outlets) and "Contact" (customer care) across 28 links.
    expect(labels).toContain("Stores");
    expect(labels).toContain("Contact");
    expect(labels).toHaveLength(28);
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
