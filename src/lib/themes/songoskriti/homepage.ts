import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti homepage rhythm — SECTION-track blueprint mapped onto this
 * tree's Task-built catalog types.
 *
 * Track-to-tree type map (the track's five names do not exist in this
 * tree's `builder-ast` catalog, and duplicating them would fork the five
 * Task-2 gap entries, their studio defs, and every parity test — so the
 * track's structure/copy lands on the existing equivalents):
 *
 * - track `department_grid`  → `circle_categories` (same role: shop by
 *   category; kept on the tree's scalar c1–c6 props + real IA, because the
 *   track's Jamdani/Panjabi/Kantha/Silk/Taant/Gifting tiles point at
 *   `/c/*` collections that do not exist in demo data)
 * - track `gift_finder`      → `finder_row` (occasion finder; kept on the
 *   tree's o-label/o-href props — the track's panjabi/jamdani/silk queries
 *   have no matching `/c/` routes, so the tree's verified festive/wedding/
 *   gifting hrefs stay; the track's heading/body/browse-all CTA is adopted)
 * - track `heritage_story`   → `craft_story`
 * - track `testimonial_carousel` → `testimonials` (3-quote wall content
 *   lands on the tree's testimonials rows; the carousel renderer + dots
 *   stay, pinned by `songoskriti.test.tsx`)
 * - track `trust_bar`        → `trust_footer` (track copy lands on the
 *   renderer's preferred `items[]` rows)
 * - track `marquee_strip`    → covered by the `announcement_bar` (one
 *   marquee max per page; the announcement keeps the promo lines)
 *
 * 9 sections: announcement, hero ×3 slides (festive first), category
 * circles ×6, occasion finder, TWO product rails (new arrivals + festive
 * bestsellers, per the track), craft story, testimonials ×3, trust.
 *
 * Imagery: only real files under `/ph/songoskriti/*.png` (generated hero,
 * category, and product art). The track's `/api/public/ph/songoskriti/*.svg`
 * paths are not used — no such files exist.
 *
 * Copy gates: sentence case throughout, no invented metrics (craft story
 * carries no numbers), one primary CTA per section.
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
    // 2. Hero carousel ×3, festive first (track copy; tree renderer fields).
    s("hero_carousel", {
      slides: [
        {
          image: "/ph/songoskriti/hero-festive.png",
          headline: "Woven for the season of light",
          headline_bn: "আলোর উৎসবের জন্য বোনা",
          subhead: "Jamdani sarees and silk panjabis for festive days.",
          subhead_bn: "উৎসবের দিনগুলোর জন্য জামদানি শাড়ি ও সিল্ক পাঞ্জাবি।",
          ctaLabel: "Shop festive",
          ctaUrl: `${c}/festive`,
          caption: "Festive drop",
        },
        {
          image: "/ph/songoskriti/hero-weaves.png",
          headline: "Sixty-four districts, one loom",
          headline_bn: "চৌষট্টি জেলা, এক তাঁত",
          subhead: "Fair-trade handloom from master weavers.",
          subhead_bn: "মাস্টার তাঁতিদের ন্যায্য বাণিজ্যের হাতে বোনা পণ্য।",
          ctaLabel: "Our story",
          ctaUrl: "/pages/about",
          caption: "Living craft",
        },
        {
          image: "/ph/songoskriti/hero-artisans.png",
          headline: "Every thread keeps a name",
          headline_bn: "প্রতিটি সুতোয় একটি নাম",
          subhead: "Kantha embroidery stitched by rural artisans.",
          subhead_bn: "গ্রামের কারিগরদের হাতে সেলাই করা কাঁথার কাজ।",
          ctaLabel: "Meet the makers",
          ctaUrl: "/blog/master-weavers",
          caption: "Artisan owned",
        },
      ],
      autoAdvanceMs: 6000,
      atmosphere: "wash",
    }),
    // 3. Shop-by-category circles ×6 (real IA + real art).
    s("circle_categories", {
      heading: "Shop by category",
      heading_bn: "ক্যাটাগরি অনুযায়ী কিনুন",
      c1Title: "Women",
      c1Title_bn: "নারী",
      c1Image: "/ph/songoskriti/cat-women.png",
      c1Href: `${c}/women`,
      c2Title: "Men",
      c2Title_bn: "পুরুষ",
      c2Image: "/ph/songoskriti/cat-men.png",
      c2Href: `${c}/men`,
      c3Title: "Kids",
      c3Title_bn: "শিশু",
      c3Image: "/ph/songoskriti/cat-kids.png",
      c3Href: `${c}/kids`,
      c4Title: "Home and living",
      c4Title_bn: "হোম ও লিভিং",
      c4Image: "/ph/songoskriti/cat-living.png",
      c4Href: `${c}/living`,
      c5Title: "Jewellery",
      c5Title_bn: "গয়না",
      c5Image: "/ph/songoskriti/cat-jewelry.png",
      c5Href: `${c}/jewellery`,
      c6Title: "New in",
      c6Title_bn: "নতুন এসেছে",
      c6Image: "/ph/songoskriti/cat-newin.png",
      c6Href: `${c}/new-in`,
      c7Title: "",
      c7Image: "",
      c7Href: "",
      c8Title: "",
      c8Image: "",
      c8Href: "",
    }),
    // 4. Occasion finder (track heading/body/browse-all CTA on verified
    // collection hrefs — Eid/festive, wedding, gifting).
    s("finder_row", {
      heading: "Dress for the occasion",
      heading_bn: "উপলক্ষের সাজ",
      body: "Pick a moment — we take you straight to matching weaves.",
      body_bn: "একটি উপলক্ষ বেছে নিন — মানানসই বুননে পৌঁছে দেব।",
      o1Label: "Eid and festive",
      o1Label_bn: "ঈদ ও উৎসব",
      o1Href: `${c}/festive`,
      o2Label: "Wedding",
      o2Label_bn: "বিয়ে",
      o2Href: `${c}/wedding`,
      o3Label: "Gifting",
      o3Label_bn: "উপহার",
      o3Href: `${c}/gifting`,
      buttonLabel: "Browse all festive",
      buttonLabel_bn: "সব উৎসবের পোশাক দেখুন",
      buttonHref: `${c}/festive`,
    }),
    // 5a. Product rail: new arrivals (track shape: editorial + rating +
    // dispatch promise).
    s("product_rail", {
      heading: "New arrivals",
      heading_bn: "নতুন এসেছে",
      limit: 8,
      source: "collection",
      collection: "new-in",
      cardVariant: "editorial",
      showRating: true,
      promise: "In stock · Dispatched in 24h",
      promise_bn: "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
    }),
    // 5b. Product rail: festive bestsellers (track's second rail).
    s("product_rail", {
      heading: "Festive bestsellers",
      heading_bn: "উৎসবের জনপ্রিয়",
      limit: 8,
      source: "collection",
      collection: "festive",
      cardVariant: "editorial",
      showRating: true,
      promise: "Loved across 64 districts",
      promise_bn: "সারা দেশে জনপ্রিয়",
    }),
    // 6. Craft story (track heritage copy on the tree renderer fields;
    // copy only — no numbers, never fabricated).
    s("craft_story", {
      eyebrow: "The master weavers",
      eyebrow_bn: "মাস্টার তাঁতিরা",
      heading: "A living legacy on wooden looms",
      heading_bn: "কাঠের তাঁতে জীবন্ত ঐতিহ্য",
      body: "In Tangail and Sonargaon, master weavers dye, warp and weave every thread by hand — no two pieces exactly alike.",
      body_bn:
        "টাঙ্গাইল ও সোনারগাঁয়ে মাস্টার তাঁতিরা প্রতিটি সুতো হাতে রং করেন ও বোনেন — কোনো দুটি পণ্য হুবহু এক নয়।",
      ctaLabel: "Read the story",
      ctaLabel_bn: "গল্পটি পড়ুন",
      ctaHref: "/blog/master-weavers",
      imageUrl: "/ph/songoskriti/hero-artisans.png",
      scrim: true,
    }),
    // 7. Testimonials ×3 (track quote wall on the tree's rows; the
    // carousel renderer keeps dots + line-clamp-3).
    s("testimonials", {
      testimonials: [
        {
          quote: "The Jamdani drapes like water — fine, alive, unforgettable.",
          quote_bn:
            "জামদানিটি পানির মতো ঝরে — সূক্ষ্ম, প্রাণবন্ত, অবিস্মরণীয়।",
          author: "Farhana Ahmed",
          author_bn: "ফারহানা আহমেদ",
          role: "Dhaka",
          role_bn: "ঢাকা",
          image: "",
        },
        {
          quote: "Three Eids in our panjabis. Honest stitching, honest price.",
          quote_bn: "আমাদের পাঞ্জাবিতে তিনটি ঈদ। সৎ সেলাই, সৎ দাম।",
          author: "Tanvir Rahman",
          author_bn: "তানভীর রহমান",
          role: "Chattogram",
          role_bn: "চট্টগ্রাম",
          image: "",
        },
        {
          quote: "Kantha quilt arrived wrapped like a gift to ourselves.",
          quote_bn: "কাঁথাটি এসেছে নিজেদের জন্য উপহারের মতো মোড়ানো।",
          author: "Nusrat Jahan",
          author_bn: "নুসরাত জাহান",
          role: "Sylhet",
          role_bn: "সিলেট",
          image: "",
        },
      ],
      autoAdvanceMs: 6000,
    }),
    // 8. Trust assurances (track copy on the renderer's preferred items[]
    // rows; newsletter lives in the footer chrome).
    s("trust_footer", {
      items: [
        {
          icon: "delivery",
          title: "48h dispatch",
          title_bn: "৪৮ ঘণ্টায় ডিসপ্যাচ",
          body: "Nationwide delivery across Bangladesh",
          body_bn: "সারা বাংলাদেশে ডেলিভারি",
        },
        {
          icon: "returns",
          title: "7-day exchange",
          title_bn: "৭ দিনে বদল",
          body: "Easy size and style swaps",
          body_bn: "সহজে সাইজ ও স্টাইল বদলান",
        },
        {
          icon: "secure",
          title: "Genuine craft",
          title_bn: "খাঁটি কারুকাজ",
          body: "Certified by master weavers",
          body_bn: "মাস্টার তাঁতিদের সনদপ্রাপ্ত",
        },
        {
          icon: "support",
          title: "Helpline 10am-9pm",
          title_bn: "হেল্পলাইন সকাল ১০টা–রাত ৯টা",
          body: "Real humans, every day",
          body_bn: "প্রতিদিন আসল মানুষ",
        },
      ],
      i1Icon: "delivery",
      i1Title: "",
      i1Body: "",
      i2Icon: "returns",
      i2Title: "",
      i2Body: "",
      i3Icon: "secure",
      i3Title: "",
      i3Body: "",
      i4Icon: "support",
      i4Title: "",
      i4Body: "",
    }),
  ];
}
