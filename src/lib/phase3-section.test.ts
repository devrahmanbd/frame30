import { describe, expect, it } from "vitest";
import { parseAst, type Section } from "@/lib/builder-ast";
import {
  taxonomyOptions,
  TAXONOMY_SOURCES,
  taxonomyLabel,
} from "@/lib/taxonomy";
import { formatUnit } from "@/lib/unit-format";
import {
  abMatches,
  evaluateVisibility,
  type VisibilityContext,
} from "@/lib/visibility";

const ctx = (patch: Partial<VisibilityContext> = {}): VisibilityContext => ({
  signedIn: true,
  cartCount: 2,
  cartTotalMinor: 150_000,
  locale: "en",
  now: Date.parse("2026-06-01T00:00:00Z"),
  segments: ["vip"],
  ...patch,
});

describe("phase 3.2 — taxonomy props", () => {
  it("every source is bilingual", () => {
    for (const source of TAXONOMY_SOURCES) {
      const options = taxonomyOptions(source);
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(option.en.trim()).not.toBe("");
        expect(option.bn.trim()).not.toBe("");
      }
    }
  });

  it("labels resolve per locale and echo unknown slugs", () => {
    expect(taxonomyLabel("skinType", "oily", "bn")).toBe("তৈলাক্ত");
    expect(taxonomyLabel("skinType", "oily", "en")).toBe("Oily");
    expect(taxonomyLabel("skinType", "nope", "en")).toBe("nope");
  });
});

describe("phase 3.2 — unit formatting", () => {
  it("money stays server minor units and honours digits", () => {
    expect(formatUnit(120_000, "bdt", { digits: "latin" })).toContain("1,200");
    expect(formatUnit(120_000, "bdt", { digits: "bengali" })).toContain("১");
    expect(
      formatUnit(120_000, "bdt", { digits: "latin", currencyDisplay: "code" }),
    ).toContain("BDT");
  });

  it("physical units carry a localised suffix", () => {
    expect(formatUnit(5000, "mah", { locale: "en" })).toBe("5,000 mAh");
    expect(formatUnit(12, "months", { locale: "bn" })).toContain("মাস");
    expect(formatUnit(7, "count", { locale: "en" })).toBe("7");
  });
});

describe("phase 3.2 — visibility rules", () => {
  it("no rules always render", () => {
    expect(evaluateVisibility(undefined, ctx()).visible).toBe(true);
  });

  it("truth table", () => {
    expect(
      evaluateVisibility([{ kind: "auth", op: "is", value: "in" }], ctx())
        .visible,
    ).toBe(true);
    expect(
      evaluateVisibility([{ kind: "auth", op: "is", value: "out" }], ctx())
        .visible,
    ).toBe(false);
    expect(
      evaluateVisibility([{ kind: "cart", op: "not_empty", value: 0 }], ctx())
        .visible,
    ).toBe(true);
    expect(
      evaluateVisibility(
        [{ kind: "cart", op: "min_total", value: 200_000 }],
        ctx(),
      ).visible,
    ).toBe(false);
    expect(
      evaluateVisibility([{ kind: "locale", op: "not", value: "bn" }], ctx())
        .visible,
    ).toBe(true);
    expect(
      evaluateVisibility(
        [{ kind: "date", op: "after", value: "2026-07-01" }],
        ctx(),
      ).visible,
    ).toBe(false);
    expect(
      evaluateVisibility([{ kind: "segment", op: "is", value: "vip" }], ctx())
        .visible,
    ).toBe(true);
  });

  it("visitor rules defer while unknown (SSR)", () => {
    const result = evaluateVisibility(
      [{ kind: "auth", op: "is", value: "in" }],
      ctx({ signedIn: null }),
    );
    expect(result).toEqual({ visible: false, deferred: true });
  });

  it("rules AND together", () => {
    expect(
      evaluateVisibility(
        [
          { kind: "auth", op: "is", value: "in" },
          { kind: "cart", op: "empty", value: 0 },
        ],
        ctx(),
      ).visible,
    ).toBe(false);
  });
});

describe("phase 3.2 — A/B slot", () => {
  it("matching variant renders, other variants hide, no assignment falls back", () => {
    const ab = { experiment: "hero", variant: "b" };
    expect(abMatches(ab, { hero: "b" })).toBe(true);
    expect(abMatches(ab, { hero: "a" })).toBe(false);
    expect(abMatches(ab, {})).toBe(true);
    expect(abMatches(ab, null)).toBe(true);
    expect(abMatches(undefined, { hero: "a" })).toBe(true);
  });
});

describe("phase 3.2 — parse round-trips", () => {
  const node = (extra: Record<string, unknown>) => ({
    header: [],
    main: [{ id: "n1", type: "faq", props: {}, ...extra }],
    footer: [],
  });

  it("keeps valid visibility rules and drops junk ones", () => {
    const ast = parseAst(
      node({
        when: [
          { kind: "auth", op: "is", value: "in" },
          { kind: "auth", op: "bogus", value: "in" },
          { kind: "nope", op: "is", value: 1 },
        ],
      }),
    );
    const section = ast.main[0] as Section;
    expect(section.when).toEqual([{ kind: "auth", op: "is", value: "in" }]);
  });

  it("keeps a complete A/B slot and drops a partial one", () => {
    const ok = parseAst(node({ ab: { experiment: "hero", variant: "b" } }));
    expect((ok.main[0] as Section).ab).toEqual({
      experiment: "hero",
      variant: "b",
    });
    const partial = parseAst(node({ ab: { experiment: "hero" } }));
    expect((partial.main[0] as Section).ab).toBeUndefined();
  });
});

describe("lane D3 — theme-emitted sections survive parse→serialize→parse", () => {
  // REPORT-THEMES.md §7 item 3: themes emit props the catalog did not
  // declare, so parseAst stripped them on persist round-trips. Every prop
  // below is read by its renderer (songoskriti.tsx FinderRow /
  // SongoskritiSplitFeature / SongoskritiUgcGallery, or the generic
  // SectionRenderer skin chrome for urgency_rail).
  const themeAst = () => ({
    header: [],
    main: [
      {
        id: "finder",
        type: "finder_row",
        props: {
          heading: "SHOP BY OCCASION",
          heading_bn: "উপলক্ষ অনুযায়ী কিনুন",
          body: "Pick a moment.",
          body_bn: "আপনার উপলক্ষ বেছে নিন।",
          o1Label: "EID & FESTIVE",
          o1Href: "/c/festive",
          o2Label: "WEDDING",
          o2Href: "/c/wedding",
          o3Label: "MEHENDI",
          o3Href: "/c/mehendi",
          o4Label: "SANGEET",
          o4Label_bn: "সংগীত",
          o4Href: "/c/sangeet",
          o5Label: "GIFTING",
          o5Href: "/c/gifting",
          o6Label: "EVERYDAY",
          o6Href: "/c/everyday",
          o7Label: "FAMILY MATCHING",
          o7Href: "/c/family",
          buttonLabel: "BROWSE ALL OCCASIONS",
          buttonLabel_bn: "সব উপলক্ষ দেখুন",
          buttonHref: "/c/occasions",
        },
      },
      {
        id: "split",
        type: "split_feature",
        props: {
          heading: "THE FESTIVE EDIT",
          heading_bn: "উৎসবের সাজ",
          body: "Jamdani drapes.",
          body_bn: "জামদানি।",
          ctaLabel: "SHOP WOMEN",
          ctaUrl: "/c/women",
          ctaLabel2: "SHOP MEN",
          ctaLabel2_bn: "পুরুষদের কেনাকাটা",
          ctaUrl2: "/c/men",
          primaryImage: "/ph/songoskriti/edit-festive-main.png",
          secondaryImage: "/ph/songoskriti/cat-men.png",
          layout: "image_left",
        },
      },
      {
        id: "ugc",
        type: "ugc_gallery",
        props: {
          heading: "WORN BY YOU",
          heading_bn: "আপনার পরিধানে",
          subhead: "SONGOSKRITI IN THE WORLD",
          subhead_bn: "সংস্কৃতি সারা দুনিয়ায়",
          images: "/ph/songoskriti/ugc-1.png, /ph/songoskriti/ugc-2.png",
        },
      },
      {
        id: "rail",
        type: "urgency_rail",
        props: {
          heading: "New arrivals",
          heading_bn: "নতুন এসেছে",
          limit: 8,
          source: "collection",
          collection: "new-in",
          skin: "compact",
        },
      },
    ],
    footer: [],
  });

  it("keeps every theme-emitted prop through one parse", () => {
    const ast = parseAst(themeAst());
    const byId = Object.fromEntries(ast.main.map((s) => [s.id, s]));
    const finder = byId["finder"]!.props as Record<string, unknown>;
    expect(finder["o4Label"]).toBe("SANGEET");
    expect(finder["o4Label_bn"]).toBe("সংগীত");
    expect(finder["o4Href"]).toBe("/c/sangeet");
    expect(finder["o5Label"]).toBe("GIFTING");
    expect(finder["o5Href"]).toBe("/c/gifting");
    expect(finder["o6Label"]).toBe("EVERYDAY");
    expect(finder["o6Href"]).toBe("/c/everyday");
    expect(finder["o7Label"]).toBe("FAMILY MATCHING");
    expect(finder["o7Href"]).toBe("/c/family");
    expect(finder["buttonLabel"]).toBe("BROWSE ALL OCCASIONS");
    expect(finder["buttonHref"]).toBe("/c/occasions");
    const split = byId["split"]!.props as Record<string, unknown>;
    expect(split["primaryImage"]).toBe(
      "/ph/songoskriti/edit-festive-main.png",
    );
    expect(split["secondaryImage"]).toBe("/ph/songoskriti/cat-men.png");
    expect(split["ctaUrl"]).toBe("/c/women");
    expect(split["ctaLabel2"]).toBe("SHOP MEN");
    expect(split["ctaLabel2_bn"]).toBe("পুরুষদের কেনাকাটা");
    expect(split["ctaUrl2"]).toBe("/c/men");
    expect(split["layout"]).toBe("image_left");
    const ugc = byId["ugc"]!.props as Record<string, unknown>;
    expect(ugc["subhead"]).toBe("SONGOSKRITI IN THE WORLD");
    expect(ugc["subhead_bn"]).toBe("সংস্কৃতি সারা দুনিয়ায়");
    expect(ugc["images"]).toBe(
      "/ph/songoskriti/ugc-1.png, /ph/songoskriti/ugc-2.png",
    );
    const rail = byId["rail"]!.props as Record<string, unknown>;
    expect(rail["skin"]).toBe("compact");
    expect(rail["collection"]).toBe("new-in");
  });

  it("keeps props intact through parse→serialize→parse", () => {
    const once = parseAst(themeAst());
    const twice = parseAst(JSON.parse(JSON.stringify(once)));
    expect(twice.main.map((s) => s.id)).toEqual(
      once.main.map((s) => s.id),
    );
    for (const [first, second] of once.main.map((s, i) => [s, twice.main[i]!])) {
      expect(second!.props, second!.id).toEqual(first!.props);
    }
  });
});
