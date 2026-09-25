import type { SectionBuilder } from "./types";
import type { PreviewThemeSource } from "../../theme-preview-nav";
import { SONGOSKRITI_TOKENS } from "./tokens";
import { buildHeaderMain } from "./header";
import { buildFooterMain } from "./footer";
import { buildHomepageMain } from "./homepage";

/**
 * Songoskriti's preview source — theme-owned demo content for the
 * theme-agnostic preview engine.
 *
 * Wired through the preview-sources registry; the engine never imports
 * this module directly. Everything here is plain section data built with
 * the theme's own builders: no preview components, no preview behavior,
 * no platform imports (the engine port type is type-only and erased).
 */

const rail = (
  s: SectionBuilder,
  heading: string,
  heading_bn: string,
  collection: string,
  promise: string,
  promise_bn: string,
  limit = 8,
) =>
  s("product_rail", {
    heading,
    heading_bn,
    limit,
    source: "collection",
    collection,
    cardVariant: "editorial",
    showRating: true,
    promise,
    promise_bn,
  });

export function songoskritiPreviewSource(): PreviewThemeSource {
  return {
    key: "songoskriti",
    themeName: "Songoskriti",
    author: "Framique",
    tokens: SONGOSKRITI_TOKENS,
    header: (s) => buildHeaderMain(s),
    footer: (s) => buildFooterMain(s),
    main: (template, s) => {
      switch (template) {
        case "index":
          return buildHomepageMain(s);
        case "collection":
          return [
            s("heading", { text: "New in", text_bn: "নতুন এসেছে" }),
            rail(
              s,
              "New arrivals",
              "নতুন এসেছে",
              "new-in",
              "In stock · Dispatched in 24h",
              "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
            ),
            rail(
              s,
              "More to explore",
              "আরও দেখুন",
              "festive",
              "Loved across 64 districts",
              "সারা দেশে জনপ্রিয়",
            ),
          ];
        case "product":
          return [
            s("heading", {
              text: "Dhakai Jamdani Heritage Saree",
              text_bn: "ঢাকাই জামদানি হেরিটেজ শাড়ি",
            }),
            s("product_media", {
              image1: "/ph/songoskriti/prod-saree.png",
              image2: "/ph/songoskriti/prod-panjabi.png",
              image3: "/ph/songoskriti/prod-necklace.png",
              image4: "/ph/songoskriti/cat-women.png",
              ratio: "4/5",
            }),
            s("rich_text", {
              heading: "Details",
              heading_bn: "বিবরণ",
              body: "Demo product page. Prices and stock are sample data — ordering is disabled in preview.",
              body_bn:
                "ডেমো পণ্যের পাতা। দাম ও স্টক নমুনা তথ্য — প্রিভিউতে অর্ডার বন্ধ আছে।",
            }),
            rail(
              s,
              "Complete the look",
              "লুক সম্পূর্ণ করুন",
              "festive",
              "Loved across 64 districts",
              "সারা দেশে জনপ্রিয়",
              4,
            ),
          ];
        case "page":
          return [
            s("heading", { text: "Size guide", text_bn: "সাইজ গাইড" }),
            s("rich_text", {
              heading: "How to measure",
              heading_bn: "কীভাবে মাপবেন",
              body: "Demo article. Chest, waist and length guidance for panjabis, kurtas and saree blouses.",
              body_bn:
                "ডেমো নিবন্ধ। পাঞ্জাবি, কুর্তা ও শাড়ির ব্লাউজের জন্য মাপের নির্দেশনা।",
            }),
          ];
        case "blog":
          return [
            s("heading", { text: "Journal", text_bn: "জার্নাল" }),
            s("image", {
              src: "/ph/songoskriti/hero-artisans.png",
              alt: "Artisans weaving on a wooden loom",
              ratio: "16/9",
              caption: "Artisan owned",
            }),
            s("rich_text", {
              heading: "Meet the makers",
              heading_bn: "কারিগরদের চিনুন",
              body: "Demo story. Kantha embroidery stitched by rural artisans — full articles ship with the theme.",
              body_bn:
                "ডেমো গল্প। গ্রামের কারিগরদের হাতে সেলাই করা কাঁথা — পূর্ণ নিবন্ধ থিমের সাথেই আসে।",
            }),
          ];
        case "search":
          return [
            s("heading", { text: "Search results", text_bn: "খোঁজার ফলাফল" }),
            s("rich_text", {
              heading: "Demo search",
              heading_bn: "ডেমো খোঁজ",
              body: "Live search runs on the storefront. Below is what a results rail looks like.",
              body_bn:
                "লাইভ খোঁজ দোকানে চলে। নিচে ফলাফলের একটি নমুনা দেখুন।",
            }),
            rail(
              s,
              "Popular right now",
              "এখন জনপ্রিয়",
              "festive",
              "Loved across 64 districts",
              "সারা দেশে জনপ্রিয়",
            ),
          ];
        case "cart":
          return [
            s("heading", { text: "Your bag", text_bn: "আপনার ব্যাগ" }),
            s("rich_text", {
              heading: "Demo bag",
              heading_bn: "ডেমো ব্যাগ",
              body: "2 items · sample totals. Checkout is disabled in preview — your bag is safe.",
              body_bn:
                "২টি পণ্য · নমুনা মোট। প্রিভিউতে চেকআউট বন্ধ আছে — আপনার ব্যাগ নিরাপদ।",
            }),
            rail(
              s,
              "You may also like",
              "আপনার পছন্দ হতে পারে",
              "new-in",
              "In stock · Dispatched in 24h",
              "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
              4,
            ),
          ];
        case "checkout":
          return [
            s("heading", { text: "Checkout", text_bn: "চেকআউট" }),
            s("rich_text", {
              heading: "Demo checkout",
              heading_bn: "ডেমো চেকআউট",
              body: "Address, delivery and payment steps render here on the storefront. Placing orders is disabled in preview.",
              body_bn:
                "দোকানে এখানে ঠিকানা, ডেলিভারি ও পেমেন্টের ধাপ দেখা যায়। প্রিভিউতে অর্ডার করা বন্ধ আছে।",
            }),
            s("payment_icons", {
              heading: "We accept",
              marks:
                "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
            }),
          ];
        case "account":
          return [
            s("heading", { text: "Account", text_bn: "অ্যাকাউন্ট" }),
            s("profile_card", {}),
            s("orders_list", {}),
          ];
      }
    },
  };
}
