/**
 * Oceanblue footer — clean minimal brand-standard blueprint.
 *
 * Statement archetype (not the 4-column-link default): a brand statement
 * leads, one newsletter CTA follows, link columns carry the sitemap, and a
 * colophon row (payments + support hours + copyright) closes. Bilingual
 * EN/BN ships inline via explicit `_bn` props so no dictionary entry is
 * required. Exactly one button-styled CTA exists: the newsletter submit.
 *
 * Brand zones live here as authored props (with `_bn` twins): the shared
 * `footer_sitemap` renderer is prop-driven and hardcodes no brand content,
 * so these same strings must be passed explicitly to keep the storefront
 * output identical. Prop names avoid the bare `buttonLabel` key on purpose —
 * the wiring contract reserves that key for the standalone `newsletter`
 * section (exactly one newsletter CTA).
 */
import type { PropValue, Section, SectionType } from "../../builder-ast";
import type { Extras } from "../../theme-section";
import { PAYMENT_MARKS } from "../../footer-copy";
import { withOceanblueDefaults } from "./skins";
import type { SectionBuilder } from "./types";

export type FooterSectionBuilder = (
  type: SectionType,
  props: Record<string, PropValue>,
  extras?: Extras,
) => Section;

export const BRAND_NAME = "Oceanblue";
export const BRAND_NAME_BN = "ওশানব্লু";

export const STATEMENT = {
  heading: "Everyday ethnic, made for Bangladesh",
  heading_bn: "বাংলাদেশের জন্য প্রতিদিনের এথনিক",
  body: "Oceanblue brings festive shelves to everyday doors — honest prices, easy exchange, cash on delivery.",
  body_bn:
    "উৎসবের তাক এখন প্রতিদিনের দোরগোড়ায় — সৎ দাম, সহজ বদল, ক্যাশ অন ডেলিভারি।",
} as const;

export const NEWSLETTER = {
  heading: "New drops, first inbox",
  heading_bn: "নতুন ড্রপ, সবার আগে ইনবক্সে",
  body: "New arrivals, restocks and sale alerts. One useful letter — never spam.",
  body_bn:
    "নতুন সংগ্রহ, রিস্টক ও সেল অ্যালার্ট। একটি কাজের চিঠি — কোনো স্প্যাম নয়।",
  buttonLabel: "Subscribe",
  buttonLabel_bn: "সাবস্ক্রাইব",
  consentText: "We email only for drops and sales. Unsubscribe anytime.",
  consentText_bn:
    "শুধু ড্রপ ও সেলের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
} as const;

/** Manual fallback when no dashboard menu claims the footer location. */
export type FallbackColumn = {
  title: string;
  title_bn: string;
  /** Newline rows in `Label|/href` form — every href is a verified route. */
  links: string;
  /** Same rows with বাংলা labels; hrefs must match `links` exactly. */
  links_bn: string;
};

export const FALLBACK_COLUMNS: FallbackColumn[] = [
  {
    title: "Shop",
    title_bn: "কেনাকাটা",
    links: [
      "New Arrival|/c/new-in",
      "Salwar Kameez|/c/salwar-kameez",
      "Kurtas & Tops|/c/kurtas-tops",
      "Dresses|/c/dresses",
      "Bottoms|/c/bottoms",
      "Girls|/c/girls",
      "Jewellery|/c/jewellery",
      "Collections|/c/collections",
      "Sale|/c/sale",
    ].join("\n"),
    links_bn: [
      "নতুন এসেছে|/c/new-in",
      "সালোয়ার কামিজ|/c/salwar-kameez",
      "কুর্তা ও টপস|/c/kurtas-tops",
      "পোশাক|/c/dresses",
      "বটমস|/c/bottoms",
      "মেয়েরা|/c/girls",
      "গহনা|/c/jewellery",
      "কালেকশন|/c/collections",
      "সেল|/c/sale",
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
    title: "About",
    title_bn: "আমাদের সম্পর্কে",
    links: [
      "Our Story|/pages/about",
      "Stores|/pages/stores",
      "Journal|/blog",
      "Business Enquiry|/pages/business",
      "Careers|/pages/careers",
    ].join("\n"),
    links_bn: [
      "আমাদের গল্প|/pages/about",
      "স্টোরসমূহ|/pages/stores",
      "জার্নাল|/blog",
      "ব্যবসায়িক অনুসন্ধান|/pages/business",
      "ক্যারিয়ার|/pages/careers",
    ].join("\n"),
  },
  {
    title: "Contact",
    title_bn: "যোগাযোগ",
    links: [
      "Helpline: +880 96 1234 5678|/pages/contact",
      "Email: care@oceanblue.example|mailto:care@oceanblue.example",
      "Support: 10AM - 9PM|/pages/contact",
    ].join("\n"),
    links_bn: [
      "হেল্পলাইন: +৮৮০ ৯৬ ১২৩৪ ৫৬৭৮|/pages/contact",
      "ইমেইল: care@oceanblue.example|mailto:care@oceanblue.example",
      "সাপোর্ট: সকাল ১০টা - রাত ৯টা|/pages/contact",
    ].join("\n"),
  },
];

export const PAYMENTS_HEADING = "Payment methods";
export const PAYMENTS_HEADING_BN = "পেমেন্ট মাধ্যম";

export const COLOPHON = {
  body: "Support 10am to 9pm, every day. Prices include VAT where applicable.",
  body_bn:
    "সাপোর্ট প্রতিদিন সকাল ১০টা থেকে রাত ৯টা। প্রযোজ্য ক্ষেত্রে দামে ভ্যাট অন্তর্ভুক্ত।",
} as const;

/**
 * Newsletter (the single CTA) + link columns + payments + colophon.
 * NOTE: no `split_feature` statement block here — it is main-slotted
 * only, so authoring it in the footer AST parses to an `illegal_slot`
 * placeholder. The statement voice is carried instead by the
 * `footer_sitemap` brand props below (same strings, slot-legal).
 */
export function buildOceanblueFooter(s: FooterSectionBuilder): Section[] {
  return [
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
      statementHeading: STATEMENT.heading,
      statementHeading_bn: STATEMENT.heading_bn,
      statementBody: STATEMENT.body,
      statementBody_bn: STATEMENT.body_bn,
      storyHref: "/pages/about",
      storyLabel: "OUR STORY →",
      storyLabel_bn: "আমাদের গল্প →",
      newsletterHeading: NEWSLETTER.heading,
      newsletterHeading_bn: NEWSLETTER.heading_bn,
      newsletterButton: NEWSLETTER.buttonLabel,
      newsletterButton_bn: NEWSLETTER.buttonLabel_bn,
      newsletterConsent: NEWSLETTER.consentText,
      newsletterConsent_bn: NEWSLETTER.consentText_bn,
      brandName: BRAND_NAME,
      brandName_bn: BRAND_NAME_BN,
      paymentsHeading: PAYMENTS_HEADING,
      paymentsHeading_bn: PAYMENTS_HEADING_BN,
      paymentsMarks: PAYMENT_MARKS,
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
  return buildOceanblueFooter(withOceanblueDefaults(s));
}
