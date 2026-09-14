/**
 * Official theme presets (BUILD 2.3 phase C).
 *
 * Typed source of truth for the ten platform themes. Every preset ships a
 * complete template hierarchy (index, product, collection, page, blog, cart,
 * checkout) with header/main/footer slots, responsive breakpoint overrides and
 * the context widgets each template requires. The seed migration for
 * `public.theme_registry` is generated from this file so SQL and runtime can
 * never drift.
 */
import { DEFAULT_TOKENS } from "./builder-ast";
import type { Breakpoint, PropValue, Section, SectionType, TemplateKey, ThemeAst, ThemeTokens } from "./builder-ast";
import { PRESET_BN } from "./theme-presets.bn";
import { sectionFactory } from "./theme-section";
import { SHIPPED_BLUEPRINTS } from "./theme-blueprints";

type Extras = { hidden?: Breakpoint[]; bp?: Partial<Record<Breakpoint, Record<string, PropValue>>> };

const s: (key: string, type: SectionType, props: Record<string, PropValue>, extras?: Extras) => Section =
  sectionFactory(PRESET_BN);


export type ThemePreset = {
  key: string;
  nameEn: string;
  nameBn: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  version: string;
  /** Builder API range this preset's AST is built against (Phase 8 registry versioning). */
  api: string;
  sortOrder: number;
  tokens: ThemeTokens;
  templates: Record<TemplateKey, ThemeAst>;
};

type Spec = {
  key: string;
  nameEn: string;
  nameBn: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  sortOrder: number;
  tokens: Partial<ThemeTokens> & Pick<ThemeTokens, "brand" | "accent" | "surface" | "ink">;
  /** Announcement strip copy. */
  banner: string;
  bannerTone: "info" | "warn" | "success";
  hero: string;
  sub: string;
  ctaLabel: string;
  about: string;
  /** Grid density on the home page and collection template. */
  columns: number;
  /** Phase 8: blog archive layout variant. Defaults per theme key. */
  blogLayout?: "grid" | "list" | "magazine" | "minimal";
  gridHeading: string;
  heroAlign: "left" | "center";
  /** Extra home-page sections appended after the featured grid. */
  homeExtras?: (key: string) => Section[];
  /** Extra product-page sections appended after the standard stack. */
  productExtras?: (key: string) => Section[];
  addToCartLabel: string;
  faq: { q1: string; a1: string; q2: string; a2: string; q3: string; a3: string };
  trust: [string, string, string];
};

const RESPONSIVE_COLS = (desktop: number): Extras => ({
  bp: { tablet: { columns: Math.max(2, desktop - 1) }, mobile: { columns: 2 } },
});

function header(spec: Spec): Section[] {
  return [
    s(spec.key, "banner", { text: spec.banner, tone: spec.bannerTone }),
    s(spec.key, "marquee", { text: spec.sub, speed: 34 }, { hidden: ["mobile"] }),
  ];
}

function footer(spec: Spec): Section[] {
  return [
    s(spec.key, "feature_row", { itemOne: spec.trust[0], itemTwo: spec.trust[1], itemThree: spec.trust[2] }),
    s(spec.key, "newsletter", {
      heading: "Stay in touch",
      body: "Offers and new arrivals by email. Unsubscribe any time.",
      buttonLabel: "Subscribe",
    }),
    s(spec.key, "rich_text", { heading: "About this store", body: spec.about }),
  ];
}

function indexTemplate(spec: Spec): ThemeAst {
  return {
    header: header(spec),
    main: [
      s(
        spec.key,
        "hero",
        {
          heading: spec.hero,
          subheading: spec.sub,
          ctaLabel: spec.ctaLabel,
          ctaHref: "#products",
          align: spec.heroAlign,
        },
        { bp: { mobile: { align: "left" } } },
      ),
      s(spec.key, "feature_row", { itemOne: spec.trust[0], itemTwo: spec.trust[1], itemThree: spec.trust[2] }),
      s(
        spec.key,
        "collection_grid",
        { heading: "Shop by category", limit: 8, columns: Math.min(4, spec.columns) },
        RESPONSIVE_COLS(Math.min(4, spec.columns)),
      ),
      s(
        spec.key,
        "product_grid",
        { heading: spec.gridHeading, limit: spec.columns * 3, columns: spec.columns },
        RESPONSIVE_COLS(spec.columns),
      ),
      ...(spec.homeExtras?.(spec.key) ?? []),
      s(spec.key, "testimonial", {
        quote: "Ordered in the morning, delivered the next day. Exactly as described.",
        author: "Verified buyer, Dhaka",
      }),
    ],
    footer: footer(spec),
  };
}

function productTemplate(spec: Spec): ThemeAst {
  return {
    header: [s(spec.key, "breadcrumb", { homeLabel: "Home" })],
    main: [
      s(
        spec.key,
        "product_media",
        { ratio: "1/1", showThumbnails: true },
        { bp: { mobile: { showThumbnails: false } } },
      ),
      s(spec.key, "price_block", { showCompareAt: true, note: "VAT included where applicable." }),
      s(spec.key, "add_to_cart", { label: spec.addToCartLabel, showQuantity: true }),
      s(spec.key, "product_meta", { heading: "Product details" }),
      ...(spec.productExtras?.(spec.key) ?? []),
      s(spec.key, "faq", { heading: "Delivery and returns", ...spec.faq }),
      s(
        spec.key,
        "product_grid",
        { heading: "You may also like", limit: spec.columns, columns: spec.columns },
        RESPONSIVE_COLS(spec.columns),
      ),
    ],
    footer: footer(spec),
  };
}

function collectionTemplate(spec: Spec): ThemeAst {
  return {
    header: [s(spec.key, "breadcrumb", { homeLabel: "Home" })],
    main: [
      s(spec.key, "heading", { text: "Collections", level: "h2", align: "left" }),
      s(
        spec.key,
        "collection_grid",
        { heading: "", limit: 12, columns: Math.min(4, spec.columns) },
        RESPONSIVE_COLS(Math.min(4, spec.columns)),
      ),
      s(
        spec.key,
        "product_grid",
        { heading: spec.gridHeading, limit: spec.columns * 4, columns: spec.columns },
        RESPONSIVE_COLS(spec.columns),
      ),
    ],
    footer: footer(spec),
  };
}

/**
 * Search results. Structurally a collection listing, but headed by the query
 * so a shopper always sees what was searched for — and, being a real theme
 * part, a merchant can restyle or extend it like any other page.
 */
function searchTemplate(spec: Spec): ThemeAst {
  return {
    header: [s(spec.key, "breadcrumb", { homeLabel: "Home" })],
    main: [
      s(spec.key, "heading", { text: "Search results", level: "h1", align: "left" }),
      s(
        spec.key,
        "product_grid",
        { heading: "", limit: spec.columns * 4, columns: spec.columns },
        RESPONSIVE_COLS(spec.columns),
      ),
    ],
    footer: footer(spec),
  };
}

function pageTemplate(spec: Spec): ThemeAst {
  return {
    header: [s(spec.key, "breadcrumb", { homeLabel: "Home" })],
    main: [
      s(spec.key, "page_content", {}),
      s(spec.key, "faq", { heading: "Common questions", ...spec.faq }),
    ],
    footer: footer(spec),
  };
}

/**
 * Phase 8: the blog archive is a builder template like any other — a topic
 * rail, the listing widget in the theme's own layout, and pagination. The
 * reader routes feed it live articles, so a merchant can restyle the blog
 * without touching code.
 */
const BLOG_LAYOUT: Record<string, "grid" | "list" | "magazine" | "minimal"> = {
  classic: "grid",
  atelier: "magazine",
  circuit: "list",
  rupaboti: "grid",
  bazaar: "list",
};

function blogTemplate(spec: Spec): ThemeAst {
  const layout = spec.blogLayout ?? BLOG_LAYOUT[spec.key] ?? "grid";
  return {
    header: [s(spec.key, "breadcrumb", { homeLabel: "Home" })],
    main: [
      s(spec.key, "blog_terms", { heading: "", style: "pills", showCounts: true }),
      s(
        spec.key,
        "blog_archive",
        {
          heading: "",
          layout,
          columns: Math.min(spec.columns, 3),
          limit: 9,
          showCover: true,
          showExcerpt: layout !== "minimal",
          showMeta: true,
          emptyText: "No articles yet.",
        },
        RESPONSIVE_COLS(Math.min(spec.columns, 3)),
      ),
      s(spec.key, "blog_pager", { align: "center" }),
      s(spec.key, "newsletter", {
        heading: "Get the next post",
        body: "One email when we publish. No spam.",
        buttonLabel: "Subscribe",
      }),
    ],
    footer: footer(spec),
  };
}

function cartTemplate(spec: Spec): ThemeAst {
  return {
    header: [s(spec.key, "banner", { text: spec.trust[0], tone: "success" })],
    main: [
      s(spec.key, "heading", { text: "Your cart", level: "h2", align: "left" }),
      s(spec.key, "cart_lines", { heading: "" }),
      s(spec.key, "cart_summary", { heading: "Order summary" }),
      s(spec.key, "rich_text", { heading: "", body: "Shipping and COD charges are calculated at checkout." }),
      s(
        spec.key,
        "product_grid",
        { heading: "Add something else", limit: spec.columns, columns: spec.columns },
        RESPONSIVE_COLS(spec.columns),
      ),
    ],
    footer: footer(spec),
  };
}

function checkoutTemplate(spec: Spec): ThemeAst {
  return {
    header: [s(spec.key, "banner", { text: "Secure checkout", tone: "info" })],
    main: [
      s(spec.key, "heading", { text: "Checkout", level: "h2", align: "left" }),
      s(spec.key, "checkout_steps", {
        heading: "",
        step1: "Cart",
        step2: "Details",
        step3: "Payment",
        step4: "Done",
        activeStep: 3,
      }),
      s(spec.key, "cart_lines", { heading: "" }),
      s(spec.key, "cart_summary", { heading: "Order summary" }),
      s(spec.key, "payment_methods", { heading: "", note: "Choose a method at the final step." }),
      s(spec.key, "rich_text", {
        heading: "",
        body: "Payments are processed server-side. We never store your mobile wallet PIN.",
      }),
    ],
    footer: [
      s(spec.key, "feature_row", { itemOne: spec.trust[0], itemTwo: spec.trust[1], itemThree: spec.trust[2] }),
    ],
  };
}

function build(spec: Spec): ThemePreset {
  return {
    key: spec.key,
    nameEn: spec.nameEn,
    nameBn: spec.nameBn,
    summaryEn: spec.summaryEn,
    summaryBn: spec.summaryBn,
    category: spec.category,
    version: "2.0.0",
    api: "^3.0.0",
    sortOrder: spec.sortOrder,
    tokens: { ...DEFAULT_TOKENS, ...spec.tokens },
    templates: {
      index: indexTemplate(spec),
      product: productTemplate(spec),
      collection: collectionTemplate(spec),
      search: searchTemplate(spec),
      page: pageTemplate(spec),
      blog: blogTemplate(spec),
      cart: cartTemplate(spec),
      checkout: checkoutTemplate(spec),
    },
  };
}

const DEFAULT_FAQ = {
  q1: "How long does delivery take?",
  a1: "Inside Dhaka 1-2 working days, outside Dhaka 2-4 working days.",
  q2: "Can I return an item?",
  a2: "Yes, within 7 days of delivery in unused condition.",
  q3: "Which payments do you accept?",
  a3: "Cash on delivery, bKash, Nagad and Rocket.",
};

const SPECS: Spec[] = [
  {
    key: "classic",
    nameEn: "Classic",
    nameBn: "ক্লাসিক",
    summaryEn: "Timeless shop layout with a wide product grid and full template set.",
    summaryBn: "প্রশস্ত প্রোডাক্ট গ্রিডসহ চিরন্তন লেআউট, সম্পূর্ণ টেমপ্লেট সেট।",
    category: "general",
    sortOrder: 10,
    tokens: { brand: "#0F766E", accent: "#0D9488", surface: "#FFFFFF", ink: "#0F172A", radius: "8px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1200px", density: "comfortable", typeScale: "default", spaceUnit: "16px" },
    banner: "Free delivery over BDT 2,000",
    bannerTone: "info",
    hero: "Everyday essentials, delivered",
    sub: "Trusted local shopping since day one.",
    ctaLabel: "Shop now",
    about: "A neighbourhood shop online: honest prices, quick delivery and easy returns.",
    columns: 4,
    gridHeading: "Featured products",
    heroAlign: "left",
    addToCartLabel: "Add to cart",
    faq: DEFAULT_FAQ,
    trust: ["Cash on delivery", "bKash / Nagad", "Nationwide courier"],
  },
  {
    key: "modern",
    nameEn: "Modern",
    nameBn: "মডার্ন",
    summaryEn: "Airy editorial layout with large type and lookbook imagery.",
    summaryBn: "বড় টাইপোগ্রাফি ও এডিটোরিয়াল ধাঁচের খোলামেলা লেআউট।",
    category: "general",
    sortOrder: 20,
    tokens: { brand: "#111827", accent: "#0F766E", surface: "#FAFAF9", ink: "#111827", radius: "2px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1140px", density: "airy", typeScale: "expressive", spaceUnit: "24px" },
    banner: "New season drop is live",
    bannerTone: "info",
    hero: "Designed for the everyday",
    sub: "Modern goods, made close to home.",
    ctaLabel: "See the edit",
    about: "Considered products from local makers, photographed honestly and priced fairly.",
    columns: 3,
    gridHeading: "The edit",
    heroAlign: "center",
    homeExtras: (k) => [
      s(k, "rich_text", { heading: "Made nearby", body: "Every item is sourced from workshops within Bangladesh." }),
    ],
    addToCartLabel: "Add to bag",
    faq: DEFAULT_FAQ,
    trust: ["Free returns in 7 days", "bKash / Nagad", "Carbon-light courier"],
  },
  {
    key: "landing",
    nameEn: "Landing",
    nameBn: "ল্যান্ডিং",
    summaryEn: "Single-product conversion page with urgency and proof blocks.",
    summaryBn: "আরজেন্সি ও প্রুফ ব্লকসহ একক প্রোডাক্টের কনভার্শন পেজ।",
    category: "landing",
    sortOrder: 30,
    tokens: { brand: "#B91C1C", accent: "#0F766E", surface: "#FFFFFF", ink: "#111827", radius: "12px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "960px", density: "comfortable", typeScale: "expressive", spaceUnit: "20px" },
    banner: "Limited launch offer",
    bannerTone: "warn",
    hero: "One product. Done right.",
    sub: "A focused page built to convert.",
    ctaLabel: "Order now",
    about: "One hero product, explained clearly, with delivery you can rely on.",
    columns: 2,
    gridHeading: "Bundle and save",
    heroAlign: "center",
    homeExtras: (k) => [
      s(k, "faq", { heading: "Before you order", ...DEFAULT_FAQ }),
      s(k, "rich_text", { heading: "Why customers choose us", body: "Straight pricing, real photos and a 7-day return window." }),
    ],
    productExtras: (k) => [
      s(k, "testimonial", { quote: "Worth every taka. The build quality surprised me.", author: "Rafiq, Chattogram" }),
    ],
    addToCartLabel: "Buy now",
    faq: DEFAULT_FAQ,
    trust: ["7-day returns", "Cash on delivery", "Verified reviews"],
  },
  {
    key: "heavy-shop",
    nameEn: "Heavy shop",
    nameBn: "হেভি শপ",
    summaryEn: "Dense catalogue built for large inventories and fast scanning.",
    summaryBn: "বড় ইনভেন্টরির জন্য ঘন ক্যাটালগ ও দ্রুত ব্রাউজিং।",
    category: "general",
    sortOrder: 40,
    tokens: { brand: "#1D4ED8", accent: "#0F766E", surface: "#F8FAFC", ink: "#0F172A", radius: "4px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1320px", density: "dense", typeScale: "compact", spaceUnit: "12px" },
    banner: "Bulk prices updated daily",
    bannerTone: "info",
    hero: "Thousands of items in stock",
    sub: "Everything for your home and work.",
    ctaLabel: "Browse catalogue",
    about: "A wide catalogue with live stock counts and same-day dispatch on most items.",
    columns: 4,
    gridHeading: "Best sellers",
    heroAlign: "left",
    homeExtras: (k) => [
      s(k, "product_grid", { heading: "Deals under BDT 500", limit: 8, columns: 4 }, RESPONSIVE_COLS(4)),
    ],
    addToCartLabel: "Add to cart",
    faq: DEFAULT_FAQ,
    trust: ["Live stock counts", "Same-day dispatch", "Bulk discounts"],
  },
  {
    key: "supershop",
    nameEn: "Supershop",
    nameBn: "সুপারশপ",
    summaryEn: "Grocery aisles with quick add and daily-needs merchandising.",
    summaryBn: "গ্রোসারি সারি, দ্রুত অ্যাড ও দৈনন্দিন পণ্যের সাজানো লেআউট।",
    category: "grocery",
    sortOrder: 50,
    tokens: { brand: "#15803D", accent: "#0F766E", surface: "#FFFFFF", ink: "#0F172A", radius: "10px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1280px", density: "dense", typeScale: "compact", spaceUnit: "12px" },
    banner: "Fresh stock every morning",
    bannerTone: "success",
    hero: "Your neighbourhood supershop",
    sub: "Grocery, fresh produce and daily needs.",
    ctaLabel: "Start shopping",
    about: "Fresh produce sourced each morning and delivered the same day across the city.",
    columns: 4,
    gridHeading: "Today's basket",
    heroAlign: "left",
    homeExtras: (k) => [
      s(k, "product_grid", { heading: "Fresh today", limit: 8, columns: 4 }, RESPONSIVE_COLS(4)),
      s(k, "rich_text", { heading: "Delivery slots", body: "Morning 9-12, afternoon 3-6, evening 7-10." }),
    ],
    addToCartLabel: "Add to basket",
    faq: {
      q1: "When do you deliver?",
      a1: "Three slots daily: morning, afternoon and evening.",
      q2: "What if an item is out of stock?",
      a2: "We call you before dispatch and refund or substitute with your consent.",
      q3: "Is there a minimum order?",
      a3: "BDT 300 inside the city.",
    },
    trust: ["Same-day slots", "Fresh guarantee", "Cash on delivery"],
  },
  {
    key: "b2b",
    nameEn: "B2B",
    nameBn: "বি২বি",
    summaryEn: "Quote-first wholesale storefront with tiered pricing blocks.",
    summaryBn: "পাইকারি ও কোটেশন-ভিত্তিক স্টোরফ্রন্ট, স্তরভিত্তিক মূল্যসহ।",
    category: "wholesale",
    sortOrder: 60,
    tokens: { brand: "#334155", accent: "#0F766E", surface: "#FFFFFF", ink: "#0F172A", radius: "4px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1200px", density: "dense", typeScale: "compact", spaceUnit: "14px" },
    banner: "Wholesale pricing on request",
    bannerTone: "info",
    hero: "Wholesale, simplified",
    sub: "Tiered pricing and quotes for trade buyers.",
    ctaLabel: "Request a quote",
    about: "Trade-only pricing, VAT invoices and scheduled bulk deliveries.",
    columns: 3,
    gridHeading: "Trade catalogue",
    heroAlign: "left",
    homeExtras: (k) => [
      s(k, "rich_text", { heading: "How trade accounts work", body: "Register, share your trade licence, then order at tier pricing with VAT invoices." }),
    ],
    productExtras: (k) => [
      s(k, "rich_text", { heading: "Bulk tiers", body: "10+ units 5% off, 50+ units 9% off, 200+ units on quote." }),
    ],
    addToCartLabel: "Add to order",
    faq: {
      q1: "Do you issue VAT invoices?",
      a1: "Yes, a Mushak-compliant invoice is issued for every order.",
      q2: "What is the minimum order quantity?",
      a2: "Ten units per SKU for tier pricing.",
      q3: "Can I pay on credit?",
      a3: "Credit terms are available after three settled orders.",
    },
    trust: ["VAT invoices", "Tier pricing", "Scheduled delivery"],
  },
  {
    key: "clothing-modern",
    nameEn: "Clothing modern",
    nameBn: "ক্লোদিং মডার্ন",
    summaryEn: "Lookbook-led fashion storefront with size and fit guidance.",
    summaryBn: "লুকবুক-ভিত্তিক ফ্যাশন স্টোর, সাইজ ও ফিট গাইডসহ।",
    category: "fashion",
    sortOrder: 70,
    tokens: { brand: "#0F172A", accent: "#B45309", surface: "#FFFFFF", ink: "#0F172A", radius: "2px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1240px", density: "airy", typeScale: "expressive", spaceUnit: "24px" },
    banner: "Free exchange within 7 days",
    bannerTone: "info",
    hero: "The new edit",
    sub: "Contemporary clothing, cut for Bangladesh.",
    ctaLabel: "Shop the edit",
    about: "Seasonal drops in limited runs, cut and finished locally.",
    columns: 3,
    gridHeading: "This season",
    heroAlign: "center",
    productExtras: (k) => [
      s(k, "rich_text", { heading: "Size and fit", body: "Model is 175cm wearing M. Measurements are in the details tab." }),
    ],
    addToCartLabel: "Add to bag",
    faq: {
      q1: "Can I exchange for another size?",
      a1: "Yes, free size exchange within 7 days of delivery.",
      q2: "How should I wash it?",
      a2: "Cold hand wash, dry in shade.",
      q3: "Do you restock sold-out sizes?",
      a3: "Popular sizes are restocked within two weeks.",
    },
    trust: ["Free size exchange", "Locally cut", "bKash / Nagad"],
  },
  {
    key: "clothing-classic",
    nameEn: "Clothing classic",
    nameBn: "ক্লোদিং ক্লাসিক",
    summaryEn: "Heritage fashion in warm tones with weaver stories.",
    summaryBn: "উষ্ণ রঙে ঐতিহ্যবাহী ফ্যাশন, তাঁতির গল্পসহ।",
    category: "fashion",
    sortOrder: 80,
    tokens: { brand: "#7C2D12", accent: "#B45309", surface: "#FFFBF5", ink: "#1C1917", radius: "8px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1160px", density: "comfortable", typeScale: "default", spaceUnit: "18px" },
    banner: "Handloom, straight from the weaver",
    bannerTone: "info",
    hero: "Woven with care",
    sub: "Sari, panjabi and handloom classics.",
    ctaLabel: "Explore handloom",
    about: "Handloom from Tangail and Sirajganj, bought directly from weaving families.",
    columns: 3,
    gridHeading: "Handloom picks",
    heroAlign: "left",
    homeExtras: (k) => [
      s(k, "rich_text", { heading: "Meet the weavers", body: "Each piece carries the name of the family that wove it." }),
    ],
    addToCartLabel: "Add to cart",
    faq: DEFAULT_FAQ,
    trust: ["Direct from weavers", "Handloom certified", "Cash on delivery"],
  },
  {
    key: "sensory",
    nameEn: "Sensory",
    nameBn: "সেন্সরি",
    summaryEn: "High-contrast, motion-light layout tuned for readability.",
    summaryBn: "উচ্চ কনট্রাস্ট, কম মোশন — পড়ার সুবিধার জন্য তৈরি।",
    category: "accessible",
    sortOrder: 90,
    tokens: { brand: "#134E4A", accent: "#0F766E", surface: "#FFFFFF", ink: "#0B0B0B", radius: "12px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1080px", density: "airy", typeScale: "expressive", spaceUnit: "24px" },
    banner: "Large type and high contrast everywhere",
    bannerTone: "info",
    hero: "Shop without strain",
    sub: "Built for readability first.",
    ctaLabel: "Start shopping",
    about: "Large type, generous spacing and no motion by default.",
    columns: 2,
    gridHeading: "Products",
    heroAlign: "left",
    addToCartLabel: "Add to cart",
    faq: DEFAULT_FAQ,
    trust: ["High contrast", "No autoplay motion", "Screen-reader tested"],
  },
  {
    key: "festivity",
    nameEn: "Festivity",
    nameBn: "ফেস্টিভিটি",
    summaryEn: "Eid and Pohela Boishakh campaign theme with countdown and gifting.",
    summaryBn: "ঈদ ও পহেলা বৈশাখের ক্যাম্পেইন থিম, কাউন্টডাউন ও গিফটিংসহ।",
    category: "seasonal",
    sortOrder: 100,
    tokens: { brand: "#9D174D", accent: "#B45309", surface: "#FFF7FB", ink: "#1F2937", radius: "16px", fontDisplay: "Noto Sans Bengali", fontBody: "Noto Sans Bengali", container: "1200px", density: "comfortable", typeScale: "expressive", spaceUnit: "20px" },
    banner: "Eid offers live now",
    bannerTone: "warn",
    hero: "Celebrate together",
    sub: "Festive collections and gift bundles.",
    ctaLabel: "Shop festive",
    about: "Curated festive bundles with gift wrapping and dated delivery.",
    columns: 3,
    gridHeading: "Festive picks",
    heroAlign: "center",
    homeExtras: (k) => [
      s(k, "countdown", { label: "Offer ends in", endsAt: "2026-04-14T00:00:00Z" }),
      s(k, "rich_text", { heading: "Gift wrapping", body: "Add wrapping and a handwritten note at checkout." }),
    ],
    addToCartLabel: "Add to cart",
    faq: {
      q1: "Will it arrive before Eid?",
      a1: "Orders placed three days before Eid are delivered in time inside Dhaka.",
      q2: "Do you gift wrap?",
      a2: "Yes, choose wrapping at checkout.",
      q3: "Can I return a gift?",
      a3: "Gifts can be returned within 7 days with the receipt.",
    },
    trust: ["Dated delivery", "Gift wrapping", "Cash on delivery"],
  },
];

/**
 * The ten original presets plus every blueprint whose বাংলা dictionary is
 * complete. Atelier (apparel) ships here; the remaining blueprints stay out of
 * the catalogue until their translations clear the 90% publish gate.
 */
export const THEME_PRESETS: ThemePreset[] = [
  ...SPECS.map(build),
  ...SHIPPED_BLUEPRINTS,
];

export function presetByKey(key: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.key === key);
}

/* ------------------------------------------------------- preset swap (3.1) */

export type PresetSwapResult = {
  tokens: ThemeTokens;
  templates: Record<TemplateKey, ThemeAst>;
  /** Sections whose authored props were carried over. */
  kept: number;
  /** Sections copied in from the preset because the doc had none of that type. */
  added: number;
};

function mergeSlot(current: Section[], incoming: Section[]): { sections: Section[]; kept: number; added: number } {
  const seen = new Set(current.map((section) => section.type));
  // Authored content always wins: nothing is ever dropped on a preset swap.
  const extra = incoming.filter((section) => !seen.has(section.type));
  return { sections: [...current, ...extra], kept: current.length, added: extra.length };
}

/**
 * Swaps the visual preset without losing content. Tokens are replaced wholesale;
 * every authored section stays with its props, and preset sections whose widget
 * type is missing from the document are appended.
 */
export function applyPreset(
  current: Partial<Record<TemplateKey, ThemeAst>>,
  preset: ThemePreset,
): PresetSwapResult {
  const templates = {} as Record<TemplateKey, ThemeAst>;
  let kept = 0;
  let added = 0;
  const keys = new Set<TemplateKey>([
    ...(Object.keys(preset.templates) as TemplateKey[]),
    ...(Object.keys(current) as TemplateKey[]),
  ]);
  for (const key of keys) {
    const from = current[key] ?? { header: [], main: [], footer: [] };
    const to = preset.templates[key] ?? { header: [], main: [], footer: [] };
    const header = mergeSlot(from.header, to.header);
    const main = mergeSlot(from.main, to.main);
    const footer = mergeSlot(from.footer, to.footer);
    kept += header.kept + main.kept + footer.kept;
    added += header.added + main.added + footer.added;
    templates[key] = { header: header.sections, main: main.sections, footer: footer.sections };
  }
  return { tokens: preset.tokens, templates, kept, added };
}
