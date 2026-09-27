/**
 * Songoskriti widget skins (lane B).
 *
 * Pins the theme-owned half of the skins contract: preset defaults ride in
 * factory output, authored props win, unknown skins fall back. The core
 * half (`skin` catalog field, renderer `data-widget`/`data-skin` attrs,
 * conditional sheet loading) is not implemented yet — verified 2026-09-25,
 * no `skin` key in builder-ast outside `skin_quiz`/taxonomy — so fallback
 * is asserted at this layer only (resolveSongoskritiSkin), not end-to-end.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { buildHomepageMain } from "./homepage";
import { songoskritiPreviewSource } from "./preview";
import {
  resolveSongoskritiSkin,
  SONGOSKRITI_SKIN_DEFAULTS,
  SONGOSKRITI_SKIN_SETS,
  SONGOSKRITI_WIDGET_DEFAULTS,
  withSongoskritiDefaults,
} from "./skins";

type Stub = (type: SectionType, props?: Record<string, PropValue>) => Section;

const stub: Stub = (type, props = {}) => ({
  id: `${type}-1`,
  type,
  props: { ...props },
});

describe("SONGOSKRITI_WIDGET_DEFAULTS", () => {
  it("declares the editorial Songoskriti face per skinnable widget", () => {
    expect(SONGOSKRITI_WIDGET_DEFAULTS).toEqual({
      product_rail: { skin: "editorial" },
      hero_carousel: { skin: "split" },
      testimonials: { skin: "wall" },
      product_grid: { skin: "cards" },
    });
  });

  it("defaults stay inside each widget's closed vocabulary", () => {
    for (const [type, defaults] of Object.entries(
      SONGOSKRITI_WIDGET_DEFAULTS,
    )) {
      const allowed = (
        SONGOSKRITI_SKIN_SETS as Record<string, readonly string[]>
      )[type]!;
      expect(allowed, type).toContain(defaults.skin);
      expect(
        SONGOSKRITI_SKIN_DEFAULTS[
          type as keyof typeof SONGOSKRITI_SKIN_DEFAULTS
        ],
      ).toBe(defaults.skin);
    }
  });
});

describe("withSongoskritiDefaults", () => {
  it("adds the skin default to a bare skinnable section", () => {
    const build = withSongoskritiDefaults(stub);
    expect(build("product_rail", { heading: "New" }).props).toMatchObject({
      heading: "New",
      skin: "editorial",
    });
    expect(build("hero_carousel", {}).props.skin).toBe("split");
    expect(build("testimonials", {}).props.skin).toBe("wall");
    expect(build("product_grid", {}).props.skin).toBe("cards");
  });

  it("authored props win over defaults (merchant override)", () => {
    const build = withSongoskritiDefaults(stub);
    const section = build("product_rail", {
      heading: "New",
      skin: "minimal",
      cardVariant: "standard",
    });
    expect(section.props.skin).toBe("minimal");
    expect(section.props.cardVariant).toBe("standard");
  });

  it("an explicit undefined never clobbers the default", () => {
    const build = withSongoskritiDefaults(stub);
    const section = build("product_rail", {
      heading: "New",
      skin: undefined as unknown as PropValue,
    });
    expect(section.props.skin).toBe("editorial");
  });

  it("leaves non-skinnable types byte-identical", () => {
    const build = withSongoskritiDefaults(stub);
    const props = { heading: "Shop", heading_bn: "কেনাকাটা" };
    expect(build("mega_menu", props).props).toEqual(props);
    expect(build("rich_text", { body: "x" }).props).toEqual({ body: "x" });
  });
});

describe("resolveSongoskritiSkin", () => {
  it("passes known skins through", () => {
    expect(resolveSongoskritiSkin("product_rail", "compact")).toBe("compact");
    expect(resolveSongoskritiSkin("hero_carousel", "fullbleed")).toBe(
      "fullbleed",
    );
    expect(resolveSongoskritiSkin("testimonials", "single")).toBe("single");
    expect(resolveSongoskritiSkin("product_grid", "rows")).toBe("rows");
  });

  it("falls back to the widget default for unknown values (never a crash)", () => {
    expect(resolveSongoskritiSkin("product_rail", "nope")).toBe("editorial");
    expect(resolveSongoskritiSkin("hero_carousel", "")).toBe("split");
    expect(resolveSongoskritiSkin("testimonials", undefined)).toBe("wall");
    expect(resolveSongoskritiSkin("product_grid", 42)).toBe("cards");
  });

  it("passes non-skinnable types through untouched", () => {
    expect(resolveSongoskritiSkin("mega_menu", "x")).toBe("x");
    expect(resolveSongoskritiSkin("rich_text", undefined)).toBe("");
  });
});

describe("factory output carries theme defaults", () => {
  it("homepage product rails, hero and testimonials ship their skins", () => {
    const sections = buildHomepageMain(stub);
    const rails = sections.filter((s) => s.type === "product_rail");
    expect(rails).toHaveLength(6);
    for (const rail of rails) expect(rail.props.skin).toBe("editorial");
    const hero = sections.find((s) => s.type === "hero_carousel")!;
    expect(hero.props.skin).toBe("fullbleed");
    const quotes = sections.find((s) => s.type === "testimonials")!;
    expect(quotes.props.skin).toBe("carousel");
  });

  it("defaults merge under authored props — copy and card choices survive", () => {
    const sections = buildHomepageMain(stub);
    const [first] = sections.filter((s) => s.type === "product_rail");
    expect(first!.props.heading).toBe("SIGNATURE SAREES");
    expect(first!.props.heading_bn).toBe("সিগনেচার শাড়ি");
    expect(first!.props.cardVariant).toBe("standard");
    expect(first!.props.skin).toBe("editorial");
  });

  it("preview rails on non-homepage templates carry the default too", () => {
    const source = songoskritiPreviewSource();
    let n = 0;
    const s = (type: SectionType, props: Record<string, PropValue> = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    for (const template of [
      "collection",
      "product",
      "search",
      "cart",
    ] as const) {
      const main = source.main(template, s)!;
      const rails = main.filter((x) => x.type === "product_rail");
      expect(rails.length, template).toBeGreaterThan(0);
      for (const rail of rails) expect(rail.props.skin).toBe("editorial");
    }
  });
});

describe("skins.css", () => {
  const css = readFileSync(new URL("./skins.css", import.meta.url), "utf8");

  it("keys every default skin off data-widget + data-skin", () => {
    for (const [type, defaults] of Object.entries(
      SONGOSKRITI_WIDGET_DEFAULTS,
    )) {
      expect(
        css.includes(`[data-widget="${type}"][data-skin="${defaults.skin}"]`),
        `${type}/${defaults.skin}`,
      ).toBe(true);
    }
  });

  it("stays token-driven: theme vars only, no hex literals", () => {
    expect(css).toMatch(/var\(--theme-/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("collapses motion for reduced-motion visitors", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
