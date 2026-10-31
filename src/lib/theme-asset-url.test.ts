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
    expect(toSourceUrl("hero-festive.jpg", "songoskriti")).toBe(
      "/ph/songoskriti/hero-festive.jpg",
    );
    expect(isSourceUrl("/ph/songoskriti/hero-festive.jpg")).toBe(true);
    expect(isSourceUrl("assets/hero-festive.jpg")).toBe(false);
  });
  it("package refs are bare assets/ paths for ZIP context only", () => {
    expect(toPackageRef("hero-festive.jpg")).toBe("assets/hero-festive.jpg");
    expect(isPackageRef("assets/hero-festive.jpg")).toBe(true);
    expect(isPackageRef("/ph/songoskriti/hero-festive.jpg")).toBe(false);
  });
  it("strips stray prefixes instead of stacking them", () => {
    expect(toSourceUrl("/ph/songoskriti/cat-women.png", "acme-pack")).toBe(
      "/ph/acme-pack/cat-women.png",
    );
    expect(toPackageRef("assets/cat-women.png")).toBe("assets/cat-women.png");
    expect(isSourceUrl(toSourceUrl("cat-women.png", "acme-pack"))).toBe(true);
  });
  it("findPackageRefs reports bare assets/ refs and ignores source URLs", () => {
    expect(
      findPackageRefs({
        hero: "/ph/songoskriti/hero-festive.jpg",
        gallery: ["assets/hero-festive.jpg", "/ph/songoskriti/cat-men.jpg"],
        nested: { deep: "assets/cat-women.png" },
      }),
    ).toEqual(["assets/hero-festive.jpg", "assets/cat-women.png"]);
    expect(findPackageRefs({ hero: "/ph/acme-pack/x.png" })).toEqual([]);
    expect(findPackageRefs(null)).toEqual([]);
  });
});
