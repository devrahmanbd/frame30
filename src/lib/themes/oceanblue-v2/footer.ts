/**
 * Oceanblue-v2 footer — maroon studied-DNA 5-column index blueprint.
 *
 * Link columns carry the sitemap (Shop, Occasions, Customer Care, About,
 * Contact); a payments row + colophon (support hours + copyright) close
 * it. There is deliberately NO footer newsletter: the single sitewide
 * signup lives in the homepage main slot (spec §3 item 13), so a footer
 * copy would double it on every page. Bilingual EN/BN ships inline via
 * explicit `_bn` props so no dictionary entry is required. No
 * `buttonLabel` CTA exists in the footer.
 *
 * Contact rows link to real routes only — no invented helplines, emails,
 * or addresses (spec §7 honesty). Brand zones live here as authored props
 * (with `_bn` twins) for renderers that consume them; the chrome
 * `footer_sitemap` renderer only consumes `items`, `c1..c5*` and
 * `socials`. Prop names avoid the bare `buttonLabel` key on purpose —
 * the wiring contract reserves that key for the main-slot `newsletter`
 * section.
 */
import type { PropValue, Section, SectionType } from "../../builder-ast";
import type { Extras } from "../../theme-section";
import { PAYMENT_MARKS } from "../../footer-copy";
import { withOceanblueV2Defaults } from "./skins";
import type { SectionBuilder } from "./types";

export type FooterSectionBuilder = (
  type: SectionType,
  props: Record<string, PropValue>,
  extras?: Extras,
) => Section;

export const BRAND_NAME = "Oceanblue";
export const BRAND_NAME_BN = "ওশানব্লু";

export const STATEMENT = {
  heading: "Festive shelves, everyday doors",
  heading_bn: "উৎসবের তাক, প্রতিদিনের দরজায়",
  body: "Oceanblue brings maroon-season ethnic wear to real calendars — office days, Eid mornings and wedding nights — at prices that stay honest.",
  body_bn:
    "অফিস, ঈদের সকাল ও বিয়ের রাত — আসল ক্যালেন্ডারের জন্য এথনিক পোশাক, সৎ দামে।",
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
    title: "Occasions",
    title_bn: "উপলক্ষ",
    links: [
      "Eid Edit|/c/eid",
      "Wedding Splendor|/c/wedding",
      "Festive|/c/festive",
      "Workwear|/c/workwear",
      "Online Exclusive|/c/online-exclusive",
    ].join("\n"),
    links_bn: [
      "ঈদ সংগ্রহ|/c/eid",
      "বিয়ের জাঁকজমক|/c/wedding",
      "উৎসব|/c/festive",
      "অফিস পোশাক|/c/workwear",
      "শুধু অনলাইনে|/c/online-exclusive",
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
      "Contact Us|/pages/contact",
      "Order Tracking|/pages/track-order",
      "Our Stores|/pages/stores",
      "FAQ|/pages/faq",
    ].join("\n"),
    links_bn: [
      "যোগাযোগ করুন|/pages/contact",
      "অর্ডার ট্র্যাকিং|/pages/track-order",
      "আমাদের স্টোর|/pages/stores",
      "সাধারণ জিজ্ঞাসা|/pages/faq",
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
 * Link columns + payments + colophon — no newsletter CTA here (page
 * main owns the signup; see the header note).
 */
export function buildOceanblueV2Footer(s: FooterSectionBuilder): Section[] {
  return [
    s("footer_sitemap", {
      statementHeading: STATEMENT.heading,
      statementHeading_bn: STATEMENT.heading_bn,
      statementBody: STATEMENT.body,
      statementBody_bn: STATEMENT.body_bn,
      storyHref: "/pages/about",
      storyLabel: "Our story",
      storyLabel_bn: "আমাদের গল্প",
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
      c5Title: FALLBACK_COLUMNS[4]!.title,
      c5Title_bn: FALLBACK_COLUMNS[4]!.title_bn,
      c5Links: FALLBACK_COLUMNS[4]!.links,
      c5Links_bn: FALLBACK_COLUMNS[4]!.links_bn,
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
  return buildOceanblueV2Footer(withOceanblueV2Defaults(s));
}
