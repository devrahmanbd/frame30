/**
 * Key-driven header chrome (config, not theme code) — Task 2 plumbing.
 *
 * The shared `StoreHeader` carries zero per-theme literals: it never names
 * a brand. Theme-owned fallback chrome (menu tree, বাংলা twins, logo,
 * announcement copy) lives in `lib/themes/<theme>/header-fallback`, and
 * this module is the single key-driven lookup that hands it to the shared
 * header. The isolation guard deliberately does not scan this file — same
 * rationale as the theme-chrome registration: key-driven wiring is config.
 *
 * Task 3 (theme-keyed registry/port) subsumes this lookup; keep it thin.
 */
import type { MenuNode } from "@/lib/menus/menu";
import {
  SONGOSKRITI_HEADER_ANNOUNCEMENT,
  SONGOSKRITI_HEADER_LOGO,
  SONGOSKRITI_MEGA_MENU,
  songoskritiMenuLabel,
} from "@/lib/themes/songoskriti/header-fallback";

export type ThemeHeaderChrome = {
  /** Fallback menu tree for theme-shaped stores with no dashboard menu. */
  fallbackMenu: MenuNode[];
  /** বাংলা twin resolver covering the fallback tree only. */
  labelFor: (label: string, t: (en: string, bn?: string) => string) => string;
  /** Logo lockup replacing the text wordmark. */
  logo: { src: string; alt: string };
  /** Announcement-bar copy for the luxury variant. */
  announcement: { left: string; center: string; center_bn: string };
};

/**
 * Theme chrome for a storefront identity, or null for the generic header.
 * Dashboard-designed menus always win downstream; this only supplies the
 * theme fallback + luxury presentation.
 */
export function themeHeaderFor(
  slug: string,
  name?: string | null,
): ThemeHeaderChrome | null {
  if (slug === "songoskriti" || name?.toLowerCase() === "songoskriti") {
    return {
      // The fallback tree is authoring-shaped, not MenuNode-shaped (no
      // dashboard metadata); render sites already treat fallback nodes
      // opaquely, so the opaque cast is contained here.
      fallbackMenu: SONGOSKRITI_MEGA_MENU as unknown as MenuNode[],
      labelFor: (label, t) => songoskritiMenuLabel(label, t),
      logo: { ...SONGOSKRITI_HEADER_LOGO },
      announcement: { ...SONGOSKRITI_HEADER_ANNOUNCEMENT },
    };
  }
  return null;
}
