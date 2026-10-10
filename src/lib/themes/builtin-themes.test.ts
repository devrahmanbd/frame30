import { describe, expect, it } from "vitest";
import {
  OFFICIAL_THEME_KEYS,
  getBuiltinTheme,
  isOfficialThemeKey,
} from "./builtin-themes";

describe("builtin-themes single authority", () => {
  it("names exactly songoskriti + somvabona", () => {
    expect([...OFFICIAL_THEME_KEYS]).toEqual(["songoskriti", "somvabona"]);
  });
  it("resolves source modules without ZIP or JSON", () => {
    for (const key of OFFICIAL_THEME_KEYS) {
      const entry = getBuiltinTheme(key)!;
      expect(entry.key).toBe(key);
      expect(typeof entry.source).toBe("function");
      const src = entry.source();
      expect(src.key).toBe(key);
      expect(typeof src.tokens).toBe("object");
    }
  });
  it("rejects unknown keys including OceanBlue", () => {
    expect(isOfficialThemeKey("oceanblue")).toBe(false);
    expect(getBuiltinTheme("oceanblue" as never)).toBeNull();
  });
});
