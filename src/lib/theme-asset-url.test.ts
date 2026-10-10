import { describe, expect, it } from "vitest";
import {
  toSourceUrl,
  toPackageRef,
  isSourceUrl,
  isPackageRef,
  findPackageRefs,
} from "./theme-asset-url";

describe("theme-asset-url boundary", () => {
  it("source URLs are absolute /ph/ paths", () => {
    expect(toSourceUrl("hero-festive.png", "songoskriti")).toBe(
      "/ph/songoskriti/hero-festive.png",
    );
    expect(isSourceUrl("/ph/songoskriti/hero-festive.png")).toBe(true);
    expect(isSourceUrl("assets/hero-festive.png")).toBe(false);
  });
  it("package refs are bare assets/ paths for ZIP context only", () => {
    expect(toPackageRef("hero-festive.png")).toBe("assets/hero-festive.png");
    expect(isPackageRef("assets/hero-festive.png")).toBe(true);
    expect(isPackageRef("/ph/songoskriti/hero-festive.png")).toBe(false);
  });
  it("strips stray prefixes instead of stacking them", () => {
    expect(toSourceUrl("/ph/songoskriti/cat-women.png", "somvabona")).toBe(
      "/ph/somvabona/cat-women.png",
    );
    expect(toPackageRef("assets/cat-women.png")).toBe("assets/cat-women.png");
    expect(isSourceUrl(toSourceUrl("cat-women.png", "somvabona"))).toBe(true);
  });
  it("findPackageRefs reports bare assets/ refs and ignores source URLs", () => {
    expect(
      findPackageRefs({
        hero: "/ph/songoskriti/hero-festive.png",
        gallery: ["assets/hero-festive.png", "/ph/songoskriti/cat-men.png"],
        nested: { deep: "assets/cat-women.png" },
      }),
    ).toEqual(["assets/hero-festive.png", "assets/cat-women.png"]);
    expect(findPackageRefs({ hero: "/ph/somvabona/x.png" })).toEqual([]);
    expect(findPackageRefs(null)).toEqual([]);
  });
});
