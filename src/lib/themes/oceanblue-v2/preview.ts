import type { SectionBuilder } from "./types";
import type { PreviewThemeSource } from "../../theme-preview-nav";
import { withOceanblueV2Defaults } from "./skins";
import { OCEANBLUE_V2_TOKENS } from "./tokens";
import { buildHeaderMain } from "./header";
import { buildFooterMain } from "./footer";
import { buildHomepageMain } from "./homepage";

/**
 * Oceanblue-v2's preview source — theme-owned demo content for the
 * theme-agnostic preview engine.
 *
 * Wired through the preview-sources registry; the engine never imports
 * this module directly. Everything here is plain section data built with
 * the theme's own builders: no preview components, no preview behavior,
 * no platform imports (the engine port type is type-only and erased).
 *
 * Demo rows resolve from the shared OCEANBLUE demo catalog (same key —
 * ethnic products, BDT minor units, OB-* SKUs); this theme authors no
 * catalog of its own.
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
    cardVariant: "standard",
    showRating: true,
    promise,
    promise_bn,
    skin: "minimal",
  });

export function oceanblueV2PreviewSource(): PreviewThemeSource {
  return {
    key: "oceanblue-v2",
    themeName: "Oceanblue V2",
    author: "Framique",
    tokens: OCEANBLUE_V2_TOKENS,
    header: (template, s) => template === "checkout" ? [] : buildHeaderMain(s),
    footer: (template, s) => template === "checkout" ? [] : buildFooterMain(s),
    main: (template, s) => {
      // Non-homepage templates author sections directly (not through the
      // homepage builder), so they get the same skin-default wrap here.
      s = withOceanblueV2Defaults(s);
      switch (template) {
        case "index":
          return buildHomepageMain(s);
        case "collection": {
          // The applyDemoFocus system rewrites the `category_header`'s title
          // and the product_rail's collection when a focus slug is clicked.
          // We author a generic "New Arrival" default; the engine overrides
          // the heading text and rail collection automatically via focus.
          return [
            s("category_header", {
              heading: "New Arrival",
              heading_bn: "নতুন এসেছে",
              body: "Fresh ethnic wear for the season — suits, kurtas, dresses and more.",
              body_bn:
                "এই সিজনের নতুন এথনিক পোশাক — স্যুট, কুর্তা, পোশাক আরও অনেক।",
              showCount: true,
              showBreadcrumb: true,
              homeLabel: "Home",
            }),
            s("filter_chips", {
              clearLabel: "Clear all",
              // Preview never carries active facets, so the widget would
              // render null (correct storefront behavior) and demo nothing:
              // show the honest empty state instead.
              showWhenEmpty: true,
              emptyText: "No filters applied.",
            }),
            s("result_toolbar", {
              sortDefault: "Featured",
            }),
            s("product_grid", {
              heading: "New Arrival",
              heading_bn: "নতুন এসেছে",
              source: "collection",
              collection: "new-in",
              promise: "In stock · 7-day exchange",
              promise_bn: "স্টকে আছে · ৭ দিনের বদল",
              skin: "cards",
            }),
            rail(
              s,
              "More to explore",
              "আরও দেখুন",
              "festive",
              "Loved across the country",
              "সারা দেশে জনপ্রিয়",
            ),
          ];
        }
        case "product": {
          // Preview owns its h1 (no route), so open with a heading; lane
          // widgets (breadcrumb/meta/price/cart) stay flat so every section
          // resolves its ContextSlot on the product template.
          return [
            s("heading", {
              text: "Embroidered Georgette Salwar Set",
              text_bn: "এমব্রয়ডারি জর্জেট সালোয়ার সেট",
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
            // NOTE: no sticky_buy_bar in the demo body — the installed product
            // template (secondary.ts) carries it, but it renders null
            // without live product rows (correct storefront behavior: it
            // needs a variant), so the demo omits it deliberately.
            s("rich_text", {
              heading: "Details",
              heading_bn: "বিবরণ",
              body: "Demo product page. Prices and stock are sample data — ordering is disabled in preview.",
              body_bn:
                "ডেমো পণ্যের পাতা। দাম ও স্টক নমুনা তথ্য — প্রিভিউতে অর্ডার বন্ধ।",
            }),
            rail(
              s,
              "Complete the look",
              "লুক সম্পূর্ণ করুন",
              "festive",
              "Loved across the country",
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
              body: "Demo article. Chest, waist and length guidance for salwar sets, kurtas and dresses.",
              body_bn:
                "ডেমো নিবন্ধ। সালোয়ার সেট, কুর্তা ও পোশাকের জন্য মাপের নির্দেশনা।",
            }),
          ];
        case "blog":
          return [
            s("heading", { text: "Journal", text_bn: "জার্নাল" }),
            s("rich_text", {
              heading: "Eid dressing, simplified",
              heading_bn: "ঈদের সাজ, সহজ করে",
              body: "Demo story. Three silhouettes that work from morning prayers to evening dawat — full articles ship with the theme.",
              body_bn:
                "ডেমো গল্প। সকালের নামাজ থেকে সন্ধ্যার দাওয়াত — তিনটি সিলুয়েট। পূর্ণ নিবন্ধ থিমের সাথেই আসে।",
            }),
            s("newsletter", {
              heading: "New drops, first inbox",
              heading_bn: "নতুন ড্রপ, সবার আগে ইনবক্সে",
              body: "New arrivals, restocks and sale alerts.",
              body_bn: "নতুন সংগ্রহ, রিস্টক ও সেল অ্যালার্ট।",
              buttonLabel: "Subscribe",
              buttonLabel_bn: "সাবস্ক্রাইব",
              consentText: "We email only for drops and sales. Unsubscribe anytime.",
              consentText_bn:
                "শুধু ড্রপ ও সেলের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
            }),
          ];
        case "search":
          return [
            s("heading", { text: "Search results", text_bn: "খোঁজার ফলাফল" }),
            s("filter_chips", {
              clearLabel: "Clear all",
              showWhenEmpty: true,
              emptyText: "No filters applied.",
            }),
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
              "Loved across the country",
              "সারা দেশে জনপ্রিয়",
            ),
          ];
        case "cart":
          return [
            s("heading", { text: "Your bag", text_bn: "আপনার ব্যাগ" }),
            {
              ...s("columns", {
                columns: 2,
                asymmetrical: true,
                gap: 64,
              }),
              children: [
                {
                  ...s("container", {}),
                  children: [
                    s("cart_lines", {}),
                  ],
                },
                {
                  ...s("container", {}),
                  children: [
                    s("cart_summary", {}),
                  ],
                },
              ],
            },
            rail(
              s,
              "You may also like",
              "আপনার পছন্দ হতে পারে",
              "new-in",
              "In stock · 7-day exchange",
              "স্টকে আছে · ৭ দিনের বদল",
              4,
            ),
          ];
        case "checkout":
          return [
            s("heading", { text: "Checkout", text_bn: "চেকআউট" }),
            {
              ...s("columns", {
                columns: 2,
                asymmetrical: true,
                gap: 64,
              }),
              children: [
                {
                  ...s("container", {}),
                  children: [
                    s("rich_text", {
                      heading: "Contact & Shipping",
                      heading_bn: "যোগাযোগ ও শিপিং",
                      body: "Provide your delivery address and contact details.",
                      body_bn: "আপনার ডেলিভারি ঠিকানা এবং যোগাযোগের তথ্য প্রদান করুন।",
                    }),
                    s("payment_icons", {
                      heading: "Payment Method",
                      heading_bn: "পেমেন্ট পদ্ধতি",
                      marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
                    }),
                  ],
                },
                {
                  ...s("container", {}),
                  children: [
                    s("cart_summary", {}),
                  ],
                }
              ]
            }
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
