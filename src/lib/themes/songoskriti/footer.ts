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
import type {
  PropValue,
  Section,
  SectionType,
} from "../../builder-ast";
import type { Extras } from "../../theme-section";
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
};

/** Manual fallback when no dashboard menu claims the footer location. */
export const FALLBACK_COLUMNS: FallbackColumn[] = [
  {
    title: "Collections",
    title_bn: "সংগ্রহ",
    links: [
      "Heritage Handloom|/c/heritage-handloom",
      "Festive & Eid|/c/eid-festive",
      "Nakshi Kantha|/c/nakshi-kantha",
      "New arrivals|/c/new-in",
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
    title: "Our Heritage",
    title_bn: "আমাদের ঐতিহ্য",
    links: [
      "Master weavers|/blog/master-weavers",
      "Handloom heritage|/blog/handloom-heritage",
      "Fair trade|/pages/fair-trade",
      "Rewards|/pages/rewards",
    ].join("\n"),
  },
  {
    title: "About",
    title_bn: "আমাদের কথা",
    // Browser-verified 2026-09-24: "Contact us" appeared twice in the
    // footer (Customer Care + About). It lives in Customer Care only now.
    links: [
      "Our story|/pages/about",
      "Rewards club|/pages/rewards",
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
  body_bn:
    "ফ্ল্যাগশিপ: উত্তরা · গুলশান · চট্টগ্রাম — সকাল ১০টা থেকে রাত ৯টা।",
} as const;

/**
 * Statement + newsletter (the single CTA) + link columns + payments +
 * colophon. The newsletter keeps the only button-label prop in the footer;
 * support tiles are deliberately absent — they competed with the signup.
 */
export function buildSongoskritiFooter(s: FooterSectionBuilder): Section[] {
  return [
    s("rich_text", {
      heading: STATEMENT.heading,
      heading_bn: STATEMENT.heading_bn,
      body: STATEMENT.body,
      body_bn: STATEMENT.body_bn,
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
  return buildSongoskritiFooter(s);
}
