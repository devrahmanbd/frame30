import { describe, expect, it } from "vitest";
import { parseAst, type Section } from "@/lib/builder-ast";
import { taxonomyOptions, TAXONOMY_SOURCES, taxonomyLabel } from "@/lib/taxonomy";
import { formatUnit } from "@/lib/unit-format";
import { abMatches, evaluateVisibility, type VisibilityContext } from "@/lib/visibility";

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
    expect(formatUnit(120_000, "bdt", { digits: "latin", currencyDisplay: "code" })).toContain("BDT");
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
    expect(evaluateVisibility([{ kind: "auth", op: "is", value: "in" }], ctx()).visible).toBe(true);
    expect(
      evaluateVisibility([{ kind: "auth", op: "is", value: "out" }], ctx()).visible,
    ).toBe(false);
    expect(evaluateVisibility([{ kind: "cart", op: "not_empty", value: 0 }], ctx()).visible).toBe(true);
    expect(
      evaluateVisibility([{ kind: "cart", op: "min_total", value: 200_000 }], ctx()).visible,
    ).toBe(false);
    expect(evaluateVisibility([{ kind: "locale", op: "not", value: "bn" }], ctx()).visible).toBe(true);
    expect(
      evaluateVisibility([{ kind: "date", op: "after", value: "2026-07-01" }], ctx()).visible,
    ).toBe(false);
    expect(evaluateVisibility([{ kind: "segment", op: "is", value: "vip" }], ctx()).visible).toBe(true);
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
    expect((ok.main[0] as Section).ab).toEqual({ experiment: "hero", variant: "b" });
    const partial = parseAst(node({ ab: { experiment: "hero" } }));
    expect((partial.main[0] as Section).ab).toBeUndefined();
  });
});
