/**
 * Songoskriti heritage footer — brand-standard blueprint.
 *
 * Statement archetype (not the 4-column-link default): a brand statement
 * leads, one newsletter CTA follows, link columns carry the sitemap, and a
 * colophon row (payments + flagship hours + copyright) closes. Bilingual
 * EN/BN ships inline via explicit `_bn` props so no dictionary entry is
 * required. Exactly one button-styled CTA exists: the newsletter submit.
 *
 * Data only: no React, no network. The storefront fallback
 * (`StoreFooterMenus`) reads the same constants so theme and fallback copy
 * can never drift apart.
 */
import type { PropValue, Section, SectionType } from "../../builder-ast";
import type { Extras } from "../../theme-section";
import { withSongoskritiDefaults } from "./skins";
import type { SectionBuilder } from "./types";

export type FooterSectionBuilder = (
  type: SectionType,
  props: Record<string, PropValue>,
  extras?: Extras,
) => Section;

export const BRAND_NAME = "Songoskriti";
export const BRAND_NAME_BN = "সংস্কৃতি";

export const STATEMENT = {
  heading: "Woven in Bangladesh, worn everywhere",
  heading_bn: "বাংলাদেশে বোনা, পরা হয় সর্বত্র",
  body: "Songoskriti keeps Tangail, Jamdani and Nakshi Kantha weaving alive through fair artisan partnerships.",
  body_bn:
    "ন্যায্য তাঁতি অংশীদারিত্বে টাঙ্গাইল, জামদানি ও নকশি কাঁথার বুনন বাঁচিয়ে রাখে সংস্কৃতি।",
} as const;

export const NEWSLETTER = {
  heading: "First to the festive drops",
  heading_bn: "উৎসবের ড্রপ সবার আগে",
  body: "One letter per drop. Weaves, restocks and artisan stories — never spam.",
  body_bn:
    "প্রতি ড্রপে একটি চিঠি। বুনন, রিস্টক ও তাঁতিদের গল্প — কোনো স্প্যাম নয়।",
  buttonLabel: "Join the list",
  buttonLabel_bn: "তালিকায় যোগ দিন",
  consentText: "We email only for festive drops. Unsubscribe anytime.",
  consentText_bn:
    "শুধু উৎসবের ড্রপের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
} as const;

export type FallbackColumn = {
  title: string;
  title_bn: string;
  /** Newline rows in `Label|/href` form — every href is a verified route. */
  links: string;
  /** Same rows with বাংলা labels; hrefs must match `links` exactly. */
  links_bn: string;
};

/** Manual fallback when no dashboard menu claims the footer location. */
export const FALLBACK_COLUMNS: FallbackColumn[] = [
  {
    title: "Shop",
    title_bn: "কেনাকাটা",
    links: [
      "New Arrivals|/c/new-in",
      "Women|/c/women",
      "Men|/c/men",
      "Kids|/c/kids",
      "Sarees|/c/sarees",
      "Panjabi|/c/panjabi",
      "Festive|/c/festive",
      "Wedding|/c/wedding",
      "Jewellery|/c/jewellery",
    ].join("\n"),
    links_bn: [
      "নতুন এসেছে|/c/new-in",
      "নারী|/c/women",
      "পুরুষ|/c/men",
      "শিশু|/c/kids",
      "শাড়ি|/c/sarees",
      "পাঞ্জাবি|/c/panjabi",
      "উৎসব|/c/festive",
      "বিয়ে|/c/wedding",
      "গহনা|/c/jewellery",
    ].join("\n"),
  },
  {
    title: "Customer Care",
    title_bn: "ক্রেতা সেবা",
    links: [
      "Size Guide|/pages/size-guide",
      "Order Tracking|/pages/track-order",
      "Shipping|/pages/shipping",
      "Returns & Exchanges|/pages/returns",
      "Cancellation|/pages/cancellation",
      "FAQ|/pages/faq",
      "Contact|/pages/contact",
    ].join("\n"),
    links_bn: [
      "সাইজ গাইড|/pages/size-guide",
      "অর্ডার ট্র্যাকিং|/pages/track-order",
      "ডেলিভারি|/pages/shipping",
      "রিটার্ন ও বদল|/pages/returns",
      "বাতিলকরণ|/pages/cancellation",
      "সাধারণ জিজ্ঞাসা|/pages/faq",
      "যোগাযোগ|/pages/contact",
    ].join("\n"),
  },
  {
    title: "Our Heritage",
    title_bn: "আমাদের ঐতিহ্য",
    links: [
      "Our Story|/pages/about",
      "Master Weavers|/pages/master-weavers",
      "Handloom Heritage|/blog/handloom",
      "Artisan Partnerships|/pages/artisans",
      "Journal|/blog",
      "Stores|/pages/stores",
    ].join("\n"),
    links_bn: [
      "আমাদের গল্প|/pages/about",
      "মাস্টার তাঁতি|/pages/master-weavers",
      "হাতে বোনা ঐতিহ্য|/blog/handloom",
      "তাঁতি অংশীদারিত্ব|/pages/artisans",
      "জার্নাল|/blog",
      "স্টোরসমূহ|/pages/stores",
    ].join("\n"),
  },
  {
    title: "Contact",
    title_bn: "যোগাযোগ",
    links: [
      "Phone: +880 96 1234 5678|/pages/contact",
      "Email: care@songoskriti.com|mailto:care@songoskriti.com",
      "Uttara Flagship|/pages/stores#uttara",
      "Gulshan Flagship|/pages/stores#gulshan",
      "Chattogram Flagship|/pages/stores#chattogram",
      "Support: 10AM - 9PM|/pages/contact",
    ].join("\n"),
    links_bn: [
      "ফোন: +৮৮০ ৯৬ ১২৩৪ ৫৬৭৮|/pages/contact",
      "ইমেইল: care@songoskriti.com|mailto:care@songoskriti.com",
      "উত্তরা ফ্ল্যাগশিপ|/pages/stores#uttara",
      "গুলশান ফ্ল্যাগশিপ|/pages/stores#gulshan",
      "চট্টগ্রাম ফ্ল্যাগশিপ|/pages/stores#chattogram",
      "সাপোর্ট: সকাল ১০টা - রাত ৯টা|/pages/contact",
    ].join("\n"),
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

/**
 * Statement + newsletter (the single CTA) + link columns + payments +
 * colophon. The newsletter keeps the only button-label prop in the footer;
 * support tiles are deliberately absent — they competed with the signup.
 */
export function buildSongoskritiFooter(s: FooterSectionBuilder): Section[] {
  return [
    s("split_feature", {
      heading: STATEMENT.heading,
      heading_bn: STATEMENT.heading_bn,
      body: STATEMENT.body,
      body_bn: STATEMENT.body_bn,
      primaryImage: "/ph/songoskriti/songoskriti_artisan.jpg",
      layout: "image_right",
    }),
    s("newsletter", {
      heading: NEWSLETTER.heading,
      heading_bn: NEWSLETTER.heading_bn,
      body: NEWSLETTER.body,
      body_bn: NEWSLETTER.body_bn,
      buttonLabel: NEWSLETTER.buttonLabel,
      buttonLabel_bn: NEWSLETTER.buttonLabel_bn,
      consentText: NEWSLETTER.consentText,
      consentText_bn: NEWSLETTER.consentText_bn,
    }),
    s("footer_sitemap", {
      c1Title: FALLBACK_COLUMNS[0]!.title,
      c1Title_bn: FALLBACK_COLUMNS[0]!.title_bn,
      c1Links: FALLBACK_COLUMNS[0]!.links,
      c1Links_bn: FALLBACK_COLUMNS[0]!.links_bn,
      c2Title: FALLBACK_COLUMNS[1]!.title,
      c2Title_bn: FALLBACK_COLUMNS[1]!.title_bn,
      c2Links: FALLBACK_COLUMNS[1]!.links,
      c2Links_bn: FALLBACK_COLUMNS[1]!.links_bn,
      c3Title: FALLBACK_COLUMNS[2]!.title,
      c3Title_bn: FALLBACK_COLUMNS[2]!.title_bn,
      c3Links: FALLBACK_COLUMNS[2]!.links,
      c3Links_bn: FALLBACK_COLUMNS[2]!.links_bn,
      c4Title: FALLBACK_COLUMNS[3]!.title,
      c4Title_bn: FALLBACK_COLUMNS[3]!.title_bn,
      c4Links: FALLBACK_COLUMNS[3]!.links,
      c4Links_bn: FALLBACK_COLUMNS[3]!.links_bn,
    }),
    s("payment_icons", {
      heading: PAYMENTS_HEADING,
      heading_bn: PAYMENTS_HEADING_BN,
      marks: PAYMENT_MARKS,
    }),
    s("rich_text", {
      heading: "",
      body: COLOPHON.body,
      body_bn: COLOPHON.body_bn,
    }),
  ];
}

/**
 * Engine entry point (`index.ts` re-exports this name). Delegates to the
 * brand blueprint above. The engine's `SectionBuilder` (props optional, no
 * extras channel) is assignable to `FooterSectionBuilder` — the blueprint
 * always passes props and never uses extras — so this passes `s` through
 * directly with no adapter closure.
 */
export function buildFooterMain(s: SectionBuilder): Section[] {
  // SectionBuilder drops the unused extras channel (see blueprint note
  // above), so the skin-default wrapper feeds straight into the blueprint.
  return buildSongoskritiFooter(withSongoskritiDefaults(s));
}
