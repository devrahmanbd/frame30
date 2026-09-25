import type { PreviewThemeSource } from "../../theme-preview-nav";
import type { Section, SectionBuilder } from "../../builder-ast";
import { SOMVABONA_TOKENS } from "./tokens";
import { buildHeaderMain, buildFooterMain } from "./chrome";
import { buildHomepageMain } from "./homepage";

/**
 * Somvabona's preview source — theme-owned demo content for the
 * theme-agnostic preview engine.
 *
 * Wired through the preview-sources registry; the engine never imports
 * this module directly. Everything here is plain section data built with
 * the theme's own builders: no preview components, no preview behavior,
 * no platform imports (the engine port type is type-only and erased).
 *
 * The loose SomvabonaBuilder adapts to the shared SectionBuilder the same
 * way the theme's own tests do (`as never` — see types.ts).
 */
export function somvabonaPreviewSource(): PreviewThemeSource {
  const adapt =
    (build: (s: never) => Section[]) => (s: SectionBuilder) =>
      build(s as never);
  return {
    key: "somvabona",
    themeName: "Somvabona",
    author: "Framique",
    tokens: SOMVABONA_TOKENS,
    header: adapt(buildHeaderMain),
    footer: adapt(buildFooterMain),
    main: (template, s) => {
      switch (template) {
        case "index":
          return buildHomepageMain(s as never);
        case "collection":
          return [
            s("heading", { text: "New in", text_bn: "নতুন এসেছে" }),
            s("product_rail", {
              heading: "New arrivals",
              heading_bn: "নতুন এসেছে",
              limit: 8,
              source: "collection",
              collection: "new-in",
              cardVariant: "editorial",
              showRating: true,
              promise: "In stock · Dispatched in 24h",
              promise_bn: "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
            }),
          ];
        case "product":
          return [
            s("heading", {
              text: "Everyday Cotton Panjabi",
              text_bn: "প্রতিদিনের সুতি পাঞ্জাবি",
            }),
            s("product_media", {
              image1: "/ph/somvabona/festive-edit.jpg",
              image2: "/ph/somvabona/newin-edit.jpg",
              image3: "/ph/somvabona/gift-craft.jpg",
              ratio: "4/5",
            }),
            s("rich_text", {
              heading: "Details",
              heading_bn: "বিবরণ",
              body: "Demo product page. Prices and stock are sample data — ordering is disabled in preview.",
              body_bn:
                "ডেমো পণ্যের পাতা। দাম ও স্টক নমুনা তথ্য — প্রিভিউতে অর্ডার বন্ধ আছে।",
            }),
          ];
        default:
          // Page, blog, search, cart, checkout, account: the engine
          // synthesizes a generic demo body.
          return null;
      }
    },
  };
}
