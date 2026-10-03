/**
 * Theme variations core (Track T): validation, precedence, persistence.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_TOKENS, type ThemeTokens } from "./builder-ast";
import {
  MAX_VARIATION_KEY_LENGTH,
  applyVariationSkinDefaults,
  applyVariationTokens,
  persistedVariationKeyFromSettings,
  resolveActiveVariationKey,
  settingsWithVariationKey,
  validateThemeVariations,
  variationForKey,
  withVariationSkinDefaults,
  type SkinPropDefaults,
  type ThemeVariation,
} from "./theme-variations";

const BASE: ThemeTokens = { ...DEFAULT_TOKENS };

function variation(over: Partial<ThemeVariation> = {}): ThemeVariation {
  return {
    key: "minimal",
    label: "Minimal",
    label_bn: "মিনিমাল",
    tokenOverrides: { surface: "#FFFFFF" },
    skinDefaults: { product_rail: "minimal" },
    ...over,
  };
}

describe("validateThemeVariations", () => {
  it("accepts a well-formed list", () => {
    expect(
      validateThemeVariations("demo", [
        variation(),
        variation({
          key: "festive",
          label: "Festive",
          label_bn: "উৎসবমুখর",
          tokenOverrides: { motion: "lively" },
          skinDefaults: { hero_carousel: "fullbleed" },
        }),
      ]),
    ).toEqual({ ok: true });
  });

  it("rejects duplicate keys with a reason", () => {
    const result = validateThemeVariations("demo", [
      variation(),
      variation({ label: "Other", label_bn: "অন্য" }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/duplicate/i);
      expect(result.reason).toContain("minimal");
    }
  });

  it("rejects malformed keys with a reason", () => {
    for (const key of ["", "Minimal", "has space", "x".repeat(MAX_VARIATION_KEY_LENGTH + 1)]) {
      const result = validateThemeVariations("demo", [variation({ key })]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/slug/i);
    }
  });

  it("rejects missing labels with a reason", () => {
    const result = validateThemeVariations("demo", [
      variation({ label: "", label_bn: "" }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/label/);
  });

  it("rejects unknown token override keys with a reason", () => {
    for (const tokenOverrides of [
      { brandX: "#fff" },
      { dark: { brand: "#fff" } },
      { globals: {} },
      { timezone: "Asia/Dhaka" },
    ]) {
      const result = validateThemeVariations("demo", [
        variation({
          tokenOverrides: tokenOverrides as unknown as Partial<ThemeTokens>,
        }),
      ]);
      expect(result.ok, JSON.stringify(tokenOverrides)).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/token/i);
    }
  });

  it("rejects malformed token override values with a reason", () => {
    const result = validateThemeVariations("demo", [
      variation({ tokenOverrides: { brand: "red" } }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("brand");
      expect(result.reason).toMatch(/hex/);
    }
    const density = validateThemeVariations("demo", [
      variation({ tokenOverrides: { density: "tight" as never } }),
    ]);
    expect(density.ok).toBe(false);
  });

  it("rejects unknown skinnable widgets and out-of-vocabulary skins", () => {
    const widget = validateThemeVariations("demo", [
      variation({ skinDefaults: { mega_menu: "x" } as never }),
    ]);
    expect(widget.ok).toBe(false);
    if (!widget.ok) expect(widget.reason).toMatch(/mega_menu/);
    const skin = validateThemeVariations("demo", [
      variation({ skinDefaults: { product_rail: "nope" } }),
    ]);
    expect(skin.ok).toBe(false);
    if (!skin.ok) expect(skin.reason).toMatch(/product_rail/);
  });
});

describe("variation resolution precedence", () => {
  const list = [
    variation(),
    variation({
      key: "festive",
      label: "Festive",
      label_bn: "উৎসবমুখর",
      tokenOverrides: { motion: "lively" },
      skinDefaults: { hero_carousel: "fullbleed" },
    }),
  ];

  it("finds known keys and nulls unknown ones (default fallback)", () => {
    expect(variationForKey(list, "minimal")?.label).toBe("Minimal");
    expect(variationForKey(list, "nope")).toBeNull();
    expect(variationForKey(list, null)).toBeNull();
    expect(variationForKey(list, undefined)).toBeNull();
  });

  it("merges variation tokens over base, base untouched otherwise", () => {
    const merged = applyVariationTokens(BASE, list[0]!);
    expect(merged.surface).toBe("#FFFFFF");
    expect(merged.brand).toBe(BASE.brand);
    expect(merged.density).toBe(BASE.density);
    expect(merged).not.toBe(BASE);
    expect(applyVariationTokens(BASE, null)).toBe(BASE);
  });

  it("merges variation skins over base defaults per widget", () => {
    const base: SkinPropDefaults = {
      product_rail: { skin: "editorial" },
      hero_carousel: { skin: "split" },
    };
    const layered = applyVariationSkinDefaults(base, list[0]!);
    expect(layered.product_rail).toMatchObject({ skin: "minimal" });
    expect(layered.hero_carousel).toMatchObject({ skin: "split" });
    expect(base.product_rail).toMatchObject({ skin: "editorial" });
    expect(applyVariationSkinDefaults(base, null)).toBe(base);
  });

  it("builder wrap: base-equal counts as unset, explicit wins", () => {
    let n = 0;
    const raw = (type: never, props: Record<string, never> = {}) =>
      ({ id: `${String(type)}-${n++}`, type, props: { ...props } }) as never;
    const base: SkinPropDefaults = { product_rail: { skin: "editorial" } };
    const build = withVariationSkinDefaults(
      raw as never,
      list[0]!,
      base,
    ) as (type: string, props?: Record<string, unknown>) => { props: Record<string, unknown> };
    // Absent skin takes the variation.
    expect(build("product_rail", {}).props.skin).toBe("minimal");
    // Base-equal skin (merged by an inner base wrap) takes the variation.
    expect(build("product_rail", { skin: "editorial" }).props.skin).toBe(
      "minimal",
    );
    // Explicit non-default choice wins.
    expect(build("product_rail", { skin: "compact" }).props.skin).toBe(
      "compact",
    );
    // Widgets the variation does not name pass through.
    expect(build("mega_menu", { label: "Shop" }).props).toEqual({
      label: "Shop",
    });
  });
});

describe("per-store variation persistence", () => {
  const list = [variation(), variation({ ...variation(), key: "festive", label: "Festive", label_bn: "উৎসবমুখর" })];

  it("round-trips the key through the theme settings document", () => {
    const stored = settingsWithVariationKey({ brand: "#111" }, "minimal");
    expect(stored).toMatchObject({ brand: "#111", variation: "minimal" });
    expect(persistedVariationKeyFromSettings(stored)).toBe("minimal");
  });

  it("clearing removes only the variation field", () => {
    const stored = settingsWithVariationKey({ brand: "#111" }, null);
    expect(stored).toEqual({ brand: "#111" });
    expect(persistedVariationKeyFromSettings(stored)).toBeNull();
  });

  it("rejects malformed persisted values", () => {
    expect(persistedVariationKeyFromSettings(null)).toBeNull();
    expect(persistedVariationKeyFromSettings({})).toBeNull();
    expect(persistedVariationKeyFromSettings({ variation: "Nope!" })).toBeNull();
    expect(persistedVariationKeyFromSettings({ variation: 42 })).toBeNull();
  });

  it("requested > persisted > base default", () => {
    expect(
      resolveActiveVariationKey(list, {
        requested: "festive",
        persisted: "minimal",
      })?.key,
    ).toBe("festive");
    // Unknown request falls through to the persisted key.
    expect(
      resolveActiveVariationKey(list, {
        requested: "nope",
        persisted: "minimal",
      })?.key,
    ).toBe("minimal");
    // Unknown persisted falls back to the base theme (null).
    expect(
      resolveActiveVariationKey(list, { persisted: "nope" }),
    ).toBeNull();
    expect(resolveActiveVariationKey(list, {})).toBeNull();
  });
});
