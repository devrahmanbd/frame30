/**
 * Oceanblue-v2 preview source — theme-owned demo content.
 *
 * The engine contract (every template non-empty, unique ids) is pinned by
 * theme-preview-nav.test.ts; here we pin the theme's own bodies so a copy
 * or renderer regression inside this folder fails fast at the source.
 */
import { describe, expect, it } from "vitest";
import { oceanblueV2PreviewSource } from "./preview";
import { flattenSections, type SectionBuilder } from "../../builder-ast";

describe("oceanblueV2PreviewSource", () => {
  it("identifies the theme for the registry", () => {
    const source = oceanblueV2PreviewSource();
    expect(source.key).toBe("oceanblue-v2");
    expect(source.tokens.brand).toBe("#A72F30");
  });

  it("authors the homepage from the theme builders", () => {
    const source = oceanblueV2PreviewSource();
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
    // Maroon campaign rhythm: 4-slide banner hero, circle tiles +
    // Shop-by-Color carry discovery, rails prove demand, maroon split +
    // trust + story + single voice + locator + newsletter close. Full order
    // pinned in wiring.test.ts; here we pin the head, the length, the close.
    expect(index).toHaveLength(11);
    expect(index[0]!.type).toBe("hero_carousel");
    expect(index[index.length - 1]!.type).toBe("newsletter");
  });

  it("authors demo bodies with proven renderers", () => {
    const source = oceanblueV2PreviewSource();
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
