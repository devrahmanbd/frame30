import { describe, expect, it } from "vitest";
import { OCEANBLUE_V2_TOKENS } from "./tokens";
import { HOMEPAGE_V2_SECTION_TYPES } from "./types";

describe("oceanblue-v2 tokens", () => {
  it("carries the maroon studied-DNA system", () => {
    expect(OCEANBLUE_V2_TOKENS.brand).toBe("#A72F30");
    expect(OCEANBLUE_V2_TOKENS.surface).toBe("#FFFFFF");
    expect(OCEANBLUE_V2_TOKENS.ink).toBe("#241318");
    expect(OCEANBLUE_V2_TOKENS.radius).toBe("10px");
    expect(OCEANBLUE_V2_TOKENS.dark).toBeNull();
    expect(OCEANBLUE_V2_TOKENS.fontPairing).toBe("bengali-classic");
  });
  it("declares 14 homepage sections starting with the hero", () => {
    expect(HOMEPAGE_V2_SECTION_TYPES).toHaveLength(14);
    expect(HOMEPAGE_V2_SECTION_TYPES[0]).toBe("hero_carousel");
  });
});
