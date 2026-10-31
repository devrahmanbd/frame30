/**
 * Presentation-claims activation — lane (b), Songoskriti.
 *
 * Proves the 13 theme-fixable leak keys resolve through the PRODUCTIVE
 * import graphs (storefront via @/lib/themes/builtin-themes → preview.ts;
 * editor via @/lib/unified-widget-registry → songoskriti.tsx), never by
 * importing the presentation modules directly.
 *
 * classification.md rows: HP-PRODUCT-RAIL, RK-PRODUCT-GRID, RK-RICH-TEXT,
 * RK-NEWSLETTER, RK-FOOTER-SITEMAP, RK-PAYMENT-ICONS, HP-DEPARTMENT-GRID,
 * HP-STORE-LOCATOR, HP-SPLIT-FEATURE, HP-COLLECTION-STORY, HP-UGC-GALLERY,
 * RK-CATEGORY-HEADER, RK-RESULT-TOOLBAR. Spec §4.2(b) (presentation lane)
 * + §4.4 (registration contract).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetComponent } from "@/components/builder/widgets";
import { GENERIC_WIDGETS } from "@/components/builder/widgets";
import { SONGOSKRITI_WIDGETS } from "@/components/builder/songoskriti";
import { resolveThemePresentation } from "@/lib/theme-presentations";
import {
  registerSongoskritiPresentationClaims,
  SONGOSKRITI_PRESENTATION_CLAIMS,
} from "./presentation-claims";
import { SONGOSKRITI_COMMERCE_WIDGETS } from "./commerce-presentations";
import { SongoskritiHeaderPresentation } from "./header-presentation";

// Productive entry modules — import-time registration is the subject under
// test. Storefront chain first so mega_menu is claimed by
// header-presentation (preview.ts:16) before songoskriti.tsx's registrar runs.
import "@/lib/themes/builtin-themes";
import "@/lib/unified-widget-registry";

const CORE_REQUIRED = [
  "finder_row",
  "craft_story",
  "testimonials",
  "trust_footer",
] as const;

function packOf(key: string): WidgetComponent {
  return (SONGOSKRITI_WIDGETS[key as keyof typeof SONGOSKRITI_WIDGETS] ??
    SONGOSKRITI_COMMERCE_WIDGETS[
      key as keyof typeof SONGOSKRITI_COMMERCE_WIDGETS
    ]) as WidgetComponent;
}

function genericOf(key: string): WidgetComponent {
  return GENERIC_WIDGETS[
    key as keyof typeof GENERIC_WIDGETS
  ] as WidgetComponent;
}

describe("songoskriti presentation claims — storefront graph (builtin-themes)", () => {
  it.each(SONGOSKRITI_PRESENTATION_CLAIMS)(
    "%s resolves to the Songoskriti pack component",
    (key) => {
      const resolved = resolveThemePresentation("songoskriti", key);
      expect(resolved).toBeDefined();
      expect(resolved).toBe(packOf(key));
      expect(resolved).not.toBe(genericOf(key));
    },
  );

  it.each(["acme-pack", "no-such-theme"])(
    "foreign theme %s misses all claims and returns the generic fallback",
    (theme) => {
      for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
        const fallback = genericOf(key);
        expect(resolveThemePresentation(theme, key, fallback)).toBe(fallback);
      }
    },
  );

  it("null theme misses all claims and returns the generic fallback", () => {
    for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
      const fallback = genericOf(key);
      expect(resolveThemePresentation(null, key, fallback)).toBe(fallback);
    }
  });

  it("mega_menu resolves to SongoskritiHeaderPresentation through the productive storefront path", () => {
    expect(resolveThemePresentation("songoskriti", "mega_menu")).toBe(
      SongoskritiHeaderPresentation,
    );
  });

  it.each(["acme-pack", "no-such-theme"])(
    "foreign theme %s misses songoskriti's mega_menu",
    (theme) => {
      expect(resolveThemePresentation(theme, "mega_menu", undefined)).not.toBe(
        SongoskritiHeaderPresentation,
      );
    },
  );
});

describe("songoskriti presentation claims — editor graph (unified-widget-registry)", () => {
  it.each(SONGOSKRITI_PRESENTATION_CLAIMS)(
    "%s resolves to the Songoskriti pack component",
    (key) => {
      const resolved = resolveThemePresentation("songoskriti", key);
      expect(resolved).toBeDefined();
      expect(resolved).toBe(packOf(key));
      expect(resolved).not.toBe(genericOf(key));
    },
  );
});

describe("songoskriti presentation claims — completeness", () => {
  it("claims list is exactly 23 keys: the theme-fixable leak keys plus the commerce and account types", () => {
    const generic = GENERIC_WIDGETS as Record<string, unknown>;
    const expected = Object.keys(SONGOSKRITI_WIDGETS).filter(
      (key) =>
        generic[key] !== undefined &&
        !CORE_REQUIRED.includes(key as never) &&
        key !== "mega_menu",
    );
    // The theme's own pack claims thirteen; the commerce and account pack
    // claims ten more — the surfaces the composable parts contract made
    // authorable.
    const commerce = Object.keys(SONGOSKRITI_COMMERCE_WIDGETS);
    expect(SONGOSKRITI_PRESENTATION_CLAIMS).toHaveLength(
      expected.length + commerce.length,
    );
    expect(SONGOSKRITI_PRESENTATION_CLAIMS).toHaveLength(23);
    expect([...SONGOSKRITI_PRESENTATION_CLAIMS].sort()).toEqual(
      [...expected, ...commerce].sort(),
    );
  });
});

describe("songoskriti presentation claims — idempotence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-registering all claims under a console.warn spy produces zero warnings and identical resolution", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSongoskritiPresentationClaims(SONGOSKRITI_WIDGETS);
    expect(warn).not.toHaveBeenCalled();
    const first = [...SONGOSKRITI_PRESENTATION_CLAIMS].map((key) =>
      resolveThemePresentation("songoskriti", key),
    );
    warn.mockClear();
    registerSongoskritiPresentationClaims(SONGOSKRITI_WIDGETS);
    expect(warn).not.toHaveBeenCalled();
    let i = 0;
    for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
      expect(resolveThemePresentation("songoskriti", key)).toBe(first[i++]);
    }
  });
});
