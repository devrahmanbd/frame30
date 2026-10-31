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
// so a foreign-theme cold load (any non-owning theme) renders a complete widget
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
              // The DECLARED `heading` field (Batch D, self-critique fix 3):
              // the legacy `text` prop is dropped by the sanitiser, so the
              // storefront would show the catalogue's default instead of the
              // theme's own title.
              heading: "New Arrivals",
              heading_bn: "নতুন এসেছে",
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
              // Lane A paired authoring (§(s.8)): EN byte-identical to the
              // catalogue default `parseSection` injects — provenance moves
              // from injected-fallback to authored-ok, no rendered copy
              // changes. বাংলা twins are the platform's established terms
              // (Batch C pair table).
              homeLabel: "Home",
              homeLabel_bn: "হোম",
            }),
            s("result_toolbar", {
              countLabel: "products",
              countLabel_bn: "পণ্য",
              filtersLabel: "Filters",
              filtersLabel_bn: "ফিল্টার",
              sortLabel: "Sort",
              sortLabel_bn: "সাজান",
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
              heading_bn: "জার্নাল দেখুন",
              style: "pills",
              showCounts: true,
            }),
            s("blog_archive", {
              heading: "From the journal",
              heading_bn: "জার্নাল থেকে",
              // Lane A (§(s.8)): EN byte-identical to the injected catalogue
              // default; বাংলা twin is the plain store sentence for an empty
              // journal grid.
              emptyText: "No articles yet.",
              emptyText_bn: "এখনও কোনো প্রবন্ধ নেই।",
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
              homeLabel_bn: "হোম",
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
              // Lane A (§(s.8)): paired with the injected catalogue default.
              emptyText: "No articles yet.",
              emptyText_bn: "এখনও কোনো প্রবন্ধ নেই।",
              layout: "magazine",
              columns: 3,
              limit: 9,
              showCover: true,
              showExcerpt: true,
              showMeta: true,
            }),
            s("blog_pager", { align: "center" }),
            s("pagination", {
              mode: "numbered",
              pageLabel: "Page",
              pageLabel_bn: "পৃষ্ঠা",
              // Lane A (§(s.8)): EN byte-identical to the injected catalogue
              // defaults; বাংলা twins are `collection.tsx`'s own locale
              // fallbacks (:592, :611, :634).
              moreLabel: "Load more",
              moreLabel_bn: "আরও দেখুন",
              prevLabel: "Previous",
              prevLabel_bn: "আগের",
              nextLabel: "Next",
              nextLabel_bn: "পরের",
            }),
            s("empty_state", {
              heading: "Nothing in this archive yet",
              heading_bn: "এই আর্কাইভে এখনও কিছু নেই",
              body: "Published articles in this category, tag or author archive appear here.",
              body_bn:
                "এই ক্যাটাগরি, ট্যাগ বা লেখক আর্কাইভের প্রকাশিত প্রবন্ধ এখানে দেখা যাবে।",
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
              heading_bn: "কালেকশনে খুঁজুন",
              body: "Every result is priced and stocked by the store — filters only narrow what is already published.",
              body_bn:
                "প্রতিটি ফলাফলের দাম ও স্টক দোকানই নির্ধারণ করে — ফিল্টার শুধু প্রকাশিত পণ্য ফলাক করে।",
              homeLabel: "Home",
              homeLabel_bn: "হোম",
            }),
            s("result_toolbar", {
              countLabel: "products",
              countLabel_bn: "পণ্য",
              filtersLabel: "Filters",
              filtersLabel_bn: "ফিল্টার",
              sortLabel: "Sort",
              sortLabel_bn: "সাজান",
              sortDefault: "Featured",
            }),
            s("facet_sidebar", {
              heading: "Filters",
              heading_bn: "ফিল্টার",
              limit: 12,
              collapsed: false,
              // Decision Gate **G2 (a)** — the storefront GRANTS the facet
              // sidebar, so the preview and the storefront show the SAME
              // filters. The difference this composition used to have (the
              // preview's extra column) is closed.
              //
              // The category and kind groups are ON: the platform's facet
              // panel renders them only when these two switches are true
              // (`collection.tsx:157`, `:177`; `bool()` is
              // `props[key] === true`), so an absent prop renders a sidebar
              // with its heading and "Clear all" and nothing else. Both are
              // catalogue fields (`builder-ast.ts:2742-2743`), so a merchant
              // sees them in the builder.
              showCategories: true,
              showKinds: true,
              // Lane A paired authoring (§(s.8)): EN byte-identical to the
              // injected catalogue defaults; বাংলা twins are `collection.tsx`'s
              // own locale fallbacks for these exact fields (:163, :182, :195,
              // :202, :242, :296) and Batch C's Filters → ফিল্টার.
              drawerLabel: "Filters",
              drawerLabel_bn: "ফিল্টার",
              clearLabel: "Clear all",
              clearLabel_bn: "সব মুছুন",
              categoryLabel: "Category",
              categoryLabel_bn: "ক্যাটাগরি",
              kindLabel: "Type",
              kindLabel_bn: "ধরন",
              priceLabel: "Price",
              priceLabel_bn: "দাম",
              stockLabel: "Availability",
              stockLabel_bn: "স্টক",
              inStockLabel: "In stock only",
              inStockLabel_bn: "শুধু স্টকে আছে",
            }),
            s("filter_chips", {
              clearLabel: "Clear all",
              clearLabel_bn: "সব মুছুন",
            }),
            s("product_grid", {
              heading: "Results",
              heading_bn: "ফলাফল",
              limit: 24,
              columns: 4,
              skin: "cards",
            }),
            s("pagination", {
              mode: "numbered",
              pageLabel: "Page",
              pageLabel_bn: "পৃষ্ঠা",
              // Lane A (§(s.8)): EN byte-identical to the injected catalogue
              // defaults; বাংলা twins are `collection.tsx`'s locale fallbacks.
              moreLabel: "Load more",
              moreLabel_bn: "আরও দেখুন",
              prevLabel: "Previous",
              prevLabel_bn: "আগের",
              nextLabel: "Next",
              nextLabel_bn: "পরের",
            }),
            s("empty_state", {
              heading: "Nothing matches those filters",
              heading_bn: "এই ফিল্টারে কোনো ফল মেলেনি",
              body: "Try a shorter word, or clear a filter to widen the results.",
              body_bn:
                "ছোট শব্দে খুঁজে দেখুন, বা একটি ফিল্টার সরিয়ে ফলাফল বাড়ান।",
              clearLabel: "Clear all filters",
              clearLabel_bn: "সব ফিল্টার মুছুন",
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
                  //
                  // The `parts` order is the THEME's own arrangement of the
                  // row's interior: the line total comes before the unit
                  // price, so the shopper reads what they pay for the line
                  // before what the line costs per unit. The values are the
                  // server's — the order only chooses which of them to draw,
                  // and in which order.
                  children: [
                    s("cart_lines", {
                      heading: "",
                      // Lane A paired authoring (§(s.8)): EN byte-identical to
                      // the injected catalogue defaults; বাংলা twins are the
                      // widget's own `t()` fallbacks (`cart.tsx:202`, `:271`).
                      removeLabel: "Remove",
                      removeLabel_bn: "সরান",
                      emptyText: "Your cart is empty.",
                      emptyText_bn: "আপনার কার্ট খালি।",
                      parts:
                        "title,variant,quantity,lineTotal,unitPrice,remove",
                      layout: "row",
                    }),
                  ],
                },
                {
                  ...s("container", {}),
                  // The totals, in the theme's own order: the delivery and
                  // the VAT before the total, and no cash-on-delivery fee
                  // row (the theme's totals never quote one — the platform
                  // owns the quote, and a COD row the store cannot take is
                  // not shown).
                  children: [
                    s("cart_summary", {
                      heading: "Order summary",
                      heading_bn: "অর্ডার সারসংক্ষেপ",
                      // Lane A paired authoring (§(s.8)): EN byte-identical to
                      // the injected catalogue defaults; বাংলা twins are the
                      // widget's own `t()` fallbacks (`cart.tsx:443-575`).
                      subtotalLabel: "Subtotal",
                      subtotalLabel_bn: "সাবটোটাল",
                      discountLabel: "Discount",
                      discountLabel_bn: "ছাড়",
                      shippingLabel: "Delivery",
                      shippingLabel_bn: "ডেলিভারি",
                      codLabel: "Cash on delivery fee",
                      codLabel_bn: "ক্যাশ অন ডেলিভারি ফি",
                      vatLabel: "VAT",
                      vatLabel_bn: "ভ্যাট",
                      totalLabel: "Total",
                      totalLabel_bn: "সর্বমোট",
                      ctaLabel: "Checkout",
                      ctaLabel_bn: "চেকআউট",
                      couponLabel: "Coupon code",
                      couponLabel_bn: "কুপন কোড",
                      couponApplyLabel: "Apply",
                      couponApplyLabel_bn: "প্রয়োগ",
                      emptyText: "Add something to see your total.",
                      emptyText_bn: "মোট দেখতে পণ্য যোগ করুন।",
                      freeShippingLabel: "Spend",
                      freeShippingLabel_bn: "আরও",
                      freeShippingSuffix: "more for free shipping",
                      freeShippingSuffix_bn: "খরচ করলে ফ্রি ডেলিভারি",
                      freeShippingDone: "Free shipping unlocked.",
                      freeShippingDone_bn: "ফ্রি ডেলিভারি চালু হয়েছে।",
                      parts: "subtotal,discount,shipping,vat,total",
                    }),
                  ],
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
              heading_bn: "চেকআউট ধাপ",
              // Lane A paired authoring (§(s.8)): `step1` is byte-identical to
              // the catalogue default `parseSection` already injects ("Cart"),
              // so no rendered copy changes — the pair only moves from
              // injected-fallback to authored-ok for the publish gate's বাংলা
              // coverage. The বাংলা twin is the widget's own fallback
              // (`cart.tsx:670`, t(locale, "Cart", "কার্ট")).
              step1: "Cart",
              step1_bn: "কার্ট",
              activeStep: 2,
              // The trail's own arrangement: the step names, then the marker
              // of where the shopper is, then the links back to the completed
              // steps.
              parts: "labels,active,links",
              // Lane A paired authoring (§(s.8)); `step1` above carries the
              // same treatment. EN byte-identical to the injected catalogue
              // defaults; বাংলা twins are the widget's own `t()` fallbacks
              // (`cart.tsx:675-685`).
              step2: "Details",
              step2_bn: "তথ্য",
              step3: "Payment",
              step3_bn: "পেমেন্ট",
              step4: "Confirmation",
              step4_bn: "নিশ্চিতকরণ",
            }),
            // The route's OWN body comes FIRST: the customer fields and the
            // validated submission. The payment block and the order summary
            // follow it, so the shopper reads the address first and picks the
            // rail with the total in view — not the other way round.
            //
            // The route's own body: the production checkout form — the
            // customer fields and the validated submission. The theme
            // contributes the frame around it (Decision D2'); the platform
            // keeps the form, the totals and the rails.
            //
            // The place-order ACTION is NOT here: it is the route's, and the
            // route renders it AFTER this whole band (the route's trailing
            // slot, `ThemeChrome`'s `afterBody`), so the shopper meets it
            // last — after the rail and after the total. The theme never
            // carries a form, an input or a submit button.
            s("page_content", {}),
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
                    //
                    // The rail's own arrangement: the legend, then the rails
                    // themselves, then their groups, then the note. The
                    // RAILS are the server's — the theme chooses where they
                    // sit, never which ones exist.
                    s("payment_methods", {
                      heading: "",
                      // Lane A (§(s.8)): EN byte-identical to the injected
                      // catalogue default; বাংলা twin is the platform's ONE
                      // no-rail sentence (`payment-rail-empty.ts`,
                      // NO_PAYMENT_RAIL.bn).
                      emptyText: "No payment method is available right now.",
                      emptyText_bn: "এই মুহূর্তে কোনো পেমেন্ট পদ্ধতি নেই।",
                      parts: "legend,options,groups,note",
                    }),
                    s("payment_icons", {
                      heading: "We accept",
                      heading_bn: "আমরা পেমেন্ট গ্রহণ করি",
                      marks:
                        "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
                    }),
                  ],
                },
                {
                  ...s("container", {}),
                  children: [
                    s("cart_summary", {
                      heading: "Order summary",
                      heading_bn: "অর্ডার সারসংক্ষেপ",
                      // Lane A paired authoring (§(s.8)): EN byte-identical to
                      // the injected catalogue defaults; বাংলা twins are the
                      // widget's own `t()` fallbacks (`cart.tsx:443-575`).
                      subtotalLabel: "Subtotal",
                      subtotalLabel_bn: "সাবটোটাল",
                      discountLabel: "Discount",
                      discountLabel_bn: "ছাড়",
                      shippingLabel: "Delivery",
                      shippingLabel_bn: "ডেলিভারি",
                      codLabel: "Cash on delivery fee",
                      codLabel_bn: "ক্যাশ অন ডেলিভারি ফি",
                      vatLabel: "VAT",
                      vatLabel_bn: "ভ্যাট",
                      totalLabel: "Total",
                      totalLabel_bn: "সর্বমোট",
                      ctaLabel: "Checkout",
                      ctaLabel_bn: "চেকআউট",
                      couponLabel: "Coupon code",
                      couponLabel_bn: "কুপন কোড",
                      couponApplyLabel: "Apply",
                      couponApplyLabel_bn: "প্রয়োগ",
                      emptyText: "Add something to see your total.",
                      emptyText_bn: "মোট দেখতে পণ্য যোগ করুন।",
                      freeShippingLabel: "Spend",
                      freeShippingLabel_bn: "আরও",
                      freeShippingSuffix: "more for free shipping",
                      freeShippingSuffix_bn: "খরচ করলে ফ্রি ডেলিভারি",
                      freeShippingDone: "Free shipping unlocked.",
                      freeShippingDone_bn: "ফ্রি ডেলিভারি চালু হয়েছে।",
                      parts: "subtotal,discount,shipping,vat,total",
                    }),
                  ],
                },
              ],
            },
          ];
        case "account":
          // The account surface (Batch B). The theme's body is a FRAME around
          // the route's dashboard — and the frame's own pieces are the
          // account's FOUR PLACEABLE PANELS. Each panel is route-owned data
          // (the session-scoped `customer_overview` payload) that the theme
          // may place in its own body; the panels read the account provider
          // and nothing else, so a panel can never reach another shopper's
          // rows — and a panel with no provider renders nothing at all.
          //
          // The panels the theme does NOT place are the DASHBOARD's: the
          // dashboard is the provider's default composition, and it skips the
          // panels the theme placed — so a panel is never shown twice on one
          // page.
          //
          // NO `heading`: `account` is a route-h1 template
          // (`ROUTE_H1_TEMPLATES`), so the route owns the page's <h1> and the
          // body carries no heading-bearing section.
          //
          // NO `orders_list`: the dashboard's orders tab renders the shopper's
          // orders as STRUCTURED ROWS (the four fields `mapOrdersToRows`
          // produces). The widget's plain list beside them would show the
          // same orders twice on one page. The `account_orders` panel below
          // IS the orders — and it is placeable in the theme's own body.
          //
          // NO `profile_card`: the route supplies the composed profile card
          // when the theme's body places none of its own
          // (`themePlacesAccountProfile`, `src/lib/theme-shell-slots.ts:74`),
          // so the shopper's details are shown ONCE.
          return [
            s("account_nav", { heading: "" }),
            s("account_overview", { heading: "" }),
            s("account_orders", {
              heading: "",
              parts: "number,date,status,total",
              layout: "row",
            }),
            // The route-owned body slot STAYS: the dashboard's fallback
            // renders everything the theme did not place — the "no blank
            // required slot" rule.
            s("page_content", {}),
          ];
      }
    },
    /**
     * The VARIANT bodies (Batch C).
     *
     * The `blog` key carries ONE AST today, so the listing and the article
     * detail cannot be told apart — and the merchant cannot design them
     * apart. The closed vocabulary (`src/lib/template-variants.ts`) gives
     * them two keys: `blog_listing` and `blog_article`.
     *
     * - `blog_listing` KEEPS the pack — the same terms rail, archive grid
     *   and pager the base `blog` body carries. The listing is the surface
     *   the pack was built for.
     * - `blog_article` is the theme's FRAME around the article. The
     *   article's title, excerpt, cover and body are ROUTE context: they
     *   flow through the route-owned body slot (`page_content`), exactly
     *   like the authored page and the account dashboard. Around them the
     *   theme contributes the pack's related content and the newsletter.
     *
     * The two are distinguishable by their section-type sets, so a merchant
     * can tell them apart in the editor.
     */
    variantMain: (variant, s) => {
      s = withSongoskritiVariation(withSongoskritiDefaults(s), variationKey);
      switch (variant) {
        case "blog_listing":
          // The pack, unchanged: the terms rail, the article grid and the
          // pager. The platform owns the feed (`BlogFeedProvider`).
          return [
            s("blog_terms", {
              heading: "Browse the journal",
              heading_bn: "জার্নাল দেখুন",
              style: "pills",
              showCounts: true,
            }),
            s("blog_archive", {
              heading: "From the journal",
              heading_bn: "জার্নাল থেকে",
              // Lane A (§(s.8)): EN byte-identical to the injected catalogue
              // default; বাংলা twin is the plain store sentence for an empty
              // journal grid.
              emptyText: "No articles yet.",
              emptyText_bn: "এখনও কোনো প্রবন্ধ নেই।",
              layout: "magazine",
              columns: 3,
              limit: 9,
              showCover: true,
              showExcerpt: true,
              showMeta: true,
            }),
            s("blog_pager", { align: "center" }),
          ];
        case "blog_article":
          // The frame around the story. `page_content` is the route-owned
          // body slot: the article's title, excerpt, cover and body flow
          // through it, so the theme never re-authors the merchant's story.
          return [
            s("page_content", {}),
            // The pack's related content — the store's other articles. The
            // route mounts the store's REAL feed; without one the widget
            // would render the engine's synthetic sample rows.
            s("blog_archive", {
              heading: "More from the journal",
              heading_bn: "জার্নাল থেকে আরও",
              // Lane A (§(s.8)): paired with the injected catalogue default.
              emptyText: "No articles yet.",
              emptyText_bn: "এখনও কোনো প্রবন্ধ নেই।",
              layout: "magazine",
              columns: 3,
              limit: 3,
              showCover: true,
              showExcerpt: true,
              showMeta: true,
            }),
            // The newsletter — the theme's own engagement block.
            s("newsletter", {
              heading: "From the journal, weekly",
              heading_bn: "সাপ্তাহিক জার্নাল",
              body: "One letter a week: new stories, care notes and what is coming.",
              body_bn:
                "সপ্তাহে একটি চিঠি: নতুন গল্প, যত্নের পরামর্শ ও সামনে যা আসছে।",
              buttonLabel: "Subscribe",
              buttonLabel_bn: "সাবস্ক্রাইব",
            }),
          ];
        default:
          return null;
      }
    },
  };
}
