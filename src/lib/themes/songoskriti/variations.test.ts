/**
 * Songoskriti starter theme variations (Track T): validity + render proof.
 */
import { describe, expect, it } from "vitest";
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { SONGOSKRITI_WIDGET_DEFAULTS } from "./skins";
import { songoskritiPreviewSource } from "./preview";
import {
  SONGOSKRITI_VARIATIONS,
  SONGOSKRITI_VARIATIONS_CHECK,
  songoskritiTokensFor,
  songoskritiVariationFor,
} from "./variations";
import { validateThemeVariations } from "../../theme-variations";

function stub() {
  let n = 0;
  return (type: SectionType, props: Record<string, PropValue> = {}): Section => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

describe("SONGOSKRITI_VARIATIONS", () => {
  it("ships the minimal + festive starters", () => {
    expect(SONGOSKRITI_VARIATIONS.map((v) => v.key).sort()).toEqual([
      "festive",
      "minimal",
    ]);
    for (const v of SONGOSKRITI_VARIATIONS) {
      expect(v.label.trim()).not.toBe("");
      expect(v.label_bn.trim()).not.toBe("");
    }
  });

  it("passes validation (unique keys, token keys + skin names only)", () => {
    expect(SONGOSKRITI_VARIATIONS_CHECK).toEqual({ ok: true });
    expect(validateThemeVariations("songoskriti", SONGOSKRITI_VARIATIONS)).toEqual({
      ok: true,
    });
  });

  it("differs from the base look (token + skin proof)", () => {
    const minimal = songoskritiVariationFor("minimal")!;
    const festive = songoskritiVariationFor("festive")!;
    expect(Object.keys(minimal.tokenOverrides).length).toBeGreaterThan(0);
    expect(Object.keys(festive.tokenOverrides).length).toBeGreaterThan(0);
    expect(minimal.skinDefaults.product_rail).not.toBe(
      SONGOSKRITI_WIDGET_DEFAULTS.product_rail.skin,
    );
    expect(songoskritiVariationFor("nope")).toBeNull();
  });
});

describe("songoskritiTokensFor", () => {
  it("merges the variation over base tokens", () => {
    const tokens = songoskritiTokensFor("minimal");
    expect(tokens.surface).toBe("#FFFFFF");
    expect(tokens.brand).toBe(SONGOSKRITI_TOKENS.brand);
    expect(SONGOSKRITI_TOKENS.surface).toBe("#faf9f7");
  });

  it("unknown keys fall back to base tokens", () => {
    expect(songoskritiTokensFor("nope")).toEqual(SONGOSKRITI_TOKENS);
    expect(songoskritiTokensFor(null)).toEqual(SONGOSKRITI_TOKENS);
  });
});

describe("songoskriti variation preview render", () => {
  it("minimal rails carry the minimal skin, base stays editorial", () => {
    const s = stub();
    const baseMain = songoskritiPreviewSource().main("collection", s)!;
    const minimalMain = songoskritiPreviewSource("minimal").main(
      "collection",
      s,
    )!;
    const skins = (main: Section[]) =>
      main.filter((x) => x.type === "product_rail").map((x) => x.props.skin);
    expect(skins(baseMain)).toEqual(["editorial"]);
    expect(skins(minimalMain)).toEqual(["minimal"]);
  });

  it("authored skins win over the variation (precedence proof)", () => {
    const s = stub();
    const home = songoskritiPreviewSource("minimal").main("index", s)!;
    // The homepage authors an explicit fullbleed hero + carousel quotes:
    // variation defaults must not clobber them.
    expect(
      home.find((x) => x.type === "hero_carousel")!.props.skin,
    ).toBe("fullbleed");
    expect(
      home.find((x) => x.type === "testimonials")!.props.skin,
    ).toBe("carousel");
    // Unauthored rails take the variation skin.
    for (const rail of home.filter((x) => x.type === "product_rail")) {
      expect(rail.props.skin).toBe("minimal");
    }
  });

  it("source exposes tokens + variation list for the registry", () => {
    const source = songoskritiPreviewSource("festive");
    expect(source.tokens.accent).toBe("#C4714A");
    expect(source.variations?.map((v) => v.key).sort()).toEqual([
      "festive",
      "minimal",
    ]);
  });
});
