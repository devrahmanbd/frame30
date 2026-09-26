import type { SectionBuilder } from "../../src/lib/builder-ast";
import type { PreviewThemeSource } from "../../src/lib/theme-preview-nav";
import { withStarterDefaults } from "./skins";
import { STARTER_TOKENS } from "./tokens";
import {
  buildStarterFooterMain,
  buildStarterHeaderMain,
  buildStarterHomepageMain,
} from "./homepage";

/**
 * Starter preview source — the theme-owned half of the preview contract.
 *
 * The preview engine is theme-agnostic: it never imports a theme module
 * directly. The theme implements the `PreviewThemeSource` port
 * (`src/lib/theme-preview-nav.ts:283`) and the registry wires it in
 * (`src/lib/preview-sources.ts:14`). Return `null` (not an empty array)
 * for templates the theme does not author — the engine synthesizes a
 * generic demo body instead (`assemblePreviewTemplates`,
 * `src/lib/theme-preview-nav.ts:345`).
 *
 * Register a real theme by adding one entry to that map; this starter is
 * not registered, so it never affects the shipped preview.
 */
export function starterPreviewSource(): PreviewThemeSource {
  return {
    key: "starter-theme",
    themeName: "Starter Theme",
    author: "Example Author",
    tokens: STARTER_TOKENS,
    header: (s: SectionBuilder) => buildStarterHeaderMain(s),
    footer: (s: SectionBuilder) => buildStarterFooterMain(s),
    main: (template, s) => {
      const t = withStarterDefaults(s);
      switch (template) {
        case "index":
          return buildStarterHomepageMain(s);
        case "collection":
          return [
            t("heading", { text: "New in", text_bn: "নতুন এসেছে" }),
            t("product_rail", {
              heading: "New arrivals",
              heading_bn: "নতুন এসেছে",
              source: "bestsellers",
              cardVariant: "compact",
              showRating: true,
              promise: "In stock · Dispatched in 24h",
              promise_bn: "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
            }),
          ];
        case "product":
          return [
            t("rich_text", {
              heading: "Details",
              heading_bn: "বিবরণ",
              body: "Demo product page. Prices and stock are sample data — ordering is disabled in preview.",
              body_bn:
                "ডেমো পণ্যের পাতা। দাম ও স্টক নমুনা তথ্য — প্রিভিউতে অর্ডার বন্ধ আছে।",
            }),
            t("product_rail", {
              heading: "Complete the look",
              heading_bn: "লুক সম্পূর্ণ করুন",
              source: "bestsellers",
              cardVariant: "compact",
              showRating: false,
              promise: "",
              promise_bn: "",
            }),
          ];
        default:
          return null;
      }
    },
  };
}
