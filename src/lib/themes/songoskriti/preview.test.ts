/**
 * Songoskriti preview source — theme-owned demo content.
 *
 * The engine contract (every template non-empty, unique ids) is pinned by
 * theme-preview-nav.test.ts; here we pin the theme's own bodies so a copy
 * or renderer regression inside this folder fails fast at the source.
 */
import { describe, expect, it } from "vitest";
import { songoskritiPreviewSource } from "./preview";

describe("songoskritiPreviewSource", () => {
  it("identifies the theme for the registry", () => {
    const source = songoskritiPreviewSource();
    expect(source.key).toBe("songoskriti");
    expect(source.tokens.brand).toBe("#8A3B1F");
  });

  it("authors the homepage from the theme builders", () => {
    const source = songoskritiPreviewSource();
    let n = 0;
    const s = (type: any, props: any = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    expect(source.header(s).length).toBeGreaterThan(0);
    expect(source.footer(s).length).toBeGreaterThan(0);
    const index = source.main("index", s)!;
    expect(index.map((x) => x.type)).toEqual([
      "announcement_bar",
      "hero_carousel",
      "circle_categories",
      "finder_row",
      "product_rail",
      "product_rail",
      "craft_story",
      "testimonials",
      "trust_footer",
    ]);
  });

  it("authors demo bodies with proven renderers", () => {
    const source = songoskritiPreviewSource();
    let n = 0;
    const s = (type: any, props: any = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    const types = (t: Parameters<typeof source.main>[0]) =>
      source.main(t, s)!.map((x) => x.type);
    expect(types("collection")).toContain("product_rail");
    expect(types("product")).toContain("product_media");
    expect(types("account")).toEqual([
      "heading",
      "profile_card",
      "orders_list",
    ]);
  });
});
