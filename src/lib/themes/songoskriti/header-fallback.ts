/**
 * Songoskriti header fallback chrome — consolidated single source
 * (HEADER DE-THEMING lane).
 *
 * The fallback mega-menu tree, its বাংলা twin table, the logo lockup, and
 * the announcement-bar copy used to live here verbatim as theme-owned data.
 * They now live verbatim in the neutral `lib/header-copy` module (the
 * `footer-copy.ts` precedent) so shared chrome stays free of shared→theme
 * edges; this module remains as a compatibility re-export under the
 * historical `SONGOSKRITI_*` names so existing importers keep working.
 * New code must import from `@/lib/header-copy` directly.
 *
 * Data only: no React, no network.
 */
export {
  HEADER_FALLBACK_MENU as SONGOSKRITI_MEGA_MENU,
  HEADER_MENU_BN as SONGOSKRITI_MENU_BN,
  headerMenuLabel as songoskritiMenuLabel,
  HEADER_LOGO as SONGOSKRITI_HEADER_LOGO,
  HEADER_ANNOUNCEMENT as SONGOSKRITI_HEADER_ANNOUNCEMENT,
} from "@/lib/header-copy";
