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
import {
  COLOPHON,
  NEWSLETTER,
  PAYMENT_MARKS,
  PAYMENT_MARKS_BN,
  STATEMENT,
} from "../../footer-copy";
import { withSongoskritiDefaults } from "./skins";
import type { SectionBuilder } from "./types";

export type FooterSectionBuilder = (
  type: SectionType,
  props: Record<string, PropValue>,
  extras?: Extras,
) => Section;

/**
 * @deprecated Theme blueprints must not enforce customer-facing brand names.
 * Read merchant name from merchant profile/context.
 */
export const BRAND_NAME = "";
export const BRAND_NAME_BN = "";

export { COLOPHON, NEWSLETTER, PAYMENT_MARKS, PAYMENT_MARKS_BN, STATEMENT };

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
    title: "About Us",
    title_bn: "আমাদের সম্পর্কে",
    links: [
      "Our Story|/pages/about",
      "Terms of Service|/pages/terms",
      "Privacy Policy|/pages/privacy",
      "Blog & Updates|/blog",
    ].join("\n"),
    links_bn: [
      "আমাদের গল্প|/pages/about",
      "ব্যবহারের শর্তাবলী|/pages/terms",
      "গোপনীয়তা নীতি|/pages/privacy",
      "ব্লগ ও আপডেট|/blog",
    ].join("\n"),
  },
  {
    title: "Help & Inquiries",
    title_bn: "সহায়তা ও জিজ্ঞাসা",
    links: [
      "Help & Inquiries|/pages/contact",
      "Track Your Order|/pages/track-order",
      "Shipping Information|/pages/shipping",
      "Customer Care FAQ|/pages/faq",
    ].join("\n"),
    links_bn: [
      "সহায়তা ও অনুসন্ধান|/pages/contact",
      "অর্ডার অনুসন্ধান|/pages/track-order",
      "শিপিং তথ্য|/pages/shipping",
      "গ্রাহক সহায়তা কেন্দ্র|/pages/faq",
    ].join("\n"),
  },
];

export const PAYMENTS_HEADING = "Payment methods";
export const PAYMENTS_HEADING_BN = "পেমেন্ট মাধ্যম";
export const PAYMENTS_LIST = ["Cash on Delivery"];

export type SongoskritiMerchantFooterInfo = {
  name?: string | null;
  nameBn?: string | null;
  tagline?: string | null;
  taglineBn?: string | null;
  supportEmail?: string | null;
  supportHours?: string | null;
  supportPhone?: string | null;
  deliveryInfo?: string | null;
  deliveryInfoBn?: string | null;
  paymentMethods?: string[] | string | null;
  paymentMethodsBn?: string[] | string | null;
};

/**
 * Link columns + payments + colophon. Statement, newsletter, story link
 * and brand imagery were removed from the footer by design — the footer
 * is navigation and trust only.
 *
 * Brand zones live here as authored props (with `_bn` twins): the shared
 * `footer_sitemap` renderer is prop-driven and hardcodes no brand content.
 */
export function buildSongoskritiFooter(
  s: FooterSectionBuilder,
  merchant?: SongoskritiMerchantFooterInfo,
): Section[] {
  const brandName = merchant?.name || "";
  const brandNameBn = merchant?.nameBn || brandName;
  const brandTagline = merchant?.tagline || "";
  const brandTaglineBn = merchant?.taglineBn || brandTagline;

  let c4Title = FALLBACK_COLUMNS[3]!.title;
  let c4TitleBn = FALLBACK_COLUMNS[3]!.title_bn;
  let c4Links = FALLBACK_COLUMNS[3]!.links;
  let c4LinksBn = FALLBACK_COLUMNS[3]!.links_bn;

  if (
    merchant?.supportEmail ||
    merchant?.supportHours ||
    merchant?.deliveryInfo
  ) {
    c4Title = "Contact";
    c4TitleBn = "যোগাযোগ";
    const lines: string[] = [];
    const linesBn: string[] = [];

    if (merchant.supportEmail) {
      lines.push(
        `Email: ${merchant.supportEmail}|mailto:${merchant.supportEmail}`,
      );
      linesBn.push(
        `ইমেইল: ${merchant.supportEmail}|mailto:${merchant.supportEmail}`,
      );
    }
    if (merchant.supportHours) {
      lines.push(`Support: ${merchant.supportHours}|/pages/contact`);
      linesBn.push(`সাপোর্ট: ${merchant.supportHours}|/pages/contact`);
    }
    lines.push("Track Your Order|/pages/track-order");
    linesBn.push("অর্ডার অনুসন্ধান|/pages/track-order");
    if (merchant.deliveryInfo) {
      lines.push(`${merchant.deliveryInfo}|/pages/shipping`);
      linesBn.push(
        `${merchant.deliveryInfoBn || merchant.deliveryInfo}|/pages/shipping`,
      );
    }

    c4Links = lines.join("\n");
    c4LinksBn = linesBn.join("\n");
  }

  let paymentsMarks = "";
  let paymentsMarksBn = "";
  if (merchant?.paymentMethods) {
    paymentsMarks = Array.isArray(merchant.paymentMethods)
      ? merchant.paymentMethods.join(", ")
      : merchant.paymentMethods;
    paymentsMarksBn = merchant.paymentMethodsBn
      ? Array.isArray(merchant.paymentMethodsBn)
        ? merchant.paymentMethodsBn.join(", ")
        : merchant.paymentMethodsBn
      : paymentsMarks;
  }

  const colophonBody = merchant?.supportHours
    ? `Support & customer care — ${merchant.supportHours}.`
    : "";
  const colophonBodyBn = merchant?.supportHours
    ? `সহায়তা ও গ্রাহক সেবা — ${merchant.supportHours}।`
    : "";

  return [
    s("footer_sitemap", {
      newsletterHeading: NEWSLETTER.heading,
      newsletterHeading_bn: NEWSLETTER.heading_bn,
      newsletterButton: NEWSLETTER.buttonLabel,
      newsletterButton_bn: NEWSLETTER.buttonLabel_bn,
      newsletterConsent: NEWSLETTER.consentText,
      newsletterConsent_bn: NEWSLETTER.consentText_bn,
      brandName,
      brandName_bn: brandNameBn,
      brandTagline,
      brandTagline_bn: brandTaglineBn,
      paymentsHeading: paymentsMarks ? PAYMENTS_HEADING : "",
      paymentsHeading_bn: paymentsMarksBn ? PAYMENTS_HEADING_BN : "",
      paymentsMarks,
      paymentsMarks_bn: paymentsMarksBn,
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
      c4Title,
      c4Title_bn: c4TitleBn,
      c4Links,
      c4Links_bn: c4LinksBn,
    }),
    s("rich_text", {
      heading: "",
      body: colophonBody,
      body_bn: colophonBodyBn,
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
export function buildFooterMain(
  s: SectionBuilder,
  merchant?: SongoskritiMerchantFooterInfo,
): Section[] {
  // SectionBuilder drops the unused extras channel (see blueprint note
  // above), so the skin-default wrapper feeds straight into the blueprint.
  return buildSongoskritiFooter(withSongoskritiDefaults(s), merchant);
}
