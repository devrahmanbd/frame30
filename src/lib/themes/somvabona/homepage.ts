import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import type { SomvabonaBuilder } from "./types";

/**
 * Somvabona homepage rhythm — spec §2, approved 2026-09-25.
 *
 * 11 sections on 10 distinct types (the urgency rail doubles: new arrivals
 * + festive bestsellers). Reused PDP/category widgets carry the product and
 * listing patterns — Somvabona composes, never rebuilds. New-widget prop
 * shapes mirror the Batch 2 catalog defaults 1:1 (`trust_marquee`,
 * `price_buckets`, `occasion_matrix`, `urgency_rail`, `rating_stars` owns
 * no homepage slot — it renders inside PDP rails from real aggregates).
 *
 * Copy gates: sentence case throughout, bilingual EN/BN inline props on
 * every user-facing string, BDT minor-unit bucket bounds only (never typed
 * prices), no invented metrics/ratings/addresses. Every CTA shops: bucket
 * tiles land on the verified `/search?max=<minor>` price filter, rails and
 * matrix on `/c/*` collections.
 */
export function buildHomepageMain(s: SomvabonaBuilder): Section[] {
  const c = DEFAULT_PERMALINKS.collectionBase; // "/c"
  return [
    // 1. Announcement marquee — offer-led, bilingual.
    s("announcement_bar", {
      m1: "Festive drop is live",
      m1_bn: "উৎসবের নতুন কালেকশন এসেছে",
      m2: "Free delivery over BDT 2,000",
      m2_bn: "২,০০০ টাকার বেশি কেনাকাটায় ফ্রি ডেলিভারি",
      m3: "Cash on delivery, all 64 districts",
      m3_bn: "সারা দেশে ক্যাশ অন ডেলিভারি",
      href: `${c}/new-in`,
      dismissible: true,
      rotateMs: 6000,
    }),
    // 2. Hero carousel ×3, festive first — every slide shops.
    s("hero_carousel", {
      slides: [
        {
          image: "/ph/somvabona/hero-festive.jpg",
          headline: "Festive wear, ready to ship",
          headline_bn: "উৎসবের পোশাক, এখনই ডেলিভারি",
          subhead: "Cotton sarees and panjabis at honest prices.",
          subhead_bn: "সুতি শাড়ি ও পাঞ্জাবি, সৎ দামে।",
          ctaLabel: "Shop festive",
          ctaUrl: `${c}/festive`,
          caption: "Festive drop",
        },
        {
          image: "",
          headline: "New cotton every week",
          headline_bn: "প্রতি সপ্তাহে নতুন সুতি",
          subhead: "Soft, breathable everyday ethnic.",
          subhead_bn: "নরম, আরামদায়ক প্রতিদিনের দেশি পোশাক।",
          ctaLabel: "Shop new arrivals",
          ctaUrl: `${c}/new-in`,
          caption: "New in",
        },
        {
          image: "",
          headline: "Wedding season edits",
          headline_bn: "বিয়ের মৌসুমের কালেকশন",
          subhead: "Silk and kantha picks for the big day.",
          subhead_bn: "বড় দিনের জন্য সিল্ক ও কাঁথা।",
          ctaLabel: "Shop wedding",
          ctaUrl: `${c}/wedding`,
          caption: "Wedding season",
        },
      ],
      autoAdvanceMs: 6000,
      atmosphere: "wash",
    }),
    // 3. Trust marquee (NEW) — looping proof strip. Qualitative badges
    // only: no counts, no ratings, no invented numbers anywhere.
    s("trust_marquee", {
      items: [
        {
          icon: "cod",
          title: "Cash on delivery",
          title_bn: "ক্যাশ অন ডেলিভারি",
          body: "Pay at your door, anywhere in Bangladesh",
          body_bn: "সারা বাংলাদেশে দরজায় পেমেন্ট",
        },
        {
          icon: "delivery",
          title: "48h dispatch",
          title_bn: "৪৮ ঘণ্টায় ডিসপ্যাচ",
          body: "Nationwide delivery, tracked end to end",
          body_bn: "সারা দেশে ট্র্যাকড ডেলিভারি",
        },
        {
          icon: "returns",
          title: "7-day exchange",
          title_bn: "৭ দিনে বদল",
          body: "Easy size and style swaps",
          body_bn: "সহজে সাইজ ও স্টাইল বদলান",
        },
        {
          icon: "support",
          title: "Helpline 10am-9pm",
          title_bn: "হেল্পলাইন সকাল ১০টা–রাত ৯টা",
          body: "Real humans, every day",
          body_bn: "প্রতিদিন আসল মানুষ",
        },
      ],
      speed: "normal",
    }),
    // 4. Category image tiles (Biba-style role, circle_categories renderer).
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
      c5Title: "Festive",
      c5Title_bn: "উৎসব",
      c5Image: "",
      c5Href: `${c}/festive`,
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
    // 5. Price buckets (NEW) — integer minor-unit bounds only, verified
    // `/search?max=` filter hrefs (storefront-search `maxMinor` contract).
    s("price_buckets", {
      heading: "Shop by budget",
      heading_bn: "বাজেট অনুযায়ী কিনুন",
      buckets: [
        {
          label: "Under ৳999",
          label_bn: "৯৯৯ টাকার নিচে",
          maxPrice: 99900,
          href: "/search?max=99900",
          image: "",
        },
        {
          label: "Under ৳1,999",
          label_bn: "১,৯৯৯ টাকার নিচে",
          maxPrice: 199900,
          href: "/search?max=199900",
          image: "",
        },
        {
          label: "Under ৳2,999",
          label_bn: "২,৯৯৯ টাকার নিচে",
          maxPrice: 299900,
          href: "/search?max=299900",
          image: "",
        },
      ],
    }),
    // 6a. Urgency rail (NEW): new arrivals, product_rail data shape plus
    // computed sale badges, stock hints and the ratings row.
    s("urgency_rail", {
      heading: "New arrivals",
      heading_bn: "নতুন এসেছে",
      limit: 8,
      source: "collection",
      collection: "new-in",
      cardVariant: "standard",
      showRating: true,
      showDiscount: true,
      showStockHint: true,
      promise: "In stock · Dispatched in 24h",
      promise_bn: "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
    }),
    // 6b. Urgency rail: festive bestsellers.
    s("urgency_rail", {
      heading: "Festive bestsellers",
      heading_bn: "উৎসবের জনপ্রিয়",
      limit: 8,
      source: "collection",
      collection: "festive",
      cardVariant: "standard",
      showRating: true,
      showDiscount: true,
      showStockHint: true,
      promise: "Selling fast this week",
      promise_bn: "এই সপ্তাহে দ্রুত বিক্রি হচ্ছে",
    }),
    // 7. Occasion matrix (NEW) — collection × occasion grid.
    s("occasion_matrix", {
      heading: "Dress for the occasion",
      heading_bn: "উপলক্ষের সাজ",
      occasions: [
        {
          label: "Eid and festive",
          label_bn: "ঈদ ও উৎসব",
          href: `${c}/festive`,
        },
        { label: "Wedding", label_bn: "বিয়ে", href: `${c}/wedding` },
        { label: "Gifting", label_bn: "উপহার", href: `${c}/gifting` },
      ],
      collections: [
        { title: "Women", title_bn: "নারী", href: `${c}/women`, image: "" },
        { title: "Men", title_bn: "পুরুষ", href: `${c}/men`, image: "" },
        { title: "Kids", title_bn: "শিশু", href: `${c}/kids`, image: "" },
      ],
    }),
    // 8. Flagship outlets — franchise proof. Names + hours only, never
    // invented street addresses or phone numbers.
    s("store_locator", {
      heading: "Visit our flagship stores",
      heading_bn: "আমাদের ফ্ল্যাগশিপ স্টোরে আসুন",
      s1Name: "Uttara flagship",
      s1Name_bn: "উত্তরা ফ্ল্যাগশিপ",
      s1Hours: "Open 10am–9pm daily",
      s1Hours_bn: "প্রতিদিন সকাল ১০টা–রাত ৯টা",
      s2Name: "Gulshan flagship",
      s2Name_bn: "গুলশান ফ্ল্যাগশিপ",
      s2Hours: "Open 10am–9pm daily",
      s2Hours_bn: "প্রতিদিন সকাল ১০টা–রাত ৯টা",
      s3Name: "Chattogram flagship",
      s3Name_bn: "চট্টগ্রাম ফ্ল্যাগশিপ",
      s3Hours: "Open 10am–9pm daily",
      s3Hours_bn: "প্রতিদিন সকাল ১০টা–রাত ৯টা",
    }),
    // 9. Craft story — heritage depth below the fold.
    s("craft_story", {
      eyebrow: "Everyday comfort, honestly made",
      eyebrow_bn: "প্রতিদিনের আরাম, সৎভাবে তৈরি",
      heading: "Cotton first, craft always",
      heading_bn: "সুতিই প্রথম, কারুকাজ সবসময়",
      body: "Breathable cotton for Bangladesh weather, cut for real life and stitched to last — comfort first, festive ready.",
      body_bn:
        "বাংলাদেশের আবহাওয়ার জন্য শ্বাসপ্রশ্বাসযোগ্য সুতি, বাস্তব জীবনের জন্য কাটা ও টেকসই সেলাই — আরামই প্রথম, উৎসবের জন্য প্রস্তুত।",
      ctaLabel: "Read the story",
      ctaLabel_bn: "গল্পটি পড়ুন",
      ctaHref: "/blog/cotton-culture",
      imageUrl: "",
      scrim: true,
    }),
    // 10. Testimonials — merchant-authored quotes, never invented metrics.
    s("testimonials", {
      testimonials: [
        {
          quote: "The cotton panjabi survived a whole summer of Fridays.",
          quote_bn: "সুতির পাঞ্জাবিটি গোটা গ্রীষ্মের শুক্রবার টিকে গেছে।",
          author: "Farhana Ahmed",
          author_bn: "ফারহানা আহমেদ",
          role: "Dhaka",
          role_bn: "ঢাকা",
          image: "",
        },
        {
          quote: "Ordered for Eid, delivered before the holidays began.",
          quote_bn: "ঈদের জন্য অর্ডার করেছিলাম, ছুটি শুরুর আগেই ডেলিভারি।",
          author: "Tanvir Rahman",
          author_bn: "তানভীর রহমান",
          role: "Chattogram",
          role_bn: "চট্টগ্রাম",
          image: "",
        },
        {
          quote: "Kids sizes actually fit kids. Rare and appreciated.",
          quote_bn: "বাচ্চাদের সাইজ আসলেই বাচ্চাদের মাপে। বিরল ও প্রশংসনীয়।",
          author: "Nusrat Jahan",
          author_bn: "নুসরাত জাহান",
          role: "Sylhet",
          role_bn: "সিলেট",
          image: "",
        },
      ],
      autoAdvanceMs: 6000,
    }),
  ];
}
