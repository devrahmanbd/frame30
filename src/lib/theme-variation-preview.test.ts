/**
 * Theme variation preview contract (Track T): `?variation=` param,
 * resolver metadata, and per-store persistence fallback.
 */
import { describe, expect, it } from "vitest";
import { previewSourceFor, registerStaticPreviewSource } from "./preview-sources";
import { songoskritiPreviewSource } from "./themes/songoskriti/preview";
import { somvabonaPreviewSource } from "./themes/somvabona/preview";
import {
  resolveThemePreview,
  validateThemePreviewSearch,
} from "./theme-preview-nav";
import {
  persistedVariationKeyFromSettings,
  resolveActiveVariationKey,
  settingsWithVariationKey,
} from "./theme-variations";
import { SONGOSKRITI_VARIATIONS } from "./themes/songoskriti/variations";
import { SOMVABONA_TOKENS } from "./themes/somvabona/tokens";

// O2: static theme sources are build-time-only — this test file is a
// build-time context, so it wires the factories explicitly.
registerStaticPreviewSource("songoskriti", songoskritiPreviewSource);
registerStaticPreviewSource("somvabona", somvabonaPreviewSource);

describe("preview ?variation= param", () => {
  it("accepts slug-shaped keys and drops the rest", () => {
    expect(validateThemePreviewSearch({ variation: "minimal" }).variation).toBe(
      "minimal",
    );
    expect(
      validateThemePreviewSearch({ variation: "festive-refresh" }).variation,
    ).toBe("festive-refresh");
    expect(validateThemePreviewSearch({ variation: "Minimal!" }).variation).toBeUndefined();
    expect(validateThemePreviewSearch({}).variation).toBeUndefined();
    expect(
      validateThemePreviewSearch({ variation: "x".repeat(41) }).variation,
    ).toBeUndefined();
  });

  it("threads the key into the preview source", () => {
    expect(previewSourceFor("songoskriti", "minimal")?.tokens.surface).toBe(
      "#FFFFFF",
    );
    expect(previewSourceFor("songoskriti")?.tokens.surface).toBe("#faf9f7");
    expect(previewSourceFor("nope", "minimal")).toBeNull();
  });
});

describe("resolveThemePreview with variation", () => {
  it("returns merged tokens + variation metadata", () => {
    const preset = resolveThemePreview("songoskriti", "minimal")!;
    expect(preset.variation?.key).toBe("minimal");
    expect(preset.tokens.surface).toBe("#FFFFFF");
    expect(preset.variations.map((v) => v.key).sort()).toEqual([
      "festive",
      "minimal",
    ]);
  });

  it("unknown variation falls back to the base theme (never 404)", () => {
    const preset = resolveThemePreview("songoskriti", "nope")!;
    expect(preset.variation).toBeNull();
    expect(preset.tokens.surface).toBe("#faf9f7");
    expect(preset.variations).toHaveLength(2);
  });

  it("omitted variation keeps today's base behavior byte-identical", () => {
    const preset = resolveThemePreview("songoskriti")!;
    expect(preset.variation).toBeNull();
    expect(preset.templates.index.main.length).toBeGreaterThan(0);
    const somvabona = resolveThemePreview("somvabona")!;
    expect(somvabona.variation).toBeNull();
    expect(somvabona.tokens).toEqual(SOMVABONA_TOKENS);
  });

  it("unknown theme still resolves null", () => {
    expect(resolveThemePreview("nope", "minimal")).toBeNull();
  });
});

describe("per-store persistence fallback in preview selection", () => {
  it("request wins, persisted is the fallback, base is the default", () => {
    const persisted = persistedVariationKeyFromSettings(
      settingsWithVariationKey({}, "festive"),
    );
    // No explicit request: the merchant's stored variation applies.
    expect(
      resolveActiveVariationKey(SONGOSKRITI_VARIATIONS, {
        requested: undefined,
        persisted,
      })?.key,
    ).toBe("festive");
    // Explicit request wins over the stored one.
    expect(
      resolveActiveVariationKey(SONGOSKRITI_VARIATIONS, {
        requested: "minimal",
        persisted,
      })?.key,
    ).toBe("minimal");
    // Neither: base theme.
    expect(
      resolveActiveVariationKey(SONGOSKRITI_VARIATIONS, {}),
    ).toBeNull();
  });
});
