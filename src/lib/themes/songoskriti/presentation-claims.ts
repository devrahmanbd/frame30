/**
 * Songoskriti presentation claims — lane (b) of the unified port.
 *
 * Claims the 23 theme-fixable keys: the original 13 leak keys
 * (classification.md §2/§3 rows: HP-PRODUCT-RAIL, RK-PRODUCT-GRID,
 * RK-RICH-TEXT, RK-NEWSLETTER, RK-FOOTER-SITEMAP, RK-PAYMENT-ICONS,
 * HP-DEPARTMENT-GRID, HP-STORE-LOCATOR, HP-SPLIT-FEATURE, HP-COLLECTION-STORY,
 * HP-UGC-GALLERY, RK-CATEGORY-HEADER, RK-RESULT-TOOLBAR) plus the ten
 * commerce and account widget types the composable-parts contract made
 * authorable — for `songoskriti × key` in the theme presentation registry (spec §4.2(b) presentation lane + §4.4
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
import { SONGOSKRITI_COMMERCE_WIDGETS } from "./commerce-presentations";

/**
 * The 23 theme-fixable leak keys claimed by Songoskriti.
 *
 * The first thirteen are the theme's original claims (classification.md §2/§3
 * rows: HP-PRODUCT-RAIL, RK-PRODUCT-GRID, RK-RICH-TEXT, RK-NEWSLETTER,
 * RK-FOOTER-SITEMAP, RK-PAYMENT-ICONS, HP-DEPARTMENT-GRID,
 * HP-STORE-LOCATOR, HP-SPLIT-FEATURE, RK-COLLECTION-STORY, RK-UGC-GALLERY,
 * RK-CATEGORY-HEADER, RK-RESULT-TOOLBAR). The last ten are the commerce and
 * account types — the surfaces the prior programme left in the platform's own
 * type language (its §6.5 open item) and that the composable parts contract
 * made authorable: the cart's lines and totals, the checkout's rail and
 * trail, the account's order list, the profile card and the account's four
 * placeable panels.
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
  "cart_lines",
  "cart_summary",
  "payment_methods",
  "checkout_steps",
  "orders_list",
  "profile_card",
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
] as const satisfies readonly SectionType[];

/**
 * Register every unclaimed Songoskriti presentation claim. First-wins guard
 * skips any pair already claimed, making the registrar idempotent and safe
 * to call from every carrier.
 *
 * The theme's commerce and account pack (`SONGOSKRITI_COMMERCE_WIDGETS`)
 * joins the theme's own pack: a claim is registered from whichever pack
 * carries the renderer, and a claim NEITHER pack carries is simply not
 * registered (the generic renderer stays).
 */
export function registerSongoskritiPresentationClaims(
  pack: Partial<Record<SectionType, WidgetComponent>>,
): void {
  for (const key of SONGOSKRITI_PRESENTATION_CLAIMS) {
    if (resolveThemePresentation("songoskriti", key) !== undefined) continue;
    const Component = pack[key] ?? SONGOSKRITI_COMMERCE_WIDGETS[key];
    if (typeof Component !== "function") continue;
    registerThemePresentation("songoskriti", key, Component);
  }
}
