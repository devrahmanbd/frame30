/**
 * Somvabona preview source — theme-owned demo content.
 *
 * The engine contract (every template non-empty, unique ids) is pinned by
 * theme-preview-nav.test.ts; here we pin the theme's own bodies so a copy
 * or renderer regression inside this folder fails fast at the source.
 */
import { describe, expect, it } from "vitest";
import { somvabonaPreviewSource } from "./preview";

describe("somvabonaPreviewSource", () => {
  it("identifies the theme for the registry", () => {
    const source = somvabonaPreviewSource();
    expect(source.key).toBe("somvabona");
    expect(source.tokens.brand).toBe("#7C2A1A");
  });

  it("authors the homepage from the theme builders", () => {
    const source = somvabonaPreviewSource();
    let n = 0;
    const s = (type: any, props: any = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    expect(source.header(s).length).toBeGreaterThan(0);
    expect(source.footer(s).length).toBeGreaterThan(0);
    const index = source.main("index", s)!;
    expect(index.map((x) => x.type)[0]).toBe("announcement_bar");
    expect(index.length).toBeGreaterThan(5);
  });

  it("authors collection and product demo bodies", () => {
    const source = somvabonaPreviewSource();
    let n = 0;
    const s = (type: any, props: any = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    expect(source.main("collection", s)!.map((x) => x.type)).toContain(
      "product_rail",
    );
    expect(source.main("product", s)!.map((x) => x.type)).toContain(
      "product_media",
    );
  });

  it("leaves the remaining templates to generic synthesis", () => {
    const source = somvabonaPreviewSource();
    let n = 0;
    const s = (type: any, props: any = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    for (const t of ["page", "blog", "search", "cart", "checkout", "account"] as const) {
      expect(source.main(t, s)).toBeNull();
    }
  });
});
