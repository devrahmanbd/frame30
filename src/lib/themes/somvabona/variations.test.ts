/**
 * Somvabona starter theme variations (Track T): validity + render proof.
 */
import { describe, expect, it } from "vitest";
import type { PropValue, Section } from "../../builder-ast";
import { SOMVABONA_TOKENS } from "./tokens";
import { SOMVABONA_WIDGET_DEFAULTS } from "./skins";
import { somvabonaPreviewSource } from "./preview";
import {
  SOMVABONA_VARIATIONS,
  SOMVABONA_VARIATIONS_CHECK,
  somvabonaTokensFor,
  somvabonaVariationFor,
} from "./variations";
import { validateThemeVariations } from "../../theme-variations";

function stub() {
  let n = 0;
  return (type: never, props: Record<string, PropValue> = {}): Section =>
    ({ id: `${String(type)}-${n++}`, type, props: { ...props } }) as Section;
}

describe("SOMVABONA_VARIATIONS", () => {
  it("ships the minimal + editorial starters", () => {
    expect(SOMVABONA_VARIATIONS.map((v) => v.key).sort()).toEqual([
      "editorial",
      "minimal",
    ]);
    for (const v of SOMVABONA_VARIATIONS) {
      expect(v.label.trim()).not.toBe("");
      expect(v.label_bn.trim()).not.toBe("");
    }
  });

  it("passes validation (unique keys, token keys + skin names only)", () => {
    expect(SOMVABONA_VARIATIONS_CHECK).toEqual({ ok: true });
    expect(validateThemeVariations("somvabona", SOMVABONA_VARIATIONS)).toEqual({
      ok: true,
    });
  });

  it("differs from the base look (token + skin proof)", () => {
    const minimal = somvabonaVariationFor("minimal")!;
    const editorial = somvabonaVariationFor("editorial")!;
    expect(Object.keys(minimal.tokenOverrides).length).toBeGreaterThan(0);
    expect(Object.keys(editorial.tokenOverrides).length).toBeGreaterThan(0);
    expect(minimal.skinDefaults.product_rail).not.toBe(
      (SOMVABONA_WIDGET_DEFAULTS.product_rail as { skin: string }).skin,
    );
    expect(somvabonaVariationFor("nope")).toBeNull();
  });
});

describe("somvabonaTokensFor", () => {
  it("merges the variation over base tokens", () => {
    const tokens = somvabonaTokensFor("minimal");
    expect(tokens.surface).toBe("#FFFFFF");
    expect(tokens.brand).toBe(SOMVABONA_TOKENS.brand);
  });

  it("unknown keys fall back to base tokens", () => {
    expect(somvabonaTokensFor("nope")).toEqual(SOMVABONA_TOKENS);
    expect(somvabonaTokensFor(undefined)).toEqual(SOMVABONA_TOKENS);
  });
});

describe("somvabona variation preview render", () => {
  it("editorial collection rail carries the editorial skin, base stays compact", () => {
    const s = stub();
    const baseMain = somvabonaPreviewSource().main("collection", s as never)!;
    const editorialMain = somvabonaPreviewSource("editorial").main(
      "collection",
      s as never,
    )!;
    const railOf = (main: { type: string; props: Record<string, PropValue> }[]) =>
      (main as { type: string; props: Record<string, PropValue> }[]).find(
        (x) => x.type === "product_rail",
      )!.props;
    // The collection rail authors cardVariant/showRating but no skin, so the
    // variation skin fills in while authored merchandising flags survive.
    expect(railOf(baseMain).skin).toBe("compact");
    expect(railOf(editorialMain).skin).toBe("editorial");
    expect(railOf(editorialMain).cardVariant).toBe("editorial");
    expect(railOf(editorialMain).showRating).toBe(true);
  });

  it("source exposes tokens + variation list for the registry", () => {
    const source = somvabonaPreviewSource("minimal");
    expect(source.tokens.surface).toBe("#FFFFFF");
    expect(source.variations?.map((v) => v.key).sort()).toEqual([
      "editorial",
      "minimal",
    ]);
  });
});
