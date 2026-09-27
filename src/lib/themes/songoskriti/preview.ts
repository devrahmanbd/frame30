import type { SectionBuilder } from "./types";
import type { PreviewThemeSource } from "../../theme-preview-nav";
import { withSongoskritiDefaults } from "./skins";
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
      // Non-homepage templates author sections directly (not through the
      // homepage builder), so they get the same skin-default wrap here.
      s = withSongoskritiDefaults(s);
      switch (template) {
        case "index":
          return buildHomepageMain(s);
        case "collection": {
          // The applyDemoFocus system rewrites the `category_header`'s title
          // and the product_rail's collection when a focus slug is clicked.
          // We author a generic "New Arrivals" default; the engine overrides
          // the heading text and rail collection automatically via focus.
          //
          // Subnav per collection type — the focus slug drives which subnav
          // is shown. Since the preview template is static and focus is
          // applied at render time, we author the richest subnav (bridal) as
          // default. The category_header gracefully shows nothing if subnav
          // is empty string.
          //
          // Collection types:
          //   curated   — new-in, bestsellers: no subnav, product-forward
          //   department — women, men, kids: rich subnav
          //   occasion  — bridal, festive, wedding: editorial intro + subnav
          return [
            s("category_header", {
              text: "New Arrivals",
              text_bn: "নতুন এসেছে",
              description:
                "Fresh off the loom. The latest handloom pieces from Songoskriti's artisan partners.",
              description_bn:
                "তাঁত থেকে সবে নামানো। সংস্কৃতির কারিগর অংশীদারদের সর্বশেষ হ্যান্ডলুম পিস।",
              collectionType: "curated",
              // Subnav items: "Label:/c/slug" comma-separated
              // These match the MEGA_MENU_DEFS taxonomy exactly.
              subnav: [
                "All New Arrivals:/c/new-in",
                "Sarees:/c/sarees",
                "Panjabi:/c/panjabi",
                "Jewellery:/c/jewellery",
                "Festive:/c/festive",
              ].join(","),
            }),
            s("result_toolbar", {
              sortDefault: "Featured",
            }),
            s("product_grid", {
              heading: "New Arrivals",
              heading_bn: "নতুন এসেছে",
              source: "collection",
              collection: "new-in",
              promise: "In stock · Dispatched in 24h",
              promise_bn: "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
            }),
            rail(
              s,
              "More to explore",
              "আরও দেখুন",
              "festive",
              "Loved across 64 districts",
              "সারা দেশে জনপ্রিয়",
            ),
          ];
        }
        case "product": {
          // Preview owns its h1 (no route), so open with a heading; keep a
          // top-level product_media with static art so the demo renders
          // without live data and applyDemoFocus can inject focused catalog
          // art. Lane widgets (breadcrumb/meta/price/cart) stay flat so
          // every section resolves its ContextSlot on the product template
          // (page_content is page/blog-only and would mismatch here, so
          // details stay a rich_text like before the columns rebuild).
          return [
            s("heading", {
              text: "Dhakai Jamdani Heritage Saree",
              text_bn: "ঢাকাই জামদানি হেরিটেজ শাড়ি",
            }),
            {
              ...s("columns", {
                columns: 2,
                asymmetrical: true,
                gap: 64,
                padY: 16,
              }),
              children: [
                {
                  ...s("container", {}),
                  children: [
                    s("product_media", {
                      ratio: "4/5",
                    }),
                  ],
                },
                {
                  ...s("container", {}),
                  children: [
                    s("breadcrumb", { homeLabel: "Home" }),
                    s("product_meta", {}),
                    s("price_block", {}),
                    s("add_to_cart", {}),
                  ],
                },
              ],
            },
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
        }
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
              body_bn: "লাইভ খোঁজ দোকানে চলে। নিচে ফলাফলের একটি নমুনা দেখুন।",
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
              marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
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
