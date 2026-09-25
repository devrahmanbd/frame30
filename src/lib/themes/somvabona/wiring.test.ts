import { describe, expect, it } from "vitest";
import { SOMVABONA_TOKENS } from "./tokens";
import { buildFooterMain, buildHeaderMain, FALLBACK_COLUMNS } from "./chrome";
import { buildHomepageMain } from "./homepage";
import { HOMEPAGE_SECTION_TYPES } from "./types";

describe("somvabona scaffold", () => {
  it("locks brand tokens distinct from songoskriti", () => {
    expect(SOMVABONA_TOKENS.brand).toBe("#7C2A1A");
    expect(SOMVABONA_TOKENS.brand).not.toBe("#8A3B1F");
    expect(SOMVABONA_TOKENS.surface).toBe("#FBF6EE");
    expect(SOMVABONA_TOKENS.density).toBe("comfortable");
    expect(SOMVABONA_TOKENS.currencyDisplay).toBe("symbol");
  });

  it("declares the 10 spec §2 homepage types in rhythm order", () => {
    expect([...HOMEPAGE_SECTION_TYPES]).toEqual([
      "announcement_bar",
      "hero_carousel",
      "trust_marquee",
      "circle_categories",
      "price_buckets",
      "urgency_rail",
      "occasion_matrix",
      "store_locator",
      "craft_story",
      "testimonials",
    ]);
  });

  it("builds 11 homepage sections with the urgency rail doubled", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never);
    expect(sections).toHaveLength(11);
    expect(sections.map((n) => n.type)).toEqual([
      "announcement_bar",
      "hero_carousel",
      "trust_marquee",
      "circle_categories",
      "price_buckets",
      "urgency_rail",
      "urgency_rail",
      "occasion_matrix",
      "store_locator",
      "craft_story",
      "testimonials",
    ]);
  });

  it("keeps every user-facing homepage string bilingual", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const sections = buildHomepageMain(s as never) as unknown as {
      type: string;
      props: Record<string, unknown>;
    }[];
    for (const section of sections) {
      for (const [key, value] of Object.entries(section.props)) {
        if (key.endsWith("_bn") || typeof value !== "string" || !value)
          continue;
        if (
          /^(image|href|ctaUrl|collection|source|cardVariant|speed)$/i.test(key)
        )
          continue;
        if (
          key.startsWith("c") &&
          /^(c\d|cta)/.test(key) &&
          !/[a-z]{2,}/.test(key)
        )
          continue;
        // Copy keys (heading, body, labels, names, hours) need a _bn twin.
        if (
          /heading|body|label|title|name|hours|subhead|promise|caption|eyebrow|quote|author|role/i.test(
            key,
          )
        ) {
          expect(
            section.props[`${key}_bn`],
            `${section.type}.${key} must ship a ${key}_bn twin`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("header keeps the menubar only (StoreHeader owns chrome)", () => {
    const s = (type: string, props = {}) =>
      ({ id: type, type, props }) as never;
    const headerTypes = buildHeaderMain(s as never).map((n) => n.type);
    expect(headerTypes).toEqual(["mega_menu"]);
    const mainTypes = buildHomepageMain(s as never).map((n) => n.type);
    for (const chrome of ["search_command", "account_cart", "mega_menu"]) {
      expect(mainTypes, `homepage main must not carry ${chrome}`).not.toContain(
        chrome,
      );
    }
  });

  it("footer fallback columns carry no duplicate links", () => {
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
    expect(footer.length).toBeGreaterThan(0);
    const ctas = footer.filter(
      (n) => typeof n.props.buttonLabel === "string" && n.props.buttonLabel,
    );
    expect(ctas.map((n) => n.type)).toEqual(["newsletter"]);
  });
});
