/**
 * BlueOcean widget skins.
 *
 * Pins the theme-owned half of the skins contract: preset defaults ride in
 * factory output, authored props win, unknown skins fall back. The core
 * half (`skin` catalog field, renderer `data-widget`/`data-skin` attrs,
 * conditional sheet loading) is asserted at the core layer; fallback is
 * asserted here (resolveBlueoceanSkin) plus the token-only gate on the
 * theme's own stylesheet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { buildHomepageMain } from "./homepage";
import { blueoceanPreviewSource } from "./preview";
import {
  resolveBlueoceanSkin,
  BLUEOCEAN_SKIN_DEFAULTS,
  BLUEOCEAN_SKIN_SETS,
  BLUEOCEAN_WIDGET_DEFAULTS,
  withBlueoceanDefaults,
} from "./skins";

type Stub = (type: SectionType, props?: Record<string, PropValue>) => Section;

const stub: Stub = (type, props = {}) => ({
  id: `${type}-1`,
  type,
  props: { ...props },
});

describe("BLUEOCEAN_WIDGET_DEFAULTS", () => {
  it("declares the editorial BlueOcean face per skinnable widget", () => {
    expect(BLUEOCEAN_WIDGET_DEFAULTS).toEqual({
      product_rail: { skin: "editorial" },
      hero_carousel: { skin: "fullbleed" },
      testimonials: { skin: "wall" },
      product_grid: { skin: "cards" },
      urgency_rail: { skin: "editorial" },
    });
  });

  it("defaults stay inside each widget's closed vocabulary", () => {
    for (const [type, defaults] of Object.entries(BLUEOCEAN_WIDGET_DEFAULTS)) {
      const allowed = (
        BLUEOCEAN_SKIN_SETS as Record<string, readonly string[]>
      )[type]!;
      expect(allowed, type).toContain(defaults.skin);
      expect(
        BLUEOCEAN_SKIN_DEFAULTS[type as keyof typeof BLUEOCEAN_SKIN_DEFAULTS],
      ).toBe(allowed[0]);
    }
  });

  it("unknown skins fall back instead of crashing", () => {
    expect(resolveBlueoceanSkin("product_rail", "gallery")).toBe("editorial");
    expect(resolveBlueoceanSkin("hero_carousel", "")).toBe("fullbleed");
    expect(resolveBlueoceanSkin("testimonials", undefined)).toBe("wall");
  });

  it("authored skins win over theme defaults", () => {
    const wrapped = withBlueoceanDefaults(stub);
    expect(wrapped("product_rail", { skin: "minimal" }).props["skin"]).toBe(
      "minimal",
    );
    expect(wrapped("product_rail", {}).props["skin"]).toBe("editorial");
  });

  it("homepage skinnable sections resolve to known skins", () => {
    for (const section of buildHomepageMain(stub)) {
      const skin = section.props["skin"];
      if (typeof skin === "string") {
        const allowed = (
          BLUEOCEAN_SKIN_SETS as Record<string, readonly string[]>
        )[section.type];
        expect(allowed, section.type).toContain(skin);
      }
    }
  });

  it("stays token-driven: theme vars only, no hex literals", () => {
    const css = readFileSync(new URL("./skins.css", import.meta.url), "utf8");
    expect(css, "no hex color literals in skins.css").not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
  });

  it("preview source carries the theme tokens", () => {
    expect(blueoceanPreviewSource().tokens.brand).toBe("#0A3642");
  });
});
