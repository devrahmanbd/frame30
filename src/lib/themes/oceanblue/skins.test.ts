/**
 * Oceanblue widget skins.
 *
 * Pins the theme-owned half of the skins contract: preset defaults ride in
 * factory output, authored props win, unknown skins fall back. The core
 * half (`skin` catalog field, renderer `data-widget`/`data-skin` attrs,
 * conditional sheet loading) is asserted at the core layer; fallback is
 * asserted here (resolveOceanblueSkin) plus the token-only gate on the
 * theme's own stylesheet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { buildHomepageMain } from "./homepage";
import { oceanbluePreviewSource } from "./preview";
import {
  resolveOceanblueSkin,
  OCEANBLUE_SKIN_DEFAULTS,
  OCEANBLUE_SKIN_SETS,
  OCEANBLUE_WIDGET_DEFAULTS,
  withOceanblueDefaults,
} from "./skins";

type Stub = (type: SectionType, props?: Record<string, PropValue>) => Section;

const stub: Stub = (type, props = {}) => ({
  id: `${type}-1`,
  type,
  props: { ...props },
});

describe("OCEANBLUE_WIDGET_DEFAULTS", () => {
  it("declares the minimal Oceanblue face per skinnable widget", () => {
    expect(OCEANBLUE_WIDGET_DEFAULTS).toEqual({
      product_rail: { skin: "minimal" },
      hero_carousel: { skin: "split" },
      testimonials: { skin: "single" },
      product_grid: { skin: "cards" },
      urgency_rail: { skin: "minimal" },
    });
  });

  it("defaults stay inside each widget's closed vocabulary", () => {
    for (const [type, defaults] of Object.entries(
      OCEANBLUE_WIDGET_DEFAULTS,
    )) {
      const allowed = (
        OCEANBLUE_SKIN_SETS as Record<string, readonly string[]>
      )[type]!;
      expect(allowed, type).toContain(defaults.skin);
      expect(
        OCEANBLUE_SKIN_DEFAULTS[
          type as keyof typeof OCEANBLUE_SKIN_DEFAULTS
        ],
      ).toBe(defaults.skin);
    }
  });
});

describe("withOceanblueDefaults", () => {
  it("adds the skin default to a bare skinnable section", () => {
    const build = withOceanblueDefaults(stub);
    expect(build("product_rail", { heading: "New" }).props).toMatchObject({
      heading: "New",
      skin: "minimal",
    });
    expect(build("hero_carousel", {}).props.skin).toBe("split");
    expect(build("testimonials", {}).props.skin).toBe("single");
    expect(build("product_grid", {}).props.skin).toBe("cards");
    expect(build("urgency_rail", {}).props.skin).toBe("minimal");
  });

  it("authored skin always wins over the default", () => {
    const build = withOceanblueDefaults(stub);
    expect(
      build("product_rail", { skin: "compact" }).props.skin,
    ).toBe("compact");
  });

  it("leaves non-skinnable types untouched", () => {
    const build = withOceanblueDefaults(stub);
    expect(build("newsletter", { heading: "Hi" }).props).toEqual({
      heading: "Hi",
    });
  });
});

describe("resolveOceanblueSkin", () => {
  it("falls back to the theme default on unknown or empty values", () => {
    expect(resolveOceanblueSkin("product_rail", "nope")).toBe("minimal");
    expect(resolveOceanblueSkin("product_rail", "")).toBe("minimal");
    expect(resolveOceanblueSkin("product_rail", undefined)).toBe("minimal");
    expect(resolveOceanblueSkin("hero_carousel", "fullbleed")).toBe(
      "fullbleed",
    );
  });

  it("passes non-skinnable values through for the core renderer", () => {
    expect(resolveOceanblueSkin("newsletter", "x")).toBe("x");
    expect(resolveOceanblueSkin("newsletter", undefined)).toBe("");
  });
});

describe("homepage factory output", () => {
  it("carries skin defaults on every skinnable section", () => {
    const sections = buildHomepageMain(stub);
    const rails = sections.filter((n) => n.type === "product_rail");
    expect(rails.length).toBe(2);
    for (const rail of rails) {
      expect(rail.props.skin).toBe("minimal");
    }
    const hero = sections.find((n) => n.type === "hero_carousel")!;
    expect(hero.props.skin).toBe("split");
    const voice = sections.find((n) => n.type === "testimonials")!;
    expect(voice.props.skin).toBe("single");
  });
});

describe("preview source", () => {
  it("serves the same skinned homepage as the factory", () => {
    const source = oceanbluePreviewSource();
    let n = 0;
    const s: Stub = (type, props = {}) => ({
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    });
    const viaFactory = buildHomepageMain(s).map((x) => x.type);
    const viaPreview = source.main("index", s)!.map((x) => x.type);
    expect(viaPreview).toEqual(viaFactory);
  });
});

describe("skins.css token gate", () => {
  it("stays token-driven: theme vars only, no hex literals", () => {
    const css = readFileSync(
      "src/lib/themes/oceanblue/skins.css",
      "utf8",
    );
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).toContain("var(--theme-brand)");
    expect(css).toContain("var(--theme-surface)");
    expect(css).toContain("var(--theme-ink)");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("ships the polish layer: motion, pattern, focus", () => {
    const css = readFileSync(
      "src/lib/themes/oceanblue/skins.css",
      "utf8",
    );
    // Scroll-smooth rails, card lift, dot-pattern band, visible focus.
    expect(css).toContain("scroll-behavior");
    expect(css).toContain("translateY(-4px)");
    expect(css).toContain("radial-gradient");
    expect(css).toContain(":focus-visible");
    // Polish never escapes its skins: every rule is scoped under a
    // [data-widget][data-skin] selector.
    const rules = css.split("}");
    const scoped = rules.filter((r) => r.includes("[data-widget="));
    const unscoped = rules.filter(
      (r) =>
        r.trim() &&
        !r.includes("[data-widget=") &&
        !r.includes("@media") &&
        !r.includes("prefers-reduced-motion") &&
        !r.includes("max-width"),
    );
    expect(scoped.length).toBeGreaterThan(0);
    expect(unscoped).toEqual([]);
  });

  it("targets the verified DOM hooks, not dead selectors", () => {
    const css = readFileSync(
      "src/lib/themes/oceanblue/skins.css",
      "utf8",
    );
    // Live hooks (verified against heritage.tsx / widgets.tsx / ProductCard).
    expect(css).toContain("[data-hero]");
    expect(css).toContain("[data-hero-cta]");
    expect(css).toContain('[role="tab"]');
    expect(css).toContain('[data-part="promise"]');
    // Dead strings from earlier drafts — must never come back.
    expect(css).not.toContain('[data-part="hero-cta"]');
    expect(css).not.toContain('[data-part="hero-dot"]');
    expect(css).not.toContain("[data-promise]");
    expect(css).not.toContain("--theme-on-brand");
  });

  it("ships gradient, mask, reveal bump, and focus fixes", () => {
    const css = readFileSync(
      "src/lib/themes/oceanblue/skins.css",
      "utf8",
    );
    expect(css).toContain("background-clip: text");
    expect(css).toContain("mask-image");
    expect(css).toContain(".fq-reveal");
    expect(css).toContain("button:focus-visible");
    // No keyframes — entrance motion stays with GSAP / fq-reveal.
    expect(css).not.toContain("@keyframes");
    // Theme never invents an undefined token.
    expect(css).not.toContain("var(--theme-on-brand");
  });
});
