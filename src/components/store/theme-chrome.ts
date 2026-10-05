/**
 * Key-driven theme header chrome (theme-remediation Task 3 — subsumes the
 * interim slug-sniffing `theme-header.ts`, now deleted).
 *
 * The shared `StoreHeader` carries zero per-theme literals: it never names
 * a brand. Fallback chrome (menu tree, বাংলা twins, logo, announcement
 * copy) lives in the neutral `lib/header-copy` module — the
 * `footer-copy.ts` precedent — and this module is the single key-driven
 * lookup that hands it to the shared header. This file imports no theme
 * module and names no theme: the key binding arrives as data
 * (`DEFAULT_HEADER_CHROME_KEY`), so the record below is config, not theme
 * code. Per-theme header *presentations* (canonical dropdown / drawer
 * modes) are theme-owned `header-presentation` modules claiming their
 * `mega_menu` pair through `registerThemePresentation`.
 *
 * Resolution is by explicit merchant theme key — never by store slug or
 * display name. A renamed slug, a lookalike name, or a foreign theme
 * installed on a theme-named slug all resolve to null (generic header),
 * which is exactly the theme-independence contract.
 */
import type { MenuNode } from "@/lib/menus/menu";
import {
  DEFAULT_HEADER_CHROME_KEY,
  HEADER_ANNOUNCEMENT,
  HEADER_FALLBACK_MENU,
  HEADER_LOGO,
  headerMenuLabel,
} from "@/lib/header-copy";

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

const CHROME: Record<string, () => ThemeHeaderChrome> = {
  [DEFAULT_HEADER_CHROME_KEY]: () => ({
    // The fallback tree is authoring-shaped, not MenuNode-shaped (no
    // dashboard metadata); render sites already treat fallback nodes
    // opaquely, so the opaque cast is contained here.
    fallbackMenu: HEADER_FALLBACK_MENU as unknown as MenuNode[],
    labelFor: (label, t) => headerMenuLabel(label, t),
    logo: { ...HEADER_LOGO },
    announcement: { ...HEADER_ANNOUNCEMENT },
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
