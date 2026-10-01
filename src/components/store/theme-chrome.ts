/**
 * Key-driven theme header chrome (theme-remediation Task 3 — subsumes the
 * interim slug-sniffing `theme-header.ts`, now deleted).
 *
 * The shared `StoreHeader` carries zero per-theme literals: it never names
 * a brand. Theme-owned fallback chrome (menu tree, বাংলা twins, logo,
 * announcement copy) lives in `lib/themes/<theme>/header-fallback`, and
 * this module is the single key-driven lookup that hands it to the shared
 * header. The isolation guard deliberately does not scan this file — same
 * rationale as the widget registry: key-driven wiring is config, not
 * theme code.
 *
 * Resolution is by explicit merchant theme key (listing slug, e.g.
 * "songoskriti") — never by store slug or display name. A renamed slug,
 * a lookalike name, or a foreign theme installed on a theme-named slug
 * all resolve to null (generic header), which is exactly the
 * theme-independence contract.
 */
import type { MenuNode } from "@/lib/menus/menu";
import {
  SONGOSKRITI_HEADER_ANNOUNCEMENT,
  SONGOSKRITI_HEADER_LOGO,
  SONGOSKRITI_MEGA_MENU,
  songoskritiMenuLabel,
} from "@/lib/themes/songoskriti/header-fallback";
import {
  OCEANBLUE_HEADER_ANNOUNCEMENT,
  OCEANBLUE_HEADER_LOGO,
  OCEANBLUE_MEGA_MENU,
  oceanblueMenuLabel,
} from "@/lib/themes/oceanblue/header-fallback";
import {
  OCEANBLUE_V2_HEADER_ANNOUNCEMENT,
  OCEANBLUE_V2_HEADER_LOGO,
  OCEANBLUE_V2_MEGA_MENU,
  oceanblueV2MenuLabel,
} from "@/lib/themes/oceanblue-v2/header-fallback";

export type ThemeHeaderChrome = {
  /** Fallback menu tree for theme-shaped stores with no dashboard menu. */
  fallbackMenu: MenuNode[];
  /** বাংলা twin resolver covering the fallback tree only. */
  labelFor: (label: string, t: (en: string, bn?: string) => string) => string;
  /** Logo lockup replacing the text wordmark. */
  logo: { src: string; alt: string };
  /** Announcement-bar copy for the luxury variant. */
  announcement: {
    left: string;
    center: string;
    center_bn: string;
    /**
     * Presentation variant, theme-authored: "split" (the default 3-column
     * strip) or "none" (no band above the masthead at all — the masthead
     * is the top of the page). Absent means "split" — songoskriti and
     * generic chrome keep the existing strip untouched.
     */
    variant?: "split" | "none";
  };
};

const CHROME: Record<string, () => ThemeHeaderChrome> = {
  songoskriti: () => ({
    // The fallback tree is authoring-shaped, not MenuNode-shaped (no
    // dashboard metadata); render sites already treat fallback nodes
    // opaquely, so the opaque cast is contained here.
    fallbackMenu: SONGOSKRITI_MEGA_MENU as unknown as MenuNode[],
    labelFor: (label, t) => songoskritiMenuLabel(label, t),
    logo: { ...SONGOSKRITI_HEADER_LOGO },
    announcement: { ...SONGOSKRITI_HEADER_ANNOUNCEMENT },
  }),
  oceanblue: () => ({
    // Same opaque-cast containment as above: the fallback tree is
    // authoring-shaped, render sites treat fallback nodes opaquely.
    fallbackMenu: OCEANBLUE_MEGA_MENU as unknown as MenuNode[],
    labelFor: (label, t) => oceanblueMenuLabel(label, t),
    logo: { ...OCEANBLUE_HEADER_LOGO },
    announcement: { ...OCEANBLUE_HEADER_ANNOUNCEMENT },
  }),
  "oceanblue-v2": () => ({
    // Same opaque-cast containment as above: the fallback tree is
    // authoring-shaped, render sites treat fallback nodes opaquely.
    fallbackMenu: OCEANBLUE_V2_MEGA_MENU as unknown as MenuNode[],
    labelFor: (label, t) => oceanblueV2MenuLabel(label, t),
    logo: { ...OCEANBLUE_V2_HEADER_LOGO },
    announcement: { ...OCEANBLUE_V2_HEADER_ANNOUNCEMENT },
  }),
};

/** Registered header-chrome keys, for routes and diagnostics. */
export function themeChromeKeys(): string[] {
  return Object.keys(CHROME);
}

/**
 * Theme chrome for an explicit merchant theme key, or null for the generic
 * header. Dashboard-designed menus always win downstream; this only
 * supplies the theme fallback + luxury presentation.
 */
export function themeChromeFor(
  themeKey: string | null | undefined,
): ThemeHeaderChrome | null {
  if (themeKey == null) return null;
  return CHROME[themeKey]?.() ?? null;
}
