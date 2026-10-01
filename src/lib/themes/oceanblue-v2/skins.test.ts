/**
 * Oceanblue-v2 widget skins (Task 2).
 *
 * Pins the theme-owned half of the skins contract: preset defaults ride in
 * factory output, authored props win, unknown skins fall back, undefined
 * never leaks into props. Maroon studied-DNA face: banner hero default,
 * minimal rails, single testimonial, cards grid.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PropValue, Section, SectionType } from "../../builder-ast";
import {
  resolveOceanblueV2Skin,
  OCEANBLUE_V2_SKIN_DEFAULTS,
  OCEANBLUE_V2_SKIN_SETS,
  OCEANBLUE_V2_WIDGET_DEFAULTS,
  withOceanblueV2Defaults,
} from "./skins";

type Stub = (type: SectionType, props?: Record<string, PropValue>) => Section;

const stub: Stub = (type, props = {}) => ({
  id: `${type}-1`,
  type,
  props: { ...props },
});

describe("OCEANBLUE_V2_WIDGET_DEFAULTS", () => {
  it("declares the maroon Oceanblue-v2 face per skinnable widget", () => {
    expect(OCEANBLUE_V2_WIDGET_DEFAULTS).toEqual({
      product_rail: { skin: "minimal" },
      hero_carousel: { skin: "banner" },
      testimonials: { skin: "single" },
      product_grid: { skin: "cards" },
      urgency_rail: { skin: "minimal" },
    });
  });

  it("defaults stay inside each widget's closed vocabulary", () => {
    for (const [type, defaults] of Object.entries(
      OCEANBLUE_V2_WIDGET_DEFAULTS,
    )) {
      const allowed = (
        OCEANBLUE_V2_SKIN_SETS as Record<string, readonly string[]>
      )[type]!;
      expect(allowed, type).toContain(defaults.skin);
      expect(
        OCEANBLUE_V2_SKIN_DEFAULTS[
          type as keyof typeof OCEANBLUE_V2_SKIN_DEFAULTS
        ],
      ).toBe(defaults.skin);
    }
  });
});

describe("withOceanblueV2Defaults", () => {
  it("adds the skin default to a bare skinnable section", () => {
    const build = withOceanblueV2Defaults(stub);
    expect(build("product_rail", { heading: "New" }).props).toMatchObject({
      heading: "New",
      skin: "minimal",
    });
    expect(build("hero_carousel", {}).props.skin).toBe("banner");
    expect(build("testimonials", {}).props.skin).toBe("single");
    expect(build("product_grid", {}).props.skin).toBe("cards");
    expect(build("urgency_rail", {}).props.skin).toBe("minimal");
  });

  it("authored skin always wins over the default", () => {
    const build = withOceanblueV2Defaults(stub);
    expect(build("product_rail", { skin: "compact" }).props.skin).toBe(
      "compact",
    );
    expect(build("hero_carousel", { skin: "split" }).props.skin).toBe("split");
  });

  it("leaves non-skinnable types untouched", () => {
    const build = withOceanblueV2Defaults(stub);
    expect(build("newsletter", { heading: "Hi" }).props).toEqual({
      heading: "Hi",
    });
  });

  it("never leaks undefined into props (default survives)", () => {
    const build = withOceanblueV2Defaults(stub);
    const props = build("product_rail", {
      heading: "New",
      skin: undefined as unknown as PropValue,
    }).props;
    expect("skin" in props && props.skin === undefined).toBe(false);
    expect(props.skin).toBe("minimal");
  });
});

describe("resolveOceanblueV2Skin", () => {
  it("falls back to the theme default on unknown or empty values", () => {
    expect(resolveOceanblueV2Skin("product_rail", "nope")).toBe("minimal");
    expect(resolveOceanblueV2Skin("product_rail", "")).toBe("minimal");
    expect(resolveOceanblueV2Skin("product_rail", undefined)).toBe("minimal");
    expect(resolveOceanblueV2Skin("hero_carousel", "banner")).toBe("banner");
    expect(resolveOceanblueV2Skin("hero_carousel", "split")).toBe("split");
    expect(resolveOceanblueV2Skin("hero_carousel", "nope")).toBe("banner");
  });

  it("passes non-skinnable values through for the core renderer", () => {
    expect(resolveOceanblueV2Skin("newsletter", "x")).toBe("x");
    expect(resolveOceanblueV2Skin("newsletter", undefined)).toBe("");
  });
});

const cssPath = "src/lib/themes/oceanblue-v2/skins.css";

describe("skins.css token gate", () => {
  it("stays token-driven: theme vars only, no hex literals", () => {
    const css = readFileSync(cssPath, "utf8");
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).toContain("var(--theme-brand)");
    expect(css).toContain("var(--theme-surface)");
    expect(css).toContain("var(--theme-ink)");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("ships the polish layer: motion, pattern, focus", () => {
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("scroll-behavior");
    expect(css).toContain("translateY(-4px)");
    expect(css).toContain("radial-gradient");
    expect(css).toContain(":focus-visible");
    const rules = css.split("}");
    const scoped = rules.filter(
      (r) => r.includes("[data-widget=") || r.includes(".fq-theme-scope"),
    );
    const unscoped = rules.filter(
      (r) =>
        r.trim() &&
        !r.includes("[data-widget=") &&
        !r.includes(".fq-theme-scope") &&
        !r.includes("@media") &&
        !r.includes("prefers-reduced-motion") &&
        !r.includes("max-width"),
    );
    expect(scoped.length).toBeGreaterThan(0);
    expect(unscoped).toEqual([]);
  });

  it("targets the verified DOM hooks, not dead selectors", () => {
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("[data-hero]");
    expect(css).toContain("[data-hero-cta]");
    expect(css).toContain('[role="tab"]');
    expect(css).toContain('[data-part="promise"]');
    expect(css).not.toContain('[data-part="hero-cta"]');
    expect(css).not.toContain('[data-part="hero-dot"]');
    expect(css).not.toContain("[data-promise]");
    expect(css).not.toContain("--theme-on-brand");
  });

  it("ships gradient, mask, reveal bump, and focus fixes", () => {
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("background-clip: text");
    expect(css).toContain("mask-image");
    expect(css).toContain(".fq-reveal");
    expect(css).toContain("button:focus-visible");
    expect(css).not.toContain("@keyframes");
    expect(css).not.toContain("var(--theme-on-brand");
  });

  it("holds the hallmark responsive + honesty disciplines", () => {
    const css = readFileSync(cssPath, "utf8");
    // Page-root horizontal-scroll guard lives on the theme scope.
    expect(css).toContain("overflow-x: clip");
    // Image-bearing grids never use bare 1fr tracks.
    expect(css).toContain("minmax(0, 1fr)");
    // Mobile section heads collapse to one column.
    expect(css).toContain("max-width");
    // No caps-only display classes in new storefront CSS.
    expect(css).not.toContain("text-transform");
    // Roman-only headers: emphasis via weight/color, never italics.
    expect(css).not.toContain("font-style: italic");
    // Blush wash is a named variable, never a literal.
    expect(css).toContain("--theme-blush");
  });
});
