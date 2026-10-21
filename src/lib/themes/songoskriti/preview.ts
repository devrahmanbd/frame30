import type { SectionBuilder } from "./types";
import type { PreviewThemeSource } from "../../theme-preview-nav";
import { withSongoskritiDefaults } from "./skins";
import {
  SONGOSKRITI_VARIATIONS,
  songoskritiTokensFor,
  withSongoskritiVariation,
} from "./variations";
import { buildHeaderMain } from "./header";
import { buildFooterMain } from "./footer";
import { buildHomepageMain } from "./homepage";
import { registerSongoskritiPresentationClaims } from "./presentation-claims";
import { SONGOSKRITI_WIDGETS } from "../../../components/builder/songoskriti";
// Live-rendering activation (THEME-OWNED WIDGET lane, Task 7): side-effect
// import of the ornament presentation pulls `ornament-def` into the
// storefront graph so its lazy registry claim self-registers
// `theme:songoskriti/ornament` on the shared singleton (see ornament-def.ts
// for the cycle mechanics: widgets.tsx:43,1666-1668 and
// unified-widget-registry.ts:110-127,927). Mirrors the editor carrier in
// songoskriti.tsx; the registry claim itself is lazy in ornament-def.ts.
import "./ornament-presentation";
// Universal-body activation (theme = dress, widget = body): the generic
// presentation registers the ornament's neutral body for EVERY active theme,
// so a foreign-theme cold load (somvabona etc.) renders a complete widget
// instead of the unavailable placeholder. Mirrors the editor carrier in
// songoskriti.tsx; must not share the owner component's owning-theme fate.
import "./ornament-generic-presentation";
// Live-rendering activation (HEADER DE-THEMING lane): this preview entry
// is in the prod import graph (preview-sources → preview, dynamically
// imported by storefront routes), so re-exporting the header presentation
// runs its `registerThemePresentation` side effect for live rendering.
export { SongoskritiHeaderPresentation } from "./header-presentation";
// Live-rendering activation (PRESENTATION-CLAIMS lane): register the 13
// Songoskriti presentation claims through the storefront graph. The
// already-claimed guard keeps this idempotent across the editor carrier
// (songoskriti.tsx) and never evicts the live mega_menu claim.
registerSongoskritiPresentationClaims(SONGOSKRITI_WIDGETS);

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

export function songoskritiPreviewSource(
  variationKey?: string,
): PreviewThemeSource {
  return {
    key: "songoskriti",
    themeName: "Songoskriti",
    author: "Framique",
    tokens: songoskritiTokensFor(variationKey),
    variations: SONGOSKRITI_VARIATIONS,
    header: (template, s) =>
      template === "checkout" ? [] : buildHeaderMain(s),
    footer: (template, s) =>
      template === "checkout" ? [] : buildFooterMain(s),
    main: (template, s) => {
      // Non-homepage templates author sections directly (not through the
      // homepage builder), so they get the same skin-default wrap here.
      // The variation layer sits OUTSIDE the base wrap: base < variation <
      // authored. The homepage builder wraps internally the same way, so it
      // receives the variation-layered builder directly.
      s = withSongoskritiVariation(withSongoskritiDefaults(s), variationKey);
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
              body: "Sample product page — prices and stock are sample data, and ordering is disabled in the preview.",
              body_bn:
                "নমুনা পণ্যের পাতা — দাম ও স্টক নমুনা তথ্য, আর প্রিভিউতে অর্ডার বন্ধ আছে।",
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
          // The route owns the body: `page_content` is the shared slot the
          // CMS page route and the CMS-designated homepage flow their real
          // content through (`PageView.tsx:166,175`; `StoreHomepage.tsx:120`).
          // `page` is a route-h1 template (`ROUTE_H1_TEMPLATES`), so the route
          // owns the <h1> too — this template elects no primary section, and
          // declares no demo copy of its own.
          return [
            s("breadcrumb", { homeLabel: "Home" }),
            s("page_content", {}),
          ];
        case "blog":
          // The platform's blog pack renders the listing: the terms rail, the
          // archive grid and the pager (`src/components/builder/blog.tsx:392-394`).
          // The theme owns the composition — which pack sections, in which
          // order — and the platform owns the feed
          // (`BlogFeedProvider`). No authored story body: the demo story the
          // preview used to show ("Meet the makers") is retired.
          return [
            s("blog_terms", {
              heading: "Browse the journal",
              style: "pills",
              showCounts: true,
            }),
            s("blog_archive", {
              heading: "From the journal",
              layout: "magazine",
              columns: 3,
              limit: 9,
              showCover: true,
              showExcerpt: true,
              showMeta: true,
            }),
            s("blog_pager", { align: "center" }),
          ];
        case "archive":
          // The content archive — a category, a tag or an author's articles
          // (Decision D1'). The platform owns the listing: the resolved
          // term's name and description are ROUTE context, so the theme
          // authors the FRAME around them and never the merchant's copy.
          //
          // The body is exactly: the `category_header` (the archive's own
          // opening band), the blog pack (`blog_terms` + `blog_archive` +
          // `blog_pager` — the listing surface and its facet rail), the
          // `pagination` (the pager) and the `empty_state` (what an empty
          // archive shows).
          //
          // NO `product_grid`: the grid reads the host's `productSlot` ONLY
          // on the search template, so a grid here would render eight
          // product skeletons — an archive has no product slot. NO
          // `heading` and NO `rich_text`: `archive` is a route-h1 template,
          // so the route owns the page's <h1> and the body carries no demo
          // copy.
          return [
            s("category_header", {
              // The route owns the page's <h1> (the resolved term's name),
              // so this widget claims none: a blank `heading` is the
              // platform's documented remedy for a heading-capable widget
              // that must not be the primary heading.
              heading: "",
              // The merchant-safe label. The RESOLVED term's name and
              // description are route context — the widget never carries a
              // merchant's own copy.
              title: "Archive",
              title_bn: "আর্কাইভ",
              description: "",
              description_bn: "",
              showBreadcrumb: true,
              homeLabel: "Home",
            }),
            s("blog_terms", {
              heading: "Browse the archive",
              heading_bn: "আর্কাইভ দেখুন",
              style: "pills",
              showCounts: true,
            }),
            s("blog_archive", {
              heading: "Articles",
              heading_bn: "প্রবন্ধ",
              layout: "magazine",
              columns: 3,
              limit: 9,
              showCover: true,
              showExcerpt: true,
              showMeta: true,
            }),
            s("blog_pager", { align: "center" }),
            s("pagination", { mode: "numbered", pageLabel: "Page" }),
            s("empty_state", {
              heading: "Nothing in this archive yet",
              body: "Published articles in this category, tag or author archive appear here.",
              clearLabel: "",
              showSuggestions: false,
              limit: 4,
            }),
          ];
        case "search":
          // The platform owns the search: it executes the query, authorizes the
          // tenant and prices the results (`store.$slug.search.tsx:42-105`),
          // and it hands the theme ONE opaque block (`productSlot`, `:559`).
          // The theme owns the composition around it — the section order, the
          // filters column, the results area, the pager and the empty state.
          // No authored copy of the platform's pieces (no heading, no rich_text):
          // the route's own query box, summary and labels stay the single
          // source of truth (`Review Focus 2` in the plan).
          return [
            s("category_header", {
              text: "Search the collection",
              text_bn: "কালেকশনে খুঁজুন",
              description:
                "Every result is priced and stocked by the store — filters only narrow what is already published.",
              description_bn:
                "প্রতিটি ফলাফলের দাম ও স্টক দোকানই নির্ধারণ করে — ফিল্টার শুধু প্রকাশিত পণ্য ফলাক করে।",
              heading: "Search the collection",
              body: "Every result is priced and stocked by the store — filters only narrow what is already published.",
              homeLabel: "Home",
            }),
            s("result_toolbar", {
              countLabel: "products",
              filtersLabel: "Filters",
              sortLabel: "Sort",
              sortDefault: "Featured",
            }),
            s("facet_sidebar", {
              heading: "Filters",
              limit: 12,
              collapsed: false,
              // The category and kind groups are ON: the platform's facet
              // panel renders them only when these two switches are true
              // (`collection.tsx:157`, `:177`; `bool()` is
              // `props[key] === true`), so an absent prop renders a sidebar
              // with its heading and "Clear all" and nothing else. Both are
              // catalogue fields (`builder-ast.ts:2742-2743`), so a merchant
              // sees them in the builder.
              showCategories: true,
              showKinds: true,
            }),
            s("filter_chips", { clearLabel: "Clear all" }),
            s("product_grid", {
              heading: "Results",
              limit: 24,
              columns: 4,
              skin: "cards",
            }),
            s("pagination", { mode: "numbered", pageLabel: "Page" }),
            s("empty_state", {
              heading: "Nothing matches those filters",
              body: "Try a shorter word, or clear a filter to widen the results.",
              clearLabel: "Clear all filters",
              limit: 4,
            }),
          ];
        case "cart":
          // The platform owns the cart: it holds the lines, merges the
          // quantities and quotes the totals (`src/components/builder/cart.tsx:203`,
          // `:440`). The theme owns the composition only — the page heading
          // and the two-column layout (the items on the left, the money on
          // the right). No demo rail: the cart is a commerce surface, and a
          // "you may also like" rail is the generic demo shape the
          // distinctness gate rejects (Task 8's `R1`/`R5`).
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
                  // `cart_lines` is a heading-capable widget (`heading: true`,
                  // `builder-ast.ts:2851`) and so is `cart_summary` (`:1607`):
                  // two claimants in one body is a lint error
                  // (`builder-ast.ts:8516-8523`). The lines block therefore
                  // carries a deliberately blank heading — the platform's
                  // documented remedy (`builder-ast.ts:8506-8513`) — so the
                  // order summary is the body's single claimant.
                  children: [s("cart_lines", { heading: "" })],
                },
                {
                  ...s("container", {}),
                  children: [s("cart_summary", { heading: "Order summary" })],
                },
              ],
            },
          ];
        case "checkout":
          // The platform owns checkout: it quotes the cart, offers the rails
          // the store can take money through and places the order
          // (`store.$slug.checkout.tsx:42-105`, `:428+`). The theme owns the
          // composition only — the progress trail, the payment block and the
          // order summary, all of them platform-owned widgets reading the
          // server's quote (`src/components/builder/cart.tsx:506`, `:563`,
          // `:441`). No authored field, no authored price, no authored
          // "place order" action: in production the route renders its own
          // form through the route-owned body slot
          // (`contentSlot="page_content"`, `store.$slug.checkout.tsx`).
          return [
            s("heading", { text: "Checkout", text_bn: "চেকআউট" }),
            s("checkout_steps", {
              heading: "Checkout progress",
              activeStep: 2,
            }),
            {
              ...s("columns", { columns: 2, asymmetrical: true, gap: 64 }),
              children: [
                {
                  ...s("container", {}),
                  children: [
                    // Blank heading: the payment block must not claim the
                    // page <h1> (the order summary is the one claimant) —
                    // the widget falls back to its built-in "Payment
                    // method" legend, so nothing disappears.
                    s("payment_methods", { heading: "" }),
                    s("payment_icons", {
                      heading: "We accept",
                      marks:
                        "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
                    }),
                  ],
                },
                {
                  ...s("container", {}),
                  children: [s("cart_summary", { heading: "Order summary" })],
                },
              ],
            },
            // The route's OWN body: the production checkout form — the
            // customer fields, the validated submission and the place-order
            // action. The theme contributes the frame around it (Decision
            // D2'); the platform keeps the form, the totals and the rails.
            s("page_content", {}),
          ];
        case "account":
          // The account surface (Batch B). The theme's body is a FRAME around
          // the route's dashboard: the merchant's own profile card, and the
          // route-owned body slot the dashboard flows through
          // (`ThemeChrome`'s `contentSlot` — the same slot the authored page
          // uses for the merchant's CMS body).
          //
          // NO `heading`: `account` is a route-h1 template
          // (`ROUTE_H1_TEMPLATES`), so the route owns the page's <h1> and the
          // body carries no heading-bearing section.
          //
          // NO `orders_list`: the dashboard's orders tab renders the shopper's
          // orders as STRUCTURED ROWS (the four fields `mapOrdersToRows`
          // produces). The widget's plain list beside them would show the
          // same orders twice on one page.
          return [s("profile_card", {}), s("page_content", {})];
      }
    },
  };
}
