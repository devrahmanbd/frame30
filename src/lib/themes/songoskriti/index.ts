export { SONGOSKRITI_TOKENS } from "./tokens";
export { buildHeaderMain } from "./header";
export { buildFooterMain } from "./footer";
export { buildHomepageMain } from "./homepage";
// Live-rendering activation (HEADER DE-THEMING lane): re-exporting the
// theme's header presentation pulls the module into the prod import graph,
// running its `registerThemePresentation` side effect so SectionRenderer
// resolves the themed mega_menu instead of the generic fallback.
export { SongoskritiHeaderPresentation } from "./header-presentation";
// Native theme-owned activation: re-exporting the ornament module pulls it
// into the prod import graph, running its WidgetDef + component side-effect
// registrations so the owning theme executes `theme:songoskriti/ornament`
// natively (foreign themes keep the recoverable placeholder).
export {
  SONGOSKRITI_ORNAMENT_ID,
  SongoskritiOrnamentDef,
} from "./ornament-def";
export { SongoskritiOrnamentPresentation } from "./ornament-presentation";
export { HOMEPAGE_SECTION_TYPES } from "./types";
export type { IntendedHomepageType, SectionBuilder } from "./types";
