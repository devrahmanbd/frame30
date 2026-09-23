/**
 * Phase 3.1 — theme-level token contract.
 *
 * The token set is merchant-authored and stored, so parsing must be total:
 * garbage falls back to the platform default and an older stored theme (with
 * none of the 3.1 keys) must parse to exactly today's rendering.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_TOKENS,
  DEFAULT_TOKENS,
  FONT_PAIRINGS,
  applyFontPairing,
  contrastRatio,
  parseTokens,
  tokensToCss,
} from "./builder-ast";
import { formatDisplayMoney } from "./money-display";

describe("phase 3.1 tokens", () => {
  it("parses a legacy theme to the light-only defaults", () => {
    const legacy = { brand: "#123456", radius: "4px" };
    const tokens = parseTokens(legacy);
    expect(tokens.brand).toBe("#123456");
    expect(tokens.shadow).toBe(DEFAULT_TOKENS.shadow);
    expect(tokens.motion).toBe(DEFAULT_TOKENS.motion);
    expect(tokens.digits).toBe("latin");
    expect(tokens.locale).toBe("en");
    expect(tokens.currencyDisplay).toBe("symbol");
    expect(tokens.dark).toBeNull();
  });

  it("rejects out-of-set values on every new field", () => {
    const tokens = parseTokens({
      shadow: "glow",
      motion: "insane",
      digits: "roman",
      locale: "fr",
      currencyDisplay: "emoji",
      fontPairing: "comic",
      dark: "yes",
    });
    expect(tokens.shadow).toBe(DEFAULT_TOKENS.shadow);
    expect(tokens.motion).toBe(DEFAULT_TOKENS.motion);
    expect(tokens.digits).toBe(DEFAULT_TOKENS.digits);
    expect(tokens.locale).toBe(DEFAULT_TOKENS.locale);
    expect(tokens.currencyDisplay).toBe(DEFAULT_TOKENS.currencyDisplay);
    expect(tokens.fontPairing).toBe(DEFAULT_TOKENS.fontPairing);
    expect(tokens.dark).toBeNull();
  });

  it("keeps an authored dark set and repairs bad channels", () => {
    const tokens = parseTokens({ dark: { brand: "#FFAA00", surface: "nope" } });
    expect(tokens.dark?.brand).toBe("#FFAA00");
    expect(tokens.dark?.surface).toBe(DEFAULT_DARK_TOKENS.surface);
  });

  it("emits shadow, motion and digit variables", () => {
    const css = tokensToCss({
      ...DEFAULT_TOKENS,
      shadow: "none",
      motion: "none",
      digits: "bengali",
    });
    expect(css["--theme-shadow-md"]).toBe("none");
    expect(css["--theme-motion-duration"]).toBe("0ms");
    expect(css["--theme-digits"]).toBe("bengali");
    expect(css["--theme-dark-surface"]).toBeUndefined();
  });

  it("emits the dark map only when a dark set exists", () => {
    const css = tokensToCss({ ...DEFAULT_TOKENS, dark: DEFAULT_DARK_TOKENS });
    expect(css["--theme-dark-surface"]).toBe(DEFAULT_DARK_TOKENS.surface);
    expect(css["--theme-dark-border"]).toContain("color-mix");
  });

  it("validates dark contrast independently of light", () => {
    // The shipped dark default must clear AA on its own, not by inheriting light.
    expect(
      contrastRatio(DEFAULT_DARK_TOKENS.ink, DEFAULT_DARK_TOKENS.surface),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("font pairing sets both faces, custom leaves them alone", () => {
    const paired = applyFontPairing(DEFAULT_TOKENS, "modern-sans");
    expect(paired.fontDisplay).toBe(FONT_PAIRINGS["modern-sans"].display);
    expect(paired.fontBody).toBe(FONT_PAIRINGS["modern-sans"].body);
    const custom = applyFontPairing(paired, "custom");
    expect(custom.fontDisplay).toBe(paired.fontDisplay);
  });

  it("currency display swaps the symbol without touching digits", () => {
    expect(formatDisplayMoney(120000, { compact: true })).toContain("৳");
    const code = formatDisplayMoney(120000, {
      compact: true,
      currencyDisplay: "code",
    });
    expect(code.startsWith("BDT")).toBe(true);
    expect(code).toContain("1,200");
  });
});
