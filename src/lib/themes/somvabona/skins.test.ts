/**
 * Somvabona widget skin defaults (lane C).
 *
 * - Factory/homepage output carries the theme defaults.
 * - Authored props win over defaults (merge-under, never overwrite).
 * - Unknown skin values fall back to the widget default (spec §1).
 * - The theme skin sheet stays token-driven and keyed on
 *   `[data-widget][data-skin]`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PropValue, Section } from "../../builder-ast";
import { buildHomepageMain } from "./homepage";
import { buildFooterMain, buildHeaderMain } from "./chrome";
import { somvabonaPreviewSource } from "./preview";
import {
  SOMVABONA_WIDGET_DEFAULTS,
  applySomvabonaWidgetDefaults,
  resolveSomvabonaSkin,
  withSomvabonaWidgetDefaults,
} from "./skins";

function stub() {
  return (type: string, props: Record<string, PropValue> = {}): Section =>
    ({ id: type, type, props }) as unknown as Section;
}

function homepage() {
  return buildHomepageMain(stub() as never) as unknown as {
    type: string;
    props: Record<string, PropValue>;
  }[];
}

describe("SOMVABONA_WIDGET_DEFAULTS", () => {
  it("declares the value-forward retail skins", () => {
    expect(SOMVABONA_WIDGET_DEFAULTS.hero_carousel).toMatchObject({
      skin: "fullbleed",
    });
    expect(SOMVABONA_WIDGET_DEFAULTS.product_rail).toMatchObject({
      skin: "compact",
      showRating: true,
    });
    expect(SOMVABONA_WIDGET_DEFAULTS.urgency_rail).toMatchObject({
      skin: "compact",
      showRating: true,
      showDiscount: true,
      showStockHint: true,
    });
    expect(SOMVABONA_WIDGET_DEFAULTS.testimonials).toMatchObject({
      skin: "carousel",
    });
    expect(SOMVABONA_WIDGET_DEFAULTS.product_grid).toMatchObject({
      skin: "rows",
    });
  });

  it("differs from the songoskriti editorial defaults", () => {
    // Songoskriti (spec §4 example): editorial product rails, split hero.
    expect(SOMVABONA_WIDGET_DEFAULTS.product_rail!.skin).not.toBe("editorial");
    expect(SOMVABONA_WIDGET_DEFAULTS.hero_carousel!.skin).not.toBe("split");
  });
});

describe("builder application", () => {
  it("homepage sections carry their skin defaults", () => {
    const sections = homepage();
    const hero = sections.find((n) => n.type === "hero_carousel")!;
    expect(hero.props.skin).toBe("fullbleed");
    for (const rail of sections.filter((n) => n.type === "urgency_rail")) {
      expect(rail.props.skin).toBe("compact");
      expect(rail.props.showRating).toBe(true);
      expect(rail.props.showDiscount).toBe(true);
      expect(rail.props.showStockHint).toBe(true);
    }
    const wall = sections.find((n) => n.type === "testimonials")!;
    expect(wall.props.skin).toBe("carousel");
  });

  it("preview collection rail carries the compact default", () => {
    const source = somvabonaPreviewSource();
    let n = 0;
    const s = (type: any, props: any = {}) => ({
      id: `${String(type)}-${n++}`,
      type,
      props: { ...props },
    });
    const collection = source.main("collection", s)! as unknown as {
      type: string;
      props: Record<string, PropValue>;
    }[];
    const rail = collection.find((x) => x.type === "product_rail")!;
    expect(rail.props.skin).toBe("compact");
  });

  it("authored props win over defaults", () => {
    const s = withSomvabonaWidgetDefaults(stub());
    const rail = s("urgency_rail", {
      heading: "New arrivals",
      skin: "minimal",
      showRating: false,
    });
    expect(rail.props.skin).toBe("minimal");
    expect(rail.props.showRating).toBe(false);
    // Untouched defaults still fill in underneath.
    expect(rail.props.showDiscount).toBe(true);
    expect(rail.props.heading).toBe("New arrivals");
  });

  it("unknown widget types pass through untouched", () => {
    expect(
      applySomvabonaWidgetDefaults("mega_menu", { label: "Shop" }),
    ).toEqual({
      label: "Shop",
    });
  });

  it("chrome builders still build (defaults are passthrough there)", () => {
    const s = stub();
    expect(buildHeaderMain(s as never).map((n) => n.type)).toEqual([
      "mega_menu",
    ]);
    expect(buildFooterMain(s as never).length).toBeGreaterThan(0);
  });
});

describe("resolveSomvabonaSkin (unknown → default)", () => {
  it("passes known skins through", () => {
    expect(resolveSomvabonaSkin("product_rail", "minimal")).toBe("minimal");
    expect(resolveSomvabonaSkin("hero_carousel", "split")).toBe("split");
    expect(resolveSomvabonaSkin("testimonials", "wall")).toBe("wall");
    expect(resolveSomvabonaSkin("product_grid", "cards")).toBe("cards");
  });

  it("falls back on unknown, blank, or missing values", () => {
    expect(resolveSomvabonaSkin("product_rail", "nope")).toBe("compact");
    expect(resolveSomvabonaSkin("hero_carousel", "")).toBe("fullbleed");
    expect(resolveSomvabonaSkin("testimonials", undefined)).toBe("carousel");
    expect(resolveSomvabonaSkin("product_grid", 42)).toBe("rows");
    expect(resolveSomvabonaSkin("urgency_rail", "nope")).toBe("compact");
  });

  it("returns undefined for widgets with no skin contract", () => {
    expect(resolveSomvabonaSkin("mega_menu", "compact")).toBeUndefined();
  });
});

describe("skins.css", () => {
  const css = readFileSync(new URL("./skins.css", import.meta.url), "utf8");

  it("keys every rule off [data-widget][data-skin]", () => {
    for (const [widget, skin] of [
      ["product_rail", "compact"],
      ["urgency_rail", "compact"],
      ["hero_carousel", "fullbleed"],
      ["testimonials", "carousel"],
      ["product_grid", "rows"],
    ]) {
      expect(
        css.includes(`[data-widget="${widget}"][data-skin="${skin}"]`),
        `${widget}[${skin}] rule`,
      ).toBe(true);
    }
  });

  it("is token-driven: no hex literals or raw colour utilities", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).toMatch(/var\(--theme-brand\)/);
    expect(css).toMatch(/var\(--theme-surface\)/);
    expect(css).toMatch(/var\(--theme-ink\)/);
    expect(css).toMatch(/var\(--theme-accent\)/);
  });

  it("collapses motion under prefers-reduced-motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
