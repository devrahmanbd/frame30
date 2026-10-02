/**
 * BlueOcean preview source — theme-owned demo content.
 *
 * The engine contract (every template non-empty, unique ids) is pinned by
 * theme-preview-nav.test.ts; here we pin the theme's own bodies so a copy
 * or renderer regression inside this folder fails fast at the source.
 */
import { describe, expect, it } from "vitest";
import { blueoceanPreviewSource } from "./preview";
import { type SectionBuilder } from "../../builder-ast";

describe("blueoceanPreviewSource", () => {
  it("identifies the theme for the registry", () => {
    const source = blueoceanPreviewSource();
    expect(source.key).toBe("blueocean");
    expect(source.tokens.brand).toBe("#0A3642");
  });

  it("authors the homepage from the theme builders", () => {
    const source = blueoceanPreviewSource();
    let n = 0;
    const s: SectionBuilder = (type, props = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    expect(source.header("index", s).map((x) => x.type)).toEqual([
      "announcement_bar",
      "mega_menu",
    ]);
    expect(source.footer("index", s).length).toBeGreaterThan(0);
    const index = source.main("index", s)!;
    // Editorial marketplace rhythm: fullbleed hero shops three campaigns,
    // circles + rails carry discovery, split breaks the grid, live grid +
    // trust + story + wall + locator + newsletter close. Full order pinned
    // in wiring.test.ts; here we pin the head, the length, and the close.
    expect(index).toHaveLength(12);
    expect(index[0]!.type).toBe("hero_carousel");
    expect(index[index.length - 1]!.type).toBe("newsletter");
  });

  it("authors demo bodies with proven renderers", () => {
    const source = blueoceanPreviewSource();
    let n = 0;
    const s: SectionBuilder = (type, props = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    for (const template of [
      "product",
      "collection",
      "page",
      "blog",
      "cart",
      "checkout",
      "search",
      "account",
    ] as const) {
      const body = source.main(template, s)!;
      expect(body.length, template).toBeGreaterThan(0);
    }
  });
});
