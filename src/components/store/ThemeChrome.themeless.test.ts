/**
 * Themeless gate — TDD: stores without any theme get one shared page.
 */
import { describe, expect, it } from "vitest";
import { isThemeless } from "./ThemeChrome";

describe("isThemeless", () => {
  it("is true only when both ast and tokens are missing", () => {
    expect(isThemeless(null, null)).toBe(true);
    expect(isThemeless({ header: [], main: [], footer: [] }, null)).toBe(false);
    expect(isThemeless(null, { brand: "#000000" } as never)).toBe(false);
  });
});
