import type { Section, SectionBuilder } from "../../src/lib/builder-ast";
import { withStarterDefaults } from "./skins";

/**
 * Starter homepage — four sections, `hero_carousel` first.
 *
 * Pattern rules: the first section owns the H1 claim (`hero_carousel` is a
 * heading-claiming widget, `src/lib/builder-ast.ts:4431`); every
 * user-facing string carries its `_bn` twin inline; rail sections read from
 * a collection-free `bestsellers` source with an explicit promise line.
 * Never invent metrics, ratings, or addresses in demo copy.
 *
 * Persist note: only catalogue-declared fields survive a persist/parse
 * round trip (`parseSection` rebuilds props field-by-field,
 * `src/lib/builder-ast.ts:6569`). `product_rail` declares `heading`,
 * `source`, `promise`, `showRating`, `cardVariant`, and `skin`
 * (`src/lib/builder-ast.ts:1849`) — `limit` and `collection` are defaults
 * without fields, so this starter reads `bestsellers` instead of naming a
 * collection it cannot keep.
 */
export const STARTER_HOMEPAGE_TYPES = [
  "hero_carousel",
  "product_rail",
  "craft_story",
  "testimonials",
] as const;

export function buildStarterHomepageMain(s: SectionBuilder): Section[] {
  const t = withStarterDefaults(s);
  return [
    t("hero_carousel", {
      slides: [
        {
          image: "/ph/starter/hero-1.jpg",
          headline: "New season, honest prices",
          headline_bn: "নতুন মৌসুম, সৎ দাম",
          subhead: "Everyday essentials, delivered across Bangladesh.",
          subhead_bn: "প্রতিদিনের প্রয়োজন, সারা বাংলাদেশে ডেলিভারি।",
          ctaLabel: "Shop new arrivals",
          ctaLabel_bn: "নতুন পণ্য দেখুন",
          ctaUrl: "/c/new-in",
          caption: "New in",
        },
      ],
      autoAdvanceMs: 6000,
      atmosphere: "wash",
    }),
    t("product_rail", {
      heading: "Bestsellers",
      heading_bn: "সবচেয়ে জনপ্রিয়",
      source: "bestsellers",
      cardVariant: "compact",
      showRating: true,
      promise: "Cash on delivery across Bangladesh",
      promise_bn: "সারা বাংলাদেশে ক্যাশ অন ডেলিভারি",
    }),
    t("craft_story", {
      eyebrow: "Our craft",
      eyebrow_bn: "আমাদের কারুকাজ",
      heading: "Made to last",
      heading_bn: "টেকসই করে তৈরি",
      body: "Small batches from local makers. No factory substitutes.",
      body_bn: "স্থানীয় কারিগরদের ছোট ব্যাচ। কোনো কারখানার বিকল্প নয়।",
      ctaLabel: "Read our story",
      ctaLabel_bn: "আমাদের গল্প পড়ুন",
      ctaHref: "/pages/our-craft",
      scrim: true,
    }),
    t("testimonials", {
      testimonials: [
        {
          quote: "Ordered on Monday, wearing it on Friday.",
          quote_bn: "সোমবার অর্ডার, শুক্রবার পরিধান।",
          author: "Rahim U.",
          author_bn: "রহিম উ.",
          role: "Dhaka",
          role_bn: "ঢাকা",
        },
        {
          quote: "The size guide was exact. Rare and appreciated.",
          quote_bn: "সাইজ গাইড একদম ঠিক ছিল। বিরল ও প্রশংসনীয়।",
          author: "Shila A.",
          author_bn: "শীলা আ.",
          role: "Chattogram",
          role_bn: "চট্টগ্রাম",
        },
      ],
      autoAdvanceMs: 6000,
    }),
  ];
}

/** Header chrome: banner + search. Both are header-slot legal. */
export function buildStarterHeaderMain(s: SectionBuilder): Section[] {
  return [
    s("banner", { text: "Free delivery over BDT 2,000", tone: "info" }),
    s("search_command", {
      placeholder: "Search products",
      placeholder_bn: "পণ্য খুঁজুন",
      buttonLabel: "Search",
      buttonLabel_bn: "খুঁজুন",
      limit: 6,
    }),
  ];
}

/** Footer chrome: signup + sitemap + payment marks. */
export function buildStarterFooterMain(s: SectionBuilder): Section[] {
  return [
    s("newsletter", {
      heading: "Stay in touch",
      heading_bn: "যোগাযোগে থাকুন",
      body: "Offers and new arrivals by email. Unsubscribe any time.",
      body_bn: "ইমেইলে অফার ও নতুন পণ্য। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
      buttonLabel: "Subscribe",
      buttonLabel_bn: "সাবস্ক্রাইব করুন",
      consentText: "We email only for new arrivals.",
      consentText_bn: "শুধু নতুন পণ্যের জন্য ইমেইল পাঠাই।",
    }),
    s("footer_sitemap", {
      c1Title: "Shop",
      c1Links: "New in|/c/new-in, Bestsellers|/c/bestsellers",
      c2Title: "Help",
      c2Links: "Contact|/pages/contact, Shipping|/pages/shipping",
      c3Title: "About",
      c3Links: "Our craft|/pages/our-craft",
    }),
    s("payment_icons", {
      heading: "We accept",
      marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
    }),
  ];
}
