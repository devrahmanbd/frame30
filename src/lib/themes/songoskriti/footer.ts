import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti statement footer + newsletter (spec §2 item 8 tail).
 * Exactly one primary CTA (the newsletter subscribe button).
 */
export function buildFooterMain(s: SectionBuilder): Section[] {
  const c = DEFAULT_PERMALINKS.collectionBase; // "/c"
  const p = DEFAULT_PERMALINKS.pageBase; // "/pages"
  return [
    s("newsletter", {
      heading: "Letters from the loom",
      heading_bn: "তাঁতের চিঠি",
      body: "New drops and artisan stories, once a month. No spam.",
      body_bn: "নতুন কালেকশন ও কারিগরের গল্প, মাসে একবার।",
      buttonLabel: "Subscribe",
      buttonLabel_bn: "সাবস্ক্রাইব করুন",
      consentText: "Unsubscribe any time.",
      consentText_bn: "যেকোনো সময় আনসাবস্ক্রাইব করুন।",
    }),
    s("footer_sitemap", {
      c1Title: "Shop",
      c1Title_bn: "কেনাকাটা",
      c1Links: `Women|${c}/women, Men|${c}/men, Kids|${c}/kids, New in|${c}/new-in`,
      c2Title: "Help",
      c2Title_bn: "সহায়তা",
      c2Links: `Contact|${p}/contact, Shipping|${p}/shipping, Returns|${p}/returns`,
      c3Title: "About",
      c3Title_bn: "আমাদের সম্পর্কে",
      c3Links: `Our craft|${p}/our-craft, Journal|/blog`,
      c4Title: "",
      c4Links: "",
    }),
  ];
}
