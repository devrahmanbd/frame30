import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti homepage rhythm (spec §2, 8 sections in order).
 *
 * All eight types resolve via `catalogEntry` (Task 2 gap pack). Copy
 * gates: sentence case throughout, no invented metrics (craft story
 * carries no numbers; Task 4 seeds demo-labeled figures), one primary
 * CTA per section.
 */
export function buildHomepageMain(s: SectionBuilder): Section[] {
  const c = DEFAULT_PERMALINKS.collectionBase; // "/c"
  return [
    // 1. Announcement marquee (single on page; bilingual lines).
    s("announcement_bar", {
      m1: "Festive drop is live",
      m1_bn: "উৎসবের নতুন কালেকশন এসেছে",
      m2: "Free delivery over BDT 2,000",
      m2_bn: "২,০০০ টাকার বেশি কেনাকাটায় ফ্রি ডেলিভারি",
      m3: "",
      href: `${c}/new-in`,
      dismissible: true,
      rotateMs: 6000,
    }),
    // 2. Hero carousel ×3 (slide 1 of 3 authored here; Task 4 seeds all
    // three slides with festive/handloom/artisan art).
    s("hero_carousel", {
      slides: [
        {
          image: "",
          headline: "Woven for celebration",
          headline_bn: "উৎসবের জন্য বোনা",
          subhead: "Handloom sarees and panjabis in festive colour.",
          subhead_bn: "উৎসবের রঙে হাতে বোনা শাড়ি ও পাঞ্জাবি।",
          ctaLabel: "Shop festive",
          ctaUrl: `${c}/festive`,
          caption: "Festive drop",
        },
      ],
      autoAdvanceMs: 6000,
      atmosphere: "wash",
    }),
    // 4. Shop-by-category circles ×6.
    s("circle_categories", {
      heading: "Shop by category",
      heading_bn: "ক্যাটাগরি অনুযায়ী কিনুন",
      c1Title: "Women",
      c1Title_bn: "নারী",
      c1Image: "",
      c1Href: `${c}/women`,
      c2Title: "Men",
      c2Title_bn: "পুরুষ",
      c2Image: "",
      c2Href: `${c}/men`,
      c3Title: "Kids",
      c3Title_bn: "শিশু",
      c3Image: "",
      c3Href: `${c}/kids`,
      c4Title: "Home and living",
      c4Title_bn: "হোম ও লিভিং",
      c4Image: "",
      c4Href: `${c}/living`,
      c5Title: "Jewellery",
      c5Title_bn: "গয়না",
      c5Image: "",
      c5Href: `${c}/jewellery`,
      c6Title: "New in",
      c6Title_bn: "নতুন এসেছে",
      c6Image: "",
      c6Href: `${c}/new-in`,
      c7Title: "",
      c7Image: "",
      c7Href: "",
      c8Title: "",
      c8Image: "",
      c8Href: "",
    }),
    // 5. Occasion finder entry (Eid/festive, wedding, gifting).
    s("finder_row", {
      heading: "Shop by occasion",
      heading_bn: "উপলক্ষ অনুযায়ী কিনুন",
      body: "",
      o1Label: "Eid and festive",
      o1Label_bn: "ঈদ ও উৎসব",
      o1Href: `${c}/festive`,
      o2Label: "Wedding",
      o2Label_bn: "বিয়ে",
      o2Href: `${c}/wedding`,
      o3Label: "Gifting",
      o3Label_bn: "উপহার",
      o3Href: `${c}/gifting`,
      buttonLabel: "",
      buttonHref: "",
    }),
    // 6. Product rail (new arrivals; Task 4 may seed the second rail).
    s("product_rail", {
      heading: "New arrivals",
      heading_bn: "নতুন এসেছে",
      limit: 12,
      source: "collection",
      collection: "new-in",
      cardVariant: "compact",
      showRating: false,
      promise: "",
    }),
    // 7. Craft story (copy only; stats: real or demo-labeled numbers in
    // Task 4, never fabricated here).
    s("craft_story", {
      eyebrow: "Our craft",
      eyebrow_bn: "আমাদের কারুকাজ",
      heading: "From loom to wardrobe",
      heading_bn: "তাঁত থেকে আপনার কাছে",
      body: "We work with weaving clusters across Bengal. Every piece carries the name of its maker.",
      body_bn: "বাংলার তাঁতিদের সঙ্গে আমরা কাজ করি। প্রতিটি পণ্যে রয়েছে কারিগরের নাম।",
      ctaLabel: "Read our story",
      ctaLabel_bn: "আমাদের গল্প পড়ুন",
      ctaHref: "/pages/our-craft",
      imageUrl: "",
      scrim: true,
    }),
    // 8a. Testimonials (single quote authored here; Task 4 may seed more).
    s("testimonials", {
      testimonials: [
        {
          quote: "The jamdani drapes beautifully and arrived on time.",
          quote_bn: "জামদানিটি চমৎকার এবং সময়মতো পৌঁছেছে।",
          author: "Nasrin",
          author_bn: "নাসরিন",
          role: "Dhaka",
          role_bn: "ঢাকা",
          image: "",
        },
      ],
      autoAdvanceMs: 6000,
    }),
    // 8b. Trust footer (delivery/returns/payment assurances; newsletter
    // lives in the footer chrome).
    s("trust_footer", {
      items: [],
      i1Icon: "delivery",
      i1Title: "Fast delivery",
      i1Title_bn: "দ্রুত ডেলিভারি",
      i1Body: "",
      i2Icon: "returns",
      i2Title: "Easy returns",
      i2Title_bn: "সহজ রিটার্ন",
      i2Body: "",
      i3Icon: "secure",
      i3Title: "Secure payment",
      i3Title_bn: "নিরাপদ পেমেন্ট",
      i3Body: "",
      i4Icon: "support",
      i4Title: "",
      i4Body: "",
    }),
  ];
}
