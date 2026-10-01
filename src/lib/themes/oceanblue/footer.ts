/**
 * Oceanblue footer — clean minimal brand-standard blueprint.
 *
 * Link columns carry the sitemap; a payments row + colophon (support
 * hours + copyright) close it. There is deliberately NO footer newsletter:
 * every content page owns a main-slot `newsletter` section (homepage §11,
 * blog, journal, search), so a footer copy would double the signup on
 * every page. Bilingual EN/BN ships inline via explicit `_bn` props so no
 * dictionary entry is required. No `buttonLabel` CTA exists in the footer.
 *
 * Brand zones live here as authored props (with `_bn` twins) for renderers
 * that consume them (songoskriti reads statement/story); the chrome
 * `footer_sitemap` renderer only consumes `items`, `c1..c4*` and
 * `socials`. Prop names avoid the bare `buttonLabel` key on purpose —
 * the wiring contract reserves that key for the main-slot `newsletter`
 * section.
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
 * Link columns + payments + colophon — no newsletter CTA here (page
 * main owns the signup; see the header note).
 * NOTE: no `split_feature` statement block — it is main-slotted only,
 * so authoring it in the footer AST parses to an `illegal_slot`
 * placeholder. The statement voice is carried instead by the
 * `footer_sitemap` brand props below (same strings, slot-legal).
 */
export function buildOceanblueFooter(s: FooterSectionBuilder): Section[] {
  return [
    s("footer_sitemap", {
      statementHeading: STATEMENT.heading,
      statementHeading_bn: STATEMENT.heading_bn,
      statementBody: STATEMENT.body,
      statementBody_bn: STATEMENT.body_bn,
      storyHref: "/pages/about",
      storyLabel: "OUR STORY →",
      storyLabel_bn: "আমাদের গল্প →",
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
