/**
 * BlueOcean footer — declared catalog keys only, bilingual twins
 * throughout. Socials stay empty until the merchant supplies real
 * profiles (never fabricated).
 */
import type { Section } from "../../builder-ast";
import { withBlueoceanDefaults } from "./skins";
import type { SectionBuilder } from "./types";

export function buildFooterMain(s: SectionBuilder): Section[] {
  const ws = withBlueoceanDefaults(s);
  return [
    ws("footer_sitemap", {
      brandName: "BlueOcean",
      brandName_bn: "ব্লুওশান",
      statementHeading: "Woven for real calendars",
      statementHeading_bn: "আসল ক্যালেন্ডারের জন্য বোনা",
      statementBody: "Ethnic wear for monsoon weddings, Eid mornings and workdays — festive shelves at everyday doors.",
      statementBody_bn: "বর্ষার বিয়ে, ঈদের সকাল ও অফিস — প্রতিটি দিনের জন্য এথনিক পোশাক।",
      c1Title: "Shop",
      c1Title_bn: "কেনাকাটা",
      c1Links: "New in|/collections/new-in, Suit Sets|/collections/suit-sets, Kurtas|/collections/kurtas, Sarees|/collections/sarees, Sale|/collections/sale",
      c1Links_bn: "নতুন সংগ্রহ|/collections/new-in, স্যুট সেট|/collections/suit-sets, কুর্তা|/collections/kurtas, শাড়ি|/collections/sarees, সেল|/collections/sale",
      c2Title: "Help",
      c2Title_bn: "সহায়তা",
      c2Links: "Contact|/pages/contact, Shipping|/pages/shipping, Exchanges|/pages/exchanges, FAQ|/pages/faq",
      c2Links_bn: "যোগাযোগ|/pages/contact, ডেলিভারি|/pages/shipping, বদল|/pages/exchanges, প্রশ্নোত্তর|/pages/faq",
      c3Title: "About",
      c3Title_bn: "আমাদের সম্পর্কে",
      c3Links: "Our story|/pages/about, Stores|/pages/stores, Journal|/blog",
      c3Links_bn: "আমাদের গল্প|/pages/about, স্টোর|/pages/stores, জার্নাল|/blog",
      newsletterHeading: "New drops, first inbox",
      newsletterHeading_bn: "নতুন ড্রপ, সবার আগে ইনবক্সে",
      newsletterButton: "Subscribe",
      newsletterButton_bn: "সাবস্ক্রাইব",
      newsletterConsent: "Only drops and sales. Unsubscribe anytime.",
      newsletterConsent_bn: "শুধু ড্রপ ও সেলের জন্য। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
      paymentsHeading: "We accept",
      paymentsHeading_bn: "আমরা গ্রহণ করি",
      paymentsMarks: "bKash, Nagad, Visa, Mastercard, COD",
      socials: "",
    }),
    ws("payment_icons", {
      heading: "We accept",
      heading_bn: "আমরা গ্রহণ করি",
      marks: "bKash, Nagad, Visa, Mastercard, COD",
    }),
    ws("rich_text", {
      body: "© 2026 BlueOcean. All rights reserved. Prices include VAT.",
      body_bn: "© ২০২৬ ব্লুওশান। সর্বস্বত্ব সংরক্ষিত। দামে ভ্যাট অন্তর্ভুক্ত।",
      align: "center",
      size: "sm",
    }),
  ];
}
