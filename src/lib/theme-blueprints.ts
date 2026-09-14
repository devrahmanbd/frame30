/**
 * Phase 10 steps 5–8 — the four blueprint themes.
 *
 * Bazaar (marketplace), Atelier (apparel/editorial), Circuit (electronics,
 * light + designed dark) and Rupaboti (beauty, guided selling) are the themes
 * the widget registry was designed around. Each one exercises its vertical
 * widget set across all seven templates, in English and বাংলা, and ships a
 * demo catalogue (see `theme-demo.ts`).
 *
 * Data only: no React, no network. Built through the shared section factory so
 * ids stay unique and every bilingual prop is filled at construction time.
 */
import { DEFAULT_TOKENS } from "./builder-ast";
import type { PropValue, Section, SectionType, TemplateKey, ThemeAst, ThemeTokens } from "./builder-ast";
import type { ThemePreset } from "./theme-presets";
import { BLUEPRINT_BN } from "./theme-blueprints.bn";
import { sectionFactory } from "./theme-section";
import type { Extras } from "./theme-section";

const make = sectionFactory(BLUEPRINT_BN);

type Build = (
  key: string,
) => (type: SectionType, props: Record<string, PropValue>, extras?: Extras) => Section;

const bound: Build = (key) => (type, props, extras) => make(key, type, props, extras);

const COLS = (desktop: number): Extras => ({
  bp: { tablet: { columns: Math.max(2, desktop - 1) }, mobile: { columns: 2 } },
});

const GUIDE_AUTHOR = {
  author: "Nusrat Jahan",
  authorRole: "Category editor",
  reviewedBy: "Imran Hossain",
  reviewedOn: "2026-05-02",
};

/**
 * Blueprints author six templates by hand; the search results page reuses the
 * collection listing with an H1 that names the query, which is what every one
 * of them would otherwise repeat verbatim.
 */
function withSearch(
  key: string,
  templates: Omit<Record<TemplateKey, ThemeAst>, "search">,
): Record<TemplateKey, ThemeAst> {
  const base = templates.collection;
  // Ids must stay globally unique across templates, so the reused collection
  // nodes are cloned under a search-scoped id rather than shared by reference.
  const reid = (sections: Section[]): Section[] =>
    sections.map((section) => ({ ...section, id: `${section.id}-search` }));
  return {
    ...templates,
    search: {
      header: reid(base.header),
      main: [
        make(key, "heading", { text: "Search results", level: "h1", align: "left" }),
        ...reid(base.main.filter((section) => section.type !== "heading")),
      ],
      footer: reid(base.footer),
    },
  };
}

function tokens(partial: Partial<ThemeTokens>): ThemeTokens {
  return { ...DEFAULT_TOKENS, ...partial };
}

/* ------------------------------------------------------------------ bazaar */

function bazaar(): ThemePreset {
  const k = "bazaar";
  const s = bound(k);
  const sitemap = () =>
    s("footer_sitemap", {
      c1Title: "Shop",
      c1Links: "Deals\nNew arrivals\nBrands",
      c2Title: "Help",
      c2Links: "Track order\nReturns\nContact us",
      c3Title: "Sellers",
      c3Links: "Sell with us\nSeller policy",
      c4Title: "About",
      c4Links: "Our story\nCareers",
    });
  const trust = () =>
    s("trust_bar", {
      i1Title: "Cash on delivery",
      i1Body: "Pay when the courier hands it over.",
      i2Title: "7-day returns",
      i2Body: "Unused items, no questions asked.",
      i3Title: "Verified sellers",
      i3Body: "Every seller is trade-licence checked.",
      i4Title: "Nationwide courier",
      i4Body: "64 districts, tracked end to end.",
    });
  const footer = (): Section[] => [
    sitemap(),
    s("support_strip", {
      heading: "Need a hand?",
      t1Title: "Track your order",
      t1Body: "Live courier status.",
      t2Title: "Returns",
      t2Body: "Start a return in a minute.",
      t3Title: "Payments",
      t3Body: "bKash, Nagad, Rocket and cards.",
      t4Title: "Talk to us",
      t4Body: "Every day, 9am to 9pm.",
    }),
    s("payment_icons", { heading: "Ways to pay", marks: "bKash\nNagad\nRocket\nVisa\nMastercard" }),
    s("social_strip", { heading: "Follow the marketplace" }),
    s("rich_text", { heading: "About this store", body: "A marketplace of verified local sellers with one checkout and one return policy." }),
  ];
  const header = (): Section[] => [
    s("announcement_bar", {
      m1: "Free delivery over BDT 2,000",
      m2: "Cash on delivery across 64 districts",
      m3: "7-day easy returns",
      dismissible: true,
      rotateMs: 6000,
    }),
    s("utility_bar", {
      note: "Order before 6pm for same-day dispatch",
      l1Label: "Track order",
      l1Href: "/track",
      l2Label: "Help centre",
      l2Href: "/help",
      l3Label: "Sell with us",
      l3Href: "/sell",
      showLanguage: true,
    }),
    s("search_command", { placeholder: "Search millions of products", buttonLabel: "Search", limit: 8 }),
    s("mega_menu", { label: "All departments", limit: 12, columns: 4 }),
    s("account_cart", { accountLabel: "Account", cartLabel: "Cart", showCount: true }),
  ];
  return {
    key: k,
    nameEn: "Bazaar",
    nameBn: "বাজার",
    summaryEn: "Marketplace storefront: departments, deals, seller cards and dense merchandising rails.",
    summaryBn: "মার্কেটপ্লেস স্টোরফ্রন্ট: ডিপার্টমেন্ট, ডিল, সেলার কার্ড ও ঘন মার্চেন্ডাইজিং রেল।",
    category: "marketplace",
    version: "1.0.0",
    api: "^3.0.0",
    sortOrder: 110,
    tokens: tokens({ brand: "#1D4ED8", accent: "#F97316", surface: "#F8FAFC", ink: "#0F172A", radius: "6px", container: "1320px", density: "dense", typeScale: "compact", spaceUnit: "12px" }),
    templates: withSearch(k, {
      index: {
        header: header(),
        main: [
          s("hero", { heading: "Everything, from every seller", subheading: "Millions of products, one trusted checkout.", ctaLabel: "Shop deals", ctaHref: "#deals", align: "left" }),
          s("department_strip", { heading: "Shop by department", limit: 12 }),
          s("deal_strip", { heading: "Deals of the day", badgeLabel: "Deal", cardVariant: "compact" }),
          s("deal_card", { heading: "Flash deal", badgeLabel: "Ends soon", endsAt: "2026-12-31T18:00:00Z", ctaLabel: "Grab it", ctaHref: "/collections/deals" }),
          s("product_rail", { heading: "Best sellers this week", source: "bestsellers", promise: "Delivered in 1-3 days", showRating: true, cardVariant: "standard" }),
          s("sponsored_slot", { heading: "Sponsored", cardVariant: "compact" }),
          s("brand_strip", { heading: "Top brands", columns: 6 }, COLS(6)),
          s("rank_list", { heading: "Trending in electronics" }),
          s("collection_grid", { heading: "Popular categories", limit: 8, columns: 4, showCount: true }, COLS(4)),
          s("product_grid", { heading: "Recommended for you", limit: 12, columns: 4, showRating: true }, COLS(4)),
          trust(),
        ],
        footer: footer(),
      },
      product: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("product_media", { ratio: "1/1", showThumbnails: true, zoom: true }, { bp: { mobile: { showThumbnails: false } } }),
          s("price_block", { showCompareAt: true, note: "VAT included where applicable." }),
          s("variant_picker", { heading: "Choose an option", mode: "chip", axisOneLabel: "Variant" }),
          s("buy_box", { label: "Add to cart", showQuantity: true, showCompareAt: true, note: "Sold and shipped by the seller.", promise: "Delivered in 1-3 days" }),
          s("add_to_cart", { label: "Add to cart", showQuantity: true }),
          s("stock_delivery", { lowStockAt: 5, cutOff: "Order before 6pm" }),
          s("delivery_promise", { heading: "Delivery", insideLabel: "Inside Dhaka", insideDays: "1-2 days", outsideLabel: "Outside Dhaka", outsideDays: "2-4 days", note: "Courier charge shown at checkout." }),
          s("seller_card", { name: "Dhaka Trade House", tagline: "Verified seller since 2021", rating: 5, policy: "7-day returns on unused items.", linkLabel: "View seller", linkHref: "/sellers/dhaka-trade-house" }),
          s("spec_table", { caption: "Specifications", columnLabel: "Detail", grouped: true }),
          s("tabs", { t1Label: "Description", t1Body: "Full product description from the seller.", t2Label: "Returns", t2Body: "Return within 7 days in unused condition.", t3Label: "Warranty", t3Body: "Warranty terms are listed on the invoice." }),
          s("rating_summary", { heading: "Ratings", showHistogram: true, verifiedOnly: true }),
          s("review_list", { heading: "Customer reviews", limit: 5, sort: "recent", verifiedOnly: true, emptyText: "No reviews yet." }),
          s("product_qna", { heading: "Questions and answers", askLabel: "Ask a question", askHref: "/help" }),
          s("product_grid", { heading: "You may also like", limit: 4, columns: 4 }, COLS(4)),
          s("sticky_buy_bar", { label: "Add to cart", showPrice: true, dockAfter: 400 }),
        ],
        footer: footer(),
      },
      collection: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("category_header", { heading: "Browse the department", body: "Filter by brand, price and delivery speed.", showCount: true, showBreadcrumb: true, homeLabel: "Home" }),
          s("result_toolbar", { countLabel: "results", showSort: true, showDensity: true, filtersLabel: "Filters", sortLabel: "Sort" }),
          s("filter_chips", { clearLabel: "Clear all", emptyText: "No filters applied." }),
          s("facet_sidebar", { heading: "Filters", limit: 12, showCategories: true, showKinds: true, showPrice: true, showStock: true, drawerLabel: "Filters", clearLabel: "Clear all", categoryLabel: "Category", kindLabel: "Type", priceLabel: "Price", stockLabel: "Availability", inStockLabel: "In stock only" }),
          s("product_grid", { heading: "All products", limit: 24, columns: 4, showRating: true }, COLS(4)),
          s("pagination", { mode: "numbered", moreLabel: "Load more", prevLabel: "Previous", nextLabel: "Next", pageLabel: "Page" }),
          s("empty_state", { heading: "Nothing matches those filters", body: "Try removing a filter or two.", clearLabel: "Clear all", showSuggestions: true, limit: 4 }),
        ],
        footer: footer(),
      },
      page: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("page_content", {}),
          s("order_tracker", { heading: "Track your order", step1: "Order placed", step2: "Packed", step3: "With courier", step4: "Delivered", note: "Updates arrive by SMS." }),
          s("faq", { heading: "Common questions", q1: "How long does delivery take?", a1: "Inside Dhaka 1-2 working days, outside Dhaka 2-4 working days.", q2: "Can I return an item?", a2: "Yes, within 7 days of delivery in unused condition.", q3: "Which payments do you accept?", a3: "Cash on delivery, bKash, Nagad and Rocket." }),
          s("store_locator", { heading: "Pickup points", s1Name: "Dhanmondi hub", s1Address: "Road 27, Dhanmondi, Dhaka", s1Hours: "10am - 8pm", s2Name: "Chattogram hub", s2Address: "Agrabad, Chattogram", s2Hours: "10am - 7pm", s3Name: "Sylhet hub", s3Address: "Zindabazar, Sylhet", s3Hours: "10am - 7pm" }),
        ],
        footer: footer(),
      },
      blog: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("blog_terms", { heading: "", style: "pills", showCounts: true }),
          s("blog_archive", { heading: "", layout: "grid", columns: 3, limit: 9, showCover: true, showExcerpt: true, showMeta: true, emptyText: "No articles yet." }, COLS(3)),
          s("product_rail", { heading: "Shop this story", source: "recommended", showRating: true, cardVariant: "compact" }),
          s("blog_pager", { align: "center" }),
          s("newsletter", { heading: "Get the next post", body: "One email when we publish. No spam.", buttonLabel: "Subscribe" }),
        ],
        footer: footer(),
      },
      cart: {
        header: [],
        main: [
          s("free_shipping_bar", { freeShippingLabel: "Add", freeShippingSuffix: "more for free delivery", freeShippingDone: "Free delivery unlocked" }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("heading", { text: "Your cart", level: "h2", align: "left" }),
          s("delivery_promise", { heading: "Delivery", insideLabel: "Inside Dhaka", insideDays: "1-2 days", outsideLabel: "Outside Dhaka", outsideDays: "2-4 days", note: "Courier charge shown at checkout." }),
          s("product_grid", { heading: "Add something else", limit: 4, columns: 4 }, COLS(4)),
          s("payment_icons", { heading: "Ways to pay", marks: "bKash\nNagad\nRocket\nVisa\nMastercard" }),
        ],
        footer: footer(),
      },
      checkout: {
        header: [s("banner", { text: "Secure checkout", tone: "info" })],
        main: [
          s("payment_methods", { heading: "", note: "Payments are processed server-side.", emptyText: "No payment method is enabled yet." }),
          s("checkout_steps", { heading: "Checkout", step1: "Cart", step2: "Address", step3: "Payment", step4: "Done", activeStep: 3 }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("delivery_promise", { heading: "Delivery", insideLabel: "Inside Dhaka", insideDays: "1-2 days", outsideLabel: "Outside Dhaka", outsideDays: "2-4 days", note: "Courier charge shown at checkout." }),
          trust(),
        ],
        footer: [trust()],
      },
    }),
  };
}

/* ----------------------------------------------------------------- atelier */

function atelier(): ThemePreset {
  const k = "atelier";
  const s = bound(k);
  const sustain = () =>
    s("sustain_badge", {
      heading: "Made responsibly",
      c1Label: "Local workshops",
      c1Source: "Supplier list, 2026",
      c2Label: "Low-waste cutting",
      c2Source: "Production audit, 2026",
      c3Label: "Recycled packaging",
      c3Source: "Packaging spec, 2026",
    });
  const footer = (): Section[] => [
    s("footer_sitemap", {
      c1Title: "Shop",
      c1Links: "New arrivals\nDresses\nSari",
      c2Title: "Help",
      c2Links: "Size guide\nExchanges\nContact us",
      c3Title: "Studio",
      c3Links: "Our story\nMakers",
      c4Title: "Legal",
      c4Links: "Privacy\nTerms",
    }),
    s("payment_icons", { heading: "Ways to pay", marks: "bKash\nNagad\nRocket\nVisa" }),
    s("social_strip", { heading: "Follow the studio" }),
    s("rich_text", { heading: "About this store", body: "Small-batch clothing cut and finished in Dhaka, photographed on real bodies." }),
  ];
  const header = (): Section[] => [
    s("announcement_bar", { m1: "Free size exchange within 7 days", m2: "New season drop is live", m3: "Free delivery over BDT 2,000", dismissible: true, rotateMs: 7000 }),
    s("utility_bar", { note: "Studio pickup available in Dhanmondi", l1Label: "Size guide", l1Href: "/pages/size-guide", l2Label: "Exchanges", l2Href: "/pages/exchanges", l3Label: "Contact us", l3Href: "/pages/contact", showLanguage: true }),
    s("search_command", { placeholder: "Search the collection", buttonLabel: "Search", limit: 6 }),
    s("mega_menu", { label: "Collections", limit: 8, columns: 3 }),
  ];
  return {
    key: k,
    nameEn: "Atelier",
    nameBn: "আটেলিয়ে",
    summaryEn: "Editorial fashion storefront with lookbooks, fit guidance and shoppable UGC.",
    summaryBn: "লুকবুক, ফিট গাইড ও শপেবল ইউজিসি সহ এডিটোরিয়াল ফ্যাশন স্টোরফ্রন্ট।",
    category: "fashion",
    version: "1.0.0",
    api: "^3.0.0",
    sortOrder: 120,
    tokens: tokens({
      brand: "#111827",
      accent: "#B45309",
      surface: "#FBF8F4",
      ink: "#1C1917",
      radius: "2px",
      container: "1240px",
      density: "airy",
      typeScale: "expressive",
      spaceUnit: "24px",
      shadow: "none",
      motion: "subtle",
      fontPairing: "editorial-mix",
      fontDisplay: "Hind Siliguri",
      fontBody: "Inter",
      // Designed dark set: paper inverts, pigment lightens so it keeps ≥4.5:1 on ink.
      dark: { brand: "#F5F5F4", accent: "#F59E0B", surface: "#141210", ink: "#F5F1EA" },
    }),
    templates: withSearch(k, {
      index: {
        header: header(),
        main: [
          s("editorial_hero", { eyebrow: "Season 04", heading: "Cut for the way you live", body: "Limited runs, natural fibres, honest photography.", ctaLabel: "Shop the edit", ctaHref: "/collections/new", layout: "split", scrim: true }),
          s("lookbook", { heading: "The lookbook", offset: true }),
          s("split_feature", { eyebrow: "The fabric", heading: "Handloom cotton, woven in Tangail", body: "Breathable in humidity, softer with every wash.", ctaLabel: "Read the story", ctaHref: "/blog/handloom", flip: false }),
          s("collection_story", { eyebrow: "Collection", heading: "Everyday tailoring", body: "Twelve pieces that work from office to iftar.", ctaLabel: "See the collection", ctaHref: "/collections/tailoring", scrim: true }),
          s("shoppable_image", { heading: "Shop the look", limit: 4, p1x: 30, p1y: 40, p2x: 60, p2y: 55 }),
          sustain(),
          s("ugc_gallery", { heading: "Worn by you", limit: 8, note: "Tag us to be featured." }),
          s("product_grid", { heading: "This season", limit: 9, columns: 3, cardVariant: "editorial" }, COLS(3)),
          s("testimonial", { quote: "The fit is exactly what the size chart promised.", author: "Verified buyer, Dhaka" }),
        ],
        footer: footer(),
      },
      product: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("product_media", { ratio: "4/3", showThumbnails: true, zoom: true }, { bp: { mobile: { showThumbnails: false } } }),
          s("price_block", { showCompareAt: true, note: "VAT included where applicable." }),
          s("size_selector", { heading: "Select a size", notifyLabel: "Notify me", guideLabel: "Size guide" }),
          s("size_guide", { heading: "Size guide", openLabel: "Open size guide", unit: "cm", c1Label: "Chest", c2Label: "Waist", c3Label: "Length", r1Label: "S", r1c1: 92, r1c2: 76, r1c3: 66, r2Label: "M", r2c1: 98, r2c2: 82, r2c3: 68, r3Label: "L", r3c1: 104, r3c2: 88, r3c3: 70, r4Label: "XL", r4c1: 110, r4c2: 94, r4c3: 72, note: "Measurements are of the garment, laid flat." }),
          s("fit_note", { fit: "true", note: "Relaxed through the shoulder.", modelHeight: "Model is 175cm", modelSize: "Wearing size M" }),
          s("add_to_cart", { label: "Add to bag", showQuantity: true }),
          s("wishlist_button", { addLabel: "Save for later", savedLabel: "Saved", showCount: true }),
          s("back_in_stock", { heading: "Sold out in your size?", body: "We will email you when it returns.", buttonLabel: "Notify me", consentText: "I agree to receive one restock email." }),
          s("care_panel", { heading: "Fabric and care", composition: "100% handloom cotton", care: "Cold hand wash, dry in shade", origin: "Cut and sewn in Dhaka", open: false }),
          sustain(),
          s("complete_the_look", { heading: "Complete the look", limit: 4, buttonLabel: "Add the look" }),
          s("review_list", { heading: "Customer reviews", limit: 5, sort: "recent", verifiedOnly: true, emptyText: "No reviews yet." }),
          s("product_grid", { heading: "You may also like", limit: 3, columns: 3, cardVariant: "editorial" }, COLS(3)),
        ],
        footer: footer(),
      },
      collection: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("category_header", { heading: "The collection", body: "Filter by size, fabric and price.", showCount: true, showBreadcrumb: true, homeLabel: "Home" }),
          s("filter_chips", { clearLabel: "Clear all", emptyText: "No filters applied." }),
          s("facet_sidebar", { heading: "Filters", limit: 10, showCategories: true, showKinds: true, showPrice: true, showStock: true, drawerLabel: "Filters", clearLabel: "Clear all", categoryLabel: "Category", kindLabel: "Type", priceLabel: "Price", stockLabel: "Availability", inStockLabel: "In stock only" }),
          s("result_toolbar", { countLabel: "pieces", showSort: true, showDensity: false, filtersLabel: "Filters", sortLabel: "Sort" }),
          s("product_grid", { heading: "All pieces", limit: 18, columns: 3, cardVariant: "editorial" }, COLS(3)),
          s("pagination", { mode: "more", moreLabel: "Load more", prevLabel: "Previous", nextLabel: "Next", pageLabel: "Page" }),
          s("empty_state", { heading: "Nothing matches those filters", body: "Try removing a filter or two.", clearLabel: "Clear all", showSuggestions: true, limit: 3 }),
        ],
        footer: footer(),
      },
      page: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("page_content", {}),
          s("size_guide", { heading: "Size guide", openLabel: "Open size guide", unit: "cm", c1Label: "Chest", c2Label: "Waist", c3Label: "Length", r1Label: "S", r1c1: 92, r1c2: 76, r1c3: 66, r2Label: "M", r2c1: 98, r2c2: 82, r2c3: 68, r3Label: "L", r3c1: 104, r3c2: 88, r3c3: 70, r4Label: "XL", r4c1: 110, r4c2: 94, r4c3: 72, note: "Measurements are of the garment, laid flat." }),
          s("care_panel", { heading: "Fabric and care", composition: "100% handloom cotton", care: "Cold hand wash, dry in shade", origin: "Cut and sewn in Dhaka", open: true }),
          s("store_locator", { heading: "Visit the studio", s1Name: "Dhanmondi studio", s1Address: "Road 8, Dhanmondi, Dhaka", s1Hours: "11am - 8pm", s2Name: "Gulshan counter", s2Address: "Gulshan 2, Dhaka", s2Hours: "11am - 8pm" }),
        ],
        footer: footer(),
      },
      blog: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("blog_terms", { heading: "", style: "pills", showCounts: true }),
          s("blog_archive", { heading: "", layout: "grid", columns: 3, limit: 9, showCover: true, showExcerpt: true, showMeta: true, emptyText: "No articles yet." }, COLS(3)),
          s("split_feature", { eyebrow: "Behind the seam", heading: "Meet the makers", body: "The families who cut and finish every run.", ctaLabel: "Read the story", ctaHref: "/blog/makers", flip: true }),
          s("blog_pager", { align: "center" }),
          s("newsletter", { heading: "Get the next post", body: "One email when we publish. No spam.", buttonLabel: "Subscribe" }),
        ],
        footer: footer(),
      },
      cart: {
        header: [],
        main: [
          s("free_shipping_bar", { freeShippingLabel: "Add", freeShippingSuffix: "more for free delivery", freeShippingDone: "Free delivery unlocked" }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("heading", { text: "Your bag", level: "h2", align: "left" }),
          s("rich_text", { heading: "", body: "Shipping and COD charges are calculated at checkout." }),
          s("product_grid", { heading: "Add something else", limit: 3, columns: 3, cardVariant: "editorial" }, COLS(3)),
        ],
        footer: footer(),
      },
      checkout: {
        header: [s("banner", { text: "Secure checkout", tone: "info" })],
        main: [
          s("payment_methods", { heading: "", note: "Payments are processed server-side.", emptyText: "No payment method is enabled yet." }),
          s("checkout_steps", { heading: "Checkout", step1: "Bag", step2: "Address", step3: "Payment", step4: "Done", activeStep: 3 }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("delivery_promise", { heading: "Delivery", insideLabel: "Inside Dhaka", insideDays: "1-2 days", outsideLabel: "Outside Dhaka", outsideDays: "2-4 days", note: "Courier charge shown at checkout." }),
        ],
        footer: [
          s("feature_row", { itemOne: "Free size exchange", itemTwo: "bKash / Nagad", itemThree: "Nationwide courier" }),
        ],
      },
    }),
  };
}

/* ----------------------------------------------------------------- circuit */

function circuit(): ThemePreset {
  const k = "circuit";
  const s = bound(k);
  const support = () =>
    s("support_strip", {
      heading: "Service and support",
      t1Title: "Warranty claim",
      t1Body: "Book a service slot online.",
      t2Title: "Service centres",
      t2Body: "Authorised centres in 12 cities.",
      t3Title: "Manuals",
      t3Body: "Download the PDF for any model.",
      t4Title: "Talk to us",
      t4Body: "Every day, 9am to 9pm.",
    });
  const docs = () =>
    s("doc_links", {
      heading: "Documents",
      d1Label: "User manual",
      d1Href: "/docs/manual.pdf",
      d1Meta: "PDF",
      d2Label: "Warranty card",
      d2Href: "/docs/warranty.pdf",
      d2Meta: "PDF",
      d3Label: "Energy rating",
      d3Href: "/docs/energy.pdf",
      d3Meta: "PDF",
    });
  const footer = (): Section[] => [
    s("footer_sitemap", {
      c1Title: "Shop",
      c1Links: "Phones\nLaptops\nAudio",
      c2Title: "Support",
      c2Links: "Warranty\nService centres\nManuals",
      c3Title: "Buying",
      c3Links: "EMI\nTrade-in\nCompare",
      c4Title: "About",
      c4Links: "Our story\nContact us",
    }),
    s("payment_icons", { heading: "Ways to pay", marks: "bKash\nNagad\nVisa\nMastercard\nEMI" }),
    s("rich_text", { heading: "About this store", body: "Official-warranty electronics with published specs, EMI and authorised service." }),
  ];
  const header = (): Section[] => [
    s("announcement_bar", { m1: "0% EMI up to 12 months", m2: "Official warranty on every unit", m3: "Free delivery over BDT 2,000", dismissible: true, rotateMs: 6000 }),
    s("utility_bar", { note: "Price match on official-warranty stock", l1Label: "Compare", l1Href: "/compare", l2Label: "EMI plans", l2Href: "/pages/emi", l3Label: "Service centres", l3Href: "/pages/service", showLanguage: true }),
    s("search_command", { placeholder: "Search by model or spec", buttonLabel: "Search", limit: 8 }),
    s("mega_menu", { label: "All categories", limit: 12, columns: 4 }),
    s("department_strip", { heading: "Shop by category", limit: 10 }),
  ];
  return {
    key: k,
    nameEn: "Circuit",
    nameBn: "সার্কিট",
    summaryEn: "Spec-and-trust electronics theme with comparison tables, EMI and a designed dark mode.",
    summaryBn: "স্পেক ও ভরসার ইলেকট্রনিকস থিম: তুলনা টেবিল, ইএমআই ও ডিজাইন করা ডার্ক মোড।",
    category: "electronics",
    version: "1.0.0",
    api: "^3.0.0",
    sortOrder: 130,
    tokens: tokens({
      brand: "#0EA5E9",
      accent: "#22C55E",
      surface: "#FFFFFF",
      ink: "#0B1220",
      radius: "4px",
      container: "1280px",
      density: "dense",
      typeScale: "compact",
      spaceUnit: "14px",
      digits: "latin",
      dark: { brand: "#38BDF8", accent: "#4ADE80", surface: "#0B1220", ink: "#E2E8F0" },
    }),
    templates: withSearch(k, {
      index: {
        header: header(),
        main: [
          s("hero", { heading: "Electronics with the specs in writing", subheading: "Official warranty, published specs, EMI on the spot.", ctaLabel: "Browse catalogue", ctaHref: "/collections/all", align: "left" }),
          s("deal_strip", { heading: "This week's prices", badgeLabel: "Deal", cardVariant: "compact" }),
          s("spec_highlights", { heading: "Why buy here", columns: 4, t1Label: "Warranty", t1Value: "Official, 12 months", t2Label: "EMI", t2Value: "0% up to 12 months", t3Label: "Service", t3Value: "Authorised centres", t4Label: "Returns", t4Value: "7-day returns" }),
          s("compare_table", { caption: "Compare the top picks", r1Label: "Display", r2Label: "Processor", r3Label: "Battery", r4Label: "Warranty" }),
          s("rank_list", { heading: "Best sellers this week" }),
          s("brand_rail", { heading: "Official brand partners" }),
          s("product_grid", { heading: "Popular models", limit: 12, columns: 4, showRating: true }, COLS(4)),
          s("authenticity_badge", { label: "Official warranty stock", note: "Serial numbers are registered with the brand.", verified: true }),
          support(),
          docs(),
        ],
        footer: footer(),
      },
      product: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("product_media", { ratio: "1/1", showThumbnails: true, zoom: true }, { bp: { mobile: { showThumbnails: false } } }),
          s("price_block", { showCompareAt: true, note: "VAT included where applicable." }),
          s("variant_picker", { heading: "Configuration", mode: "matrix", axisOneLabel: "Storage", axisTwoLabel: "Colour" }),
          s("add_to_cart", { label: "Add to cart", showQuantity: true }),
          s("stock_delivery", { lowStockAt: 3, cutOff: "Order before 6pm" }),
          s("emi_calculator", { heading: "EMI options", note: "Bank EMI is confirmed at checkout.", perMonthLabel: "per month", emptyText: "EMI is not available on this item." }),
          s("price_sparkline", { heading: "Price history", summary: "Lowest price in the last 90 days.", days: 90, emptyText: "No price history yet." }),
          s("spec_table", { caption: "Full specifications", columnLabel: "Specification", grouped: true }),
          s("spec_highlights", { heading: "At a glance", columns: 4, t1Label: "Display", t1Value: "As listed in specs", t2Label: "Battery", t2Value: "As listed in specs", t3Label: "Warranty", t3Value: "Official, 12 months", t4Label: "Processor", t4Value: "As listed in specs" }),
          s("warranty_panel", { heading: "Warranty", months: 12, coverage: "Manufacturing defects, parts and labour.", official: true, officialLabel: "Official warranty", parallelLabel: "Parallel import", s1Name: "Dhaka service centre", s1Address: "Panthapath, Dhaka", s2Name: "Chattogram service centre", s2Address: "Agrabad, Chattogram" }),
          s("authenticity_badge", { label: "Official warranty stock", note: "Serial numbers are registered with the brand.", verified: true }),
          docs(),
          s("trade_in", { heading: "Trade in your old device", body: "Send the model and condition; we quote within a day.", buttonLabel: "Request a quote", pendingText: "Sending...", consentText: "I agree to be contacted about this quote." }),
          s("bundle_builder", { heading: "Build your bundle", limit: 4, buttonLabel: "Add bundle", note: "Bundle totals are calculated on the server." }),
          s("compare_tray", { heading: "Compare", compareLabel: "Compare now", clearLabel: "Clear", emptyText: "Add products to compare.", compareHref: "/compare", limit: 4 }),
          s("rating_summary", { heading: "Ratings", showHistogram: true, verifiedOnly: true }),
          s("review_list", { heading: "Customer reviews", limit: 5, sort: "recent", verifiedOnly: true, emptyText: "No reviews yet." }),
          s("product_qna", { heading: "Questions and answers", askLabel: "Ask a question", askHref: "/help" }),
        ],
        footer: footer(),
      },
      collection: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("category_header", { heading: "Browse the category", body: "Filter by spec, brand and price.", showCount: true, showBreadcrumb: true, homeLabel: "Home" }),
          s("facet_sidebar", { heading: "Filters", limit: 12, showCategories: true, showKinds: true, showPrice: true, showStock: true, drawerLabel: "Filters", clearLabel: "Clear all", categoryLabel: "Category", kindLabel: "Type", priceLabel: "Price", stockLabel: "Availability", inStockLabel: "In stock only" }),
          s("result_toolbar", { countLabel: "models", showSort: true, showDensity: true, filtersLabel: "Filters", sortLabel: "Sort" }),
          s("filter_chips", { clearLabel: "Clear all", emptyText: "No filters applied." }),
          s("compare_table", { caption: "Compare the top picks", r1Label: "Display", r2Label: "Processor", r3Label: "Battery", r4Label: "Warranty" }),
          s("product_grid", { heading: "All models", limit: 24, columns: 4, showRating: true }, COLS(4)),
          s("compare_tray", { heading: "Compare", compareLabel: "Compare now", clearLabel: "Clear", emptyText: "Add products to compare.", compareHref: "/compare", limit: 4 }),
          s("pagination", { mode: "numbered", moreLabel: "Load more", prevLabel: "Previous", nextLabel: "Next", pageLabel: "Page" }),
          s("empty_state", { heading: "Nothing matches those filters", body: "Try removing a filter or two.", clearLabel: "Clear all", showSuggestions: true, limit: 4 }),
        ],
        footer: footer(),
      },
      page: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("page_content", {}),
          s("how_to_use", { heading: "Set up your new device", s1Title: "Charge fully", s1Body: "Charge to 100% before the first use.", s2Title: "Sign in", s2Body: "Use your own account, never the shop's.", s3Title: "Register warranty", s3Body: "Register the serial number within 7 days.", s4Title: "Update", s4Body: "Install the latest firmware.", ...GUIDE_AUTHOR }),
          docs(),
          support(),
          s("store_locator", { heading: "Service centres", s1Name: "Dhaka service centre", s1Address: "Panthapath, Dhaka", s1Hours: "10am - 7pm", s2Name: "Chattogram service centre", s2Address: "Agrabad, Chattogram", s2Hours: "10am - 7pm", s3Name: "Sylhet service point", s3Address: "Zindabazar, Sylhet", s3Hours: "10am - 6pm" }),
        ],
        footer: footer(),
      },
      blog: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("blog_terms", { heading: "", style: "pills", showCounts: true }),
          s("blog_archive", { heading: "", layout: "grid", columns: 3, limit: 9, showCover: true, showExcerpt: true, showMeta: true, emptyText: "No articles yet." }, COLS(3)),
          s("buying_guide", { heading: "How to choose a laptop in Bangladesh", body: "Match the processor to the work, not the price tag; then check warranty and service coverage.", l1Label: "Processors explained", l1Href: "/blog/processors", l2Label: "Battery and cooling", l2Href: "/blog/battery", l3Label: "Warranty vs parallel import", l3Href: "/blog/warranty", ...GUIDE_AUTHOR }),
          s("blog_pager", { align: "center" }),
          s("newsletter", { heading: "Get the next post", body: "One email when we publish. No spam.", buttonLabel: "Subscribe" }),
        ],
        footer: footer(),
      },
      cart: {
        header: [],
        main: [
          s("free_shipping_bar", { freeShippingLabel: "Add", freeShippingSuffix: "more for free delivery", freeShippingDone: "Free delivery unlocked" }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("heading", { text: "Your cart", level: "h2", align: "left" }),
          s("notice", { text: "EMI plans are confirmed with your bank at checkout.", tone: "info" }),
          s("product_grid", { heading: "Add something else", limit: 4, columns: 4 }, COLS(4)),
          s("payment_icons", { heading: "Ways to pay", marks: "bKash\nNagad\nVisa\nMastercard\nEMI" }),
        ],
        footer: footer(),
      },
      checkout: {
        header: [s("banner", { text: "Secure checkout", tone: "info" })],
        main: [
          s("payment_methods", { heading: "", note: "Payments are processed server-side.", emptyText: "No payment method is enabled yet." }),
          s("checkout_steps", { heading: "Checkout", step1: "Cart", step2: "Address", step3: "Payment", step4: "Done", activeStep: 3 }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("delivery_promise", { heading: "Delivery", insideLabel: "Inside Dhaka", insideDays: "1-2 days", outsideLabel: "Outside Dhaka", outsideDays: "2-4 days", note: "Courier charge shown at checkout." }),
          s("notice", { text: "EMI plans are confirmed with your bank at checkout.", tone: "info" }),
        ],
        footer: [support()],
      },
    }),
  };
}

/* ---------------------------------------------------------------- rupaboti */

function rupaboti(): ThemePreset {
  const k = "rupaboti";
  const s = bound(k);
  const claims = () =>
    s("claim_chips", {
      heading: "Tested claims",
      c1Label: "Dermatologist tested",
      c1Source: "Clinical panel, 2026",
      c2Label: "Non-comedogenic",
      c2Source: "Lab report, 2026",
      c3Label: "Fragrance free",
      c3Source: "Formulation sheet",
      c4Label: "Cruelty free",
      c4Source: "Supplier declaration",
    });
  const consult = () =>
    s("consult_cta", {
      heading: "Not sure what suits you?",
      body: "Send a photo and your concerns; our advisor replies the same day.",
      whatsappLabel: "Chat on WhatsApp",
      callLabel: "Call the advisor",
      fieldLabel: "Your skin concern",
      buttonLabel: "Request a consult",
      pendingText: "Sending...",
      consentText: "I agree to be contacted about this request.",
    });
  const footer = (): Section[] => [
    s("footer_sitemap", {
      c1Title: "Shop",
      c1Links: "Skincare\nMakeup\nHair",
      c2Title: "Guides",
      c2Links: "Routine builder\nIngredients\nShade finder",
      c3Title: "Help",
      c3Links: "Delivery\nReturns\nContact us",
      c4Title: "About",
      c4Links: "Our story\nSafety",
    }),
    s("payment_icons", { heading: "Ways to pay", marks: "bKash\nNagad\nRocket\nVisa" }),
    s("social_strip", { heading: "Follow for routines" }),
    s("rich_text", { heading: "About this store", body: "Authentic beauty with batch codes, full ingredient lists and honest shade matching." }),
  ];
  const header = (): Section[] => [
    s("announcement_bar", { m1: "Free samples on orders over BDT 1,500", m2: "Authentic stock with batch codes", m3: "Free delivery over BDT 2,000", dismissible: true, rotateMs: 7000 }),
    s("utility_bar", { note: "Advisor available 10am to 8pm", l1Label: "Shade finder", l1Href: "/pages/shade-finder", l2Label: "Ingredients", l2Href: "/pages/ingredients", l3Label: "Contact us", l3Href: "/pages/contact", showLanguage: true }),
    s("search_command", { placeholder: "Search by concern or ingredient", buttonLabel: "Search", limit: 6 }),
    s("mega_menu", { label: "Shop all", limit: 10, columns: 3 }),
  ];
  return {
    key: k,
    nameEn: "Rupaboti",
    nameBn: "রূপবতী",
    summaryEn: "Guided beauty selling: shade finder, skin quiz, ingredient transparency and routines.",
    summaryBn: "গাইডেড বিউটি সেলিং: শেড ফাইন্ডার, স্কিন কুইজ, উপাদানের স্বচ্ছতা ও রুটিন।",
    category: "beauty",
    version: "1.0.0",
    api: "^3.0.0",
    sortOrder: 140,
    tokens: tokens({ brand: "#9D174D", accent: "#B45309", surface: "#FFF7FA", ink: "#3F1D2E", radius: "16px", container: "1200px", density: "comfortable", typeScale: "expressive", spaceUnit: "20px" }),
    templates: withSearch(k, {
      index: {
        header: header(),
        main: [
          s("editorial_hero", { eyebrow: "Skin first", heading: "Beauty that matches your skin", body: "Shade matched, ingredient transparent, batch coded.", ctaLabel: "Find your shade", ctaHref: "/pages/shade-finder", layout: "split", scrim: true }),
          s("shade_finder", { heading: "Find your shade", undertonePrompt: "Pick your undertone", depthPrompt: "Pick your depth", emptyText: "No match yet — try another depth." }),
          s("skin_quiz", { heading: "Two-minute skin quiz", body: "Four questions, one routine.", typePrompt: "Your skin type", concernPrompt: "Your main concern", sensitivityPrompt: "How sensitive is your skin?", finishPrompt: "Finish you prefer", resultText: "Here is a routine for you.", resultLabel: "See my routine", resultPath: "/collections/routine" }),
          claims(),
          s("before_after", { heading: "Eight weeks of use", beforeLabel: "Week 0", afterLabel: "Week 8", disclaimer: "Individual results vary. Photos are unretouched and taken in the same light." }),
          s("texture_strip", { heading: "How it feels", t1Label: "Gel", t2Label: "Cream", t3Label: "Serum", t4Label: "Balm" }),
          s("collection_grid", { heading: "Shop by category", limit: 8, columns: 4 }, COLS(4)),
          s("product_rail", { heading: "Best sellers this week", source: "bestsellers", showRating: true, cardVariant: "standard" }),
          s("routine_builder", { heading: "Build your routine", amLabel: "Morning", pmLabel: "Evening", swapLabel: "Swap", addAllLabel: "Add the routine", note: "Routine totals are calculated on the server.", limit: 6 }),
          s("sample_picker", { heading: "Pick a free sample", thresholdText: "Free on orders over BDT 1,500", limit: 4 }),
          s("ingredient_glossary", { heading: "Ingredient glossary", g1Term: "Niacinamide", g1Body: "Evens tone and supports the barrier.", g2Term: "Hyaluronic acid", g2Body: "Holds water in the upper layers of skin.", g3Term: "Salicylic acid", g3Body: "Clears pores; use at night.", g4Term: "SPF", g4Body: "Sun protection factor; reapply every few hours." }),
          s("loyalty_strip", { label: "Earn points on every order" }),
          s("ugc_gallery", { heading: "Worn by you", limit: 8, note: "Tag us to be featured." }),
          s("testimonial", { quote: "The shade match was right the first time.", author: "Verified buyer, Dhaka" }),
          consult(),
        ],
        footer: footer(),
      },
      product: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("product_media", { ratio: "1/1", showThumbnails: true, zoom: true }, { bp: { mobile: { showThumbnails: false } } }),
          s("price_block", { showCompareAt: true, note: "VAT included where applicable." }),
          s("variant_picker", { heading: "Choose your shade", mode: "shade", axisOneLabel: "Shade" }),
          s("add_to_cart", { label: "Add to bag", showQuantity: true }),
          claims(),
          s("ingredient_list", { heading: "Ingredients", i1Name: "Niacinamide", i1Amount: "5%", i1Gloss: "Evens tone and supports the barrier.", i2Name: "Hyaluronic acid", i2Amount: "2%", i2Gloss: "Holds water in the upper layers of skin.", i3Name: "Panthenol", i3Amount: "1%", i3Gloss: "Soothes and reduces tightness.", inciLabel: "Full INCI list", inci: "Aqua, Niacinamide, Sodium Hyaluronate, Panthenol, Glycerin" }),
          s("how_to_use", { heading: "How to use", s1Title: "Cleanse", s1Body: "Wash with lukewarm water and pat dry.", s2Title: "Apply", s2Body: "Two drops on damp skin, morning and night.", s3Title: "Moisturise", s3Body: "Seal with your usual moisturiser.", s4Title: "Protect", s4Body: "Use SPF every morning.", ...GUIDE_AUTHOR }),
          s("safety_note", { heading: "Safety", body: "Patch test on the inner arm for 24 hours before first use.", howTo: "Apply a small amount, wait a day, check for redness.", howToLabel: "How to patch test" }),
          s("batch_info", { heading: "Batch and expiry", mfgLabel: "Manufactured", mfgDate: "2026-01-15", expiryLabel: "Best before", expiryDate: "2028-01-15", batchLabel: "Batch", batchCode: "RB-2601-A", paoMonths: 12 }),
          s("texture_strip", { heading: "How it feels", t1Label: "Gel", t2Label: "Cream", t3Label: "Serum" }),
          s("refill_widget", { heading: "Subscribe and refill", body: "Pick a cadence; skip or cancel any time.", c1Label: "Every 30 days", c1Value: "30", c2Label: "Every 60 days", c2Value: "60", c3Label: "Every 90 days", c3Value: "90", buttonLabel: "Start refills" }),
          s("gift_builder", { heading: "Make it a gift", size: 3, messageLabel: "Gift message", buttonLabel: "Add the gift box", note: "Gift box totals are calculated on the server.", limit: 6 }),
          s("rating_summary", { heading: "Ratings", showHistogram: true, verifiedOnly: true }),
          s("review_list", { heading: "Customer reviews", limit: 5, sort: "recent", verifiedOnly: true, emptyText: "No reviews yet." }),
          s("product_qna", { heading: "Questions and answers", askLabel: "Ask a question", askHref: "/help" }),
          s("sticky_buy_bar", { label: "Add to bag", showPrice: true, dockAfter: 400 }),
        ],
        footer: footer(),
      },
      collection: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("category_header", { heading: "Shop the range", body: "Filter by concern, finish and price.", showCount: true, showBreadcrumb: true, homeLabel: "Home" }),
          s("shade_finder", { heading: "Find your shade", undertonePrompt: "Pick your undertone", depthPrompt: "Pick your depth", emptyText: "No match yet — try another depth." }),
          s("facet_sidebar", { heading: "Filters", limit: 10, showCategories: true, showKinds: true, showPrice: true, showStock: true, drawerLabel: "Filters", clearLabel: "Clear all", categoryLabel: "Category", kindLabel: "Type", priceLabel: "Price", stockLabel: "Availability", inStockLabel: "In stock only" }),
          s("filter_chips", { clearLabel: "Clear all", emptyText: "No filters applied." }),
          s("result_toolbar", { countLabel: "products", showSort: true, showDensity: false, filtersLabel: "Filters", sortLabel: "Sort" }),
          s("product_grid", { heading: "All products", limit: 18, columns: 3, showRating: true }, COLS(3)),
          s("pagination", { mode: "more", moreLabel: "Load more", prevLabel: "Previous", nextLabel: "Next", pageLabel: "Page" }),
          s("empty_state", { heading: "Nothing matches those filters", body: "Try removing a filter or two.", clearLabel: "Clear all", showSuggestions: true, limit: 3 }),
        ],
        footer: footer(),
      },
      page: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("page_content", {}),
          s("ingredient_glossary", { heading: "Ingredient glossary", g1Term: "Niacinamide", g1Body: "Evens tone and supports the barrier.", g2Term: "Hyaluronic acid", g2Body: "Holds water in the upper layers of skin.", g3Term: "Salicylic acid", g3Body: "Clears pores; use at night.", g4Term: "SPF", g4Body: "Sun protection factor; reapply every few hours." }),
          s("safety_note", { heading: "Safety", body: "Patch test on the inner arm for 24 hours before first use.", howTo: "Apply a small amount, wait a day, check for redness.", howToLabel: "How to patch test" }),
          s("store_locator", { heading: "Beauty counters", s1Name: "Dhanmondi counter", s1Address: "Road 27, Dhanmondi, Dhaka", s1Hours: "11am - 8pm", s2Name: "Uttara counter", s2Address: "Sector 7, Uttara, Dhaka", s2Hours: "11am - 8pm" }),
          consult(),
        ],
        footer: footer(),
      },
      blog: {
        header: [s("breadcrumb", { homeLabel: "Home" })],
        main: [
          s("blog_terms", { heading: "", style: "pills", showCounts: true }),
          s("blog_archive", { heading: "", layout: "grid", columns: 3, limit: 9, showCover: true, showExcerpt: true, showMeta: true, emptyText: "No articles yet." }, COLS(3)),
          s("quiz", { heading: "Which routine fits you?", resultBase: "/collections/routine", resultLabel: "See my routine", q1Key: "type", q1Label: "Your skin type", q1Choices: "Oily,Dry,Combination", q2Key: "concern", q2Label: "Your main concern", q2Choices: "Acne,Dullness,Dryness", q3Key: "finish", q3Label: "Finish you prefer", q3Choices: "Matte,Dewy" }),
          s("blog_pager", { align: "center" }),
          s("newsletter", { heading: "Get the next post", body: "One email when we publish. No spam.", buttonLabel: "Subscribe" }),
        ],
        footer: footer(),
      },
      cart: {
        header: [],
        main: [
          s("free_shipping_bar", { freeShippingLabel: "Add", freeShippingSuffix: "more for free delivery", freeShippingDone: "Free delivery unlocked" }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("heading", { text: "Your bag", level: "h2", align: "left" }),
          s("sample_picker", { heading: "Pick a free sample", thresholdText: "Free on orders over BDT 1,500", limit: 4 }),
          s("product_grid", { heading: "Add something else", limit: 3, columns: 3 }, COLS(3)),
          s("payment_icons", { heading: "Ways to pay", marks: "bKash\nNagad\nRocket\nVisa" }),
        ],
        footer: footer(),
      },
      checkout: {
        header: [s("banner", { text: "Secure checkout", tone: "info" })],
        main: [
          s("payment_methods", { heading: "", note: "Payments are processed server-side.", emptyText: "No payment method is enabled yet." }),
          s("checkout_steps", { heading: "Checkout", step1: "Bag", step2: "Address", step3: "Payment", step4: "Done", activeStep: 3 }),
          s("cart_lines", { heading: "" }),
          s("cart_summary", { heading: "Order summary" }),
          s("delivery_promise", { heading: "Delivery", insideLabel: "Inside Dhaka", insideDays: "1-2 days", outsideLabel: "Outside Dhaka", outsideDays: "2-4 days", note: "Courier charge shown at checkout." }),
        ],
        footer: [
          s("feature_row", { itemOne: "Authentic stock", itemTwo: "bKash / Nagad", itemThree: "Nationwide courier" }),
        ],
      },
    }),
  };
}

/** The four blueprint themes, in registry sort order. */
export const BLUEPRINT_PRESETS: ThemePreset[] = [bazaar(), atelier(), circuit(), rupaboti()];

/** Blueprint keys, for demo content and docs. */
export const BLUEPRINT_KEYS = BLUEPRINT_PRESETS.map((preset) => preset.key);

/**
 * Blueprints registered in `THEME_PRESETS`. A blueprint only joins the
 * catalogue once every authored string has a বাংলা twin, so the translation
 * publish gate can never be tripped by a shipped preset.
 */
export const SHIPPED_BLUEPRINT_KEYS = ["bazaar", "atelier", "circuit", "rupaboti"] as const;

export const SHIPPED_BLUEPRINTS: ThemePreset[] = BLUEPRINT_PRESETS.filter((preset) =>
  (SHIPPED_BLUEPRINT_KEYS as readonly string[]).includes(preset.key),
);

export type BlueprintKey = (typeof BLUEPRINT_KEYS)[number];

export function blueprintTemplates(key: string): Record<TemplateKey, ThemeAst> | undefined {
  return BLUEPRINT_PRESETS.find((preset) => preset.key === key)?.templates;
}