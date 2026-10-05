export { SOMVABONA_TOKENS } from "./tokens";
export { buildHeaderMain, buildFooterMain } from "./chrome";
export { buildHomepageMain } from "./homepage";
// Live-rendering activation (HEADER DE-THEMING lane): re-exporting the
// theme's header presentation pulls the module into the prod import graph,
// running its `registerThemePresentation` side effect so SectionRenderer
// resolves the themed mega_menu instead of the generic fallback.
export { SomvabonaHeaderPresentation } from "./header-presentation";
export { HOMEPAGE_SECTION_TYPES } from "./types";
export type { SomvabonaBuilder, SomvabonaHomepageType } from "./types";
