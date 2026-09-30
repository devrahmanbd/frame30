/**
 * Oceanblue preview source — theme-owned demo content.
 *
 * The engine contract (every template non-empty, unique ids) is pinned by
 * theme-preview-nav.test.ts; here we pin the theme's own bodies so a copy
 * or renderer regression inside this folder fails fast at the source.
 */
import { describe, expect, it } from "vitest";
import { oceanbluePreviewSource } from "./preview";
import { flattenSections, type SectionBuilder } from "../../builder-ast";

describe("oceanbluePreviewSource", () => {
  it("identifies the theme for the registry", () => {
    const source = oceanbluePreviewSource();
    expect(source.key).toBe("oceanblue");
    expect(source.tokens.brand).toBe("#0B3A5B");
  });

  it("authors the homepage from the theme builders", () => {
    const source = oceanbluePreviewSource();
    let n = 0;
    const s: SectionBuilder = (type, props = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    expect(source.header("index", s).map((x) => x.type)).toEqual([
      "announcement_bar",
    ]);
    expect(source.footer("index", s).length).toBeGreaterThan(0);
    const index = source.main("index", s)!;
    // Big-catalog discovery rhythm: hero shops three campaigns, circle
    // tiles + Shop-by-Color carry discovery, rails prove demand, trust +
    // story + single voice + locator + newsletter close. Full order pinned
    // in wiring.test.ts; here we pin the head, the length, and the close.
    expect(index).toHaveLength(11);
    expect(index[0]!.type).toBe("hero_carousel");
    expect(index[index.length - 1]!.type).toBe("newsletter");
  });

  it("authors demo bodies with proven renderers", () => {
    const source = oceanbluePreviewSource();
    let n = 0;
    const s: SectionBuilder = (type, props = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    for (const template of [
      "index",
      "product",
      "collection",
      "page",
      "blog",
      "cart",
      "checkout",
      "search",
      "account",
    ] as const) {
      const sections = source.main(template, s);
      expect(sections, `${template} preview must be non-empty`).toBeDefined();
      expect(sections!.length).toBeGreaterThan(0);
      const ids = flattenSections(sections!).map((x) => x.id);
      expect(new Set(ids).size, `${template} ids unique`).toBe(ids.length);
    }
  });
});
