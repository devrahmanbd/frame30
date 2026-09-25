/**
 * Somvabona storefront chrome — brand-standard blueprints (data only).
 *
 * Statement archetype: a brand statement leads, one newsletter CTA follows,
 * link columns carry the sitemap, and a colophon row (payments + flagship
 * hours + copyright) closes. Bilingual EN/BN ships inline via explicit
 * `_bn` props so no dictionary entry is required. Exactly one button-styled
 * CTA exists: the newsletter submit.
 *
 * The masthead keeps the menubar only: the storefront `StoreHeader` chrome
 * (preview frame + live store) already renders search, account and cart
 * actions, so blueprint `search_command`/`account_cart` sections would
 * render a second search bar and account row beneath the masthead.
 */
import type { PropValue, Section } from "../../builder-ast";
import type { SomvabonaBuilder } from "./types";
import { withSomvabonaWidgetDefaults } from "./skins";

export const BRAND_NAME = "Somvabona";
export const BRAND_NAME_BN = "সম্ভাবনা";

export const STATEMENT = {
  heading: "Everyday ethnic, made for Bangladesh",
  heading_bn: "প্রতিদিনের দেশি পোশাক, বাংলাদেশের জন্য",
  body: "Somvabona keeps breathable cotton and honest festive wear within reach — comfort first, fair prices, delivered to your door.",
  body_bn:
    "শ্বাসপ্রশ্বাসযোগ্য সুতি ও সৎ উৎসবের পোশাক সবার নাগালে রাখে সম্ভাবনা — আরামই প্রথম, ন্যায্য দাম, দরজায় ডেলিভারি।",
} as const;

export const NEWSLETTER = {
  heading: "New drops, honest prices",
  heading_bn: "নতুন ড্রপ, সৎ দাম",
  body: "One letter per drop. Cottons, restocks and festive edits — never spam.",
  body_bn:
    "প্রতি ড্রপে একটি চিঠি। সুতি, রিস্টক ও উৎসবের কালেকশন — কোনো স্প্যাম নয়।",
  buttonLabel: "Join the list",
  buttonLabel_bn: "তালিকায় যোগ দিন",
  consentText: "We email only for new drops. Unsubscribe anytime.",
  consentText_bn:
    "শুধু নতুন ড্রপের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
} as const;

export type FallbackColumn = {
  title: string;
  title_bn: string;
  /** Newline rows in `Label|/href` form — every href is a verified route. */
  links: string;
};

/** Manual fallback when no dashboard menu claims the footer location. */
export const FALLBACK_COLUMNS: FallbackColumn[] = [
  {
    title: "Collections",
    title_bn: "সংগ্রহ",
    links: [
      "New arrivals|/c/new-in",
      "Festive & Eid|/c/festive",
      "Wedding|/c/wedding",
      "Gifting|/c/gifting",
    ].join("\n"),
  },
  {
    title: "Customer Care",
    title_bn: "ক্রেতা সেবা",
    links: [
      "Size guide|/pages/size-guide",
      "Order tracking|/pages/track-order",
      "Returns & exchanges|/pages/returns",
      "Store locations|/pages/stores",
      "Contact us|/pages/contact",
    ].join("\n"),
  },
  {
    title: "Our Promise",
    title_bn: "আমাদের প্রতিশ্রুতি",
    links: [
      "Cotton culture|/blog/cotton-culture",
      "Fair prices|/pages/fair-trade",
      "Cash on delivery|/pages/cod",
      "Rewards|/pages/rewards",
    ].join("\n"),
  },
  {
    title: "About",
    title_bn: "আমাদের কথা",
    links: ["Our story|/pages/about", "Rewards club|/pages/rewards"].join("\n"),
  },
];

export const PAYMENTS_HEADING = "Payment methods";
export const PAYMENTS_HEADING_BN = "পেমেন্ট মাধ্যম";
export const PAYMENT_MARKS =
  "bKash, Nagad, Rocket, Visa, Mastercard, Cash on Delivery";
export const PAYMENTS_LIST = [
  "bKash",
  "Nagad",
  "Rocket",
  "Visa",
  "Mastercard",
  "Cash on Delivery",
];

export const COLOPHON = {
  body: "Flagships: Uttara · Gulshan · Chattogram — open 10am to 9pm.",
  body_bn: "ফ্ল্যাগশিপ: উত্তরা · গুলশান · চট্টগ্রাম — সকাল ১০টা থেকে রাত ৯টা।",
} as const;

export function buildHeaderMain(s: SomvabonaBuilder): Section[] {
  const t = withSomvabonaWidgetDefaults(s);
  return [
    t("mega_menu", {
      label: "Shop",
      label_bn: "কেনাকাটা",
      limit: 8,
      columns: 4,
    }),
  ];
}

/**
 * Statement + newsletter (the single CTA) + link columns + payments +
 * colophon. The newsletter keeps the only button-label prop in the footer.
 */
export function buildFooterMain(s: SomvabonaBuilder): Section[] {
  const t = withSomvabonaWidgetDefaults(s);
  return [
    t("rich_text", {
      heading: STATEMENT.heading,
      heading_bn: STATEMENT.heading_bn,
      body: STATEMENT.body,
      body_bn: STATEMENT.body_bn,
    }),
    t("newsletter", {
      heading: NEWSLETTER.heading,
      heading_bn: NEWSLETTER.heading_bn,
      body: NEWSLETTER.body,
      body_bn: NEWSLETTER.body_bn,
      buttonLabel: NEWSLETTER.buttonLabel,
      buttonLabel_bn: NEWSLETTER.buttonLabel_bn,
      consentText: NEWSLETTER.consentText,
      consentText_bn: NEWSLETTER.consentText_bn,
    }),
    t("footer_sitemap", {
      c1Title: FALLBACK_COLUMNS[0]!.title,
      c1Title_bn: FALLBACK_COLUMNS[0]!.title_bn,
      c1Links: FALLBACK_COLUMNS[0]!.links,
      c2Title: FALLBACK_COLUMNS[1]!.title,
      c2Title_bn: FALLBACK_COLUMNS[1]!.title_bn,
      c2Links: FALLBACK_COLUMNS[1]!.links,
      c3Title: FALLBACK_COLUMNS[2]!.title,
      c3Title_bn: FALLBACK_COLUMNS[2]!.title_bn,
      c3Links: FALLBACK_COLUMNS[2]!.links,
      c4Title: FALLBACK_COLUMNS[3]!.title,
      c4Title_bn: FALLBACK_COLUMNS[3]!.title_bn,
      c4Links: FALLBACK_COLUMNS[3]!.links,
    }),
    t("payment_icons", {
      heading: PAYMENTS_HEADING,
      heading_bn: PAYMENTS_HEADING_BN,
      marks: PAYMENT_MARKS,
    }),
    t("rich_text", {
      heading: "",
      body: COLOPHON.body,
      body_bn: COLOPHON.body_bn,
    }),
  ];
}

export type { PropValue };
