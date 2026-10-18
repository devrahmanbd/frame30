/**
 * Songoskriti presentation claims — lane (b) of the unified port.
 *
 * Claims the 13 theme-fixable leak keys (classification.md §2/§3 rows:
 * HP-PRODUCT-RAIL, RK-PRODUCT-GRID, RK-RICH-TEXT, RK-NEWSLETTER,
 * RK-FOOTER-SITEMAP, RK-PAYMENT-ICONS, HP-DEPARTMENT-GRID,
 * HP-STORE-LOCATOR, HP-SPLIT-FEATURE, HP-COLLECTION-STORY, HP-UGC-GALLERY,
 * RK-CATEGORY-HEADER, RK-RESULT-TOOLBAR) for `songoskriti × key` in the
 * theme presentation registry (spec §4.2(b) presentation lane + §4.4
 * registration contract).
 *
 * Excluded: `mega_menu` is already live through `header-presentation.tsx:776`
 * (registration rides `preview.ts:16` in the storefront graph). The 4
 * core-required keys (finder_row, craft_story, testimonials, trust_footer)
 * have no generic fallback and are escalated, not claimed.
 *
 * The registrar is idempotent: it skips any pair already claimed
 * (`resolveThemePresentation("songoskriti", key) !== undefined`), so it is
 * safe to call from every carrier (preview.ts, songoskriti.tsx) without
 * duplicate warnings, evictions, or throws.
 */

import type { SectionType } from "@/lib/builder-ast";
import type { WidgetComponent } from "@/components/builder/widgets";
import {
  registerThemePresentation,
  resolveThemePresentation,
} from "@/lib/theme-presentations";

/**
 * The 13 theme-fixable (b) leak keys claimed by Songoskriti.
 *
 * Excluded: mega_menu (already live), finder_row / craft_story /
 * testimonials / trust_footer (core-required, no generic fallback).
 */
export const SONGOSKRITI_PRESENTATION_CLAIMS = [
  "product_rail",
  "product_grid",
  "rich_text",
  "newsletter",
  "footer_sitemap",
  "payment_icons",
  "department_grid",
  "store_locator",
  "split_feature",
  "collection_story",
  "ugc_gallery",
  "category_header",
  "result_toolbar",
] as const satisfies readonly SectionType[];

/**
 * Register every unclaimed Songoskriti presentation claim. First-wins guard
 * skips any pair already claimed, making the registrar idempotent and safe
 * to call from every carrier.
 */
export function registerSongoskritiPresentationClaims(
  pack: Partial<Record<SectionType, WidgetComponent>>,
): void {
  for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
    if (resolveThemePresentation("songoskriti", key) !== undefined) continue;
    const Component = pack[key];
    if (typeof Component !== "function") continue;
    registerThemePresentation("songoskriti", key, Component);
  }
}
