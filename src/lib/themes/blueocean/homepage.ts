/**
 * BlueOcean homepage — long ethnic-editorial marketplace rhythm.
 *
 * Biba-grade discovery in an original voice: fullbleed hero → category
 * circles → Most Loved rail → festive split → new-week rail → colour
 * circles → live collection grid → trust strip → craft story → wall of
 * voices → stores → newsletter.
 *
 * Imageless by default (every media slot degrades to its neutral
 * placeholder), evergreen copy only — no fabricated discounts,
 * ratings, prices, addresses or store names.
 */
import type { Section } from "../../builder-ast";
import { withBlueoceanDefaults } from "./skins";
import type { SectionBuilder } from "./types";

export function buildHomepageMain(s: SectionBuilder): Section[] {
  const ws = withBlueoceanDefaults(s);
  const c = "/collections";

  return [
    // 1. HERO — fullbleed carousel, 3 shopping slides (H1 on slide 1).
    ws("hero_carousel", {
      skin: "fullbleed",
      slides: [
        {
          image: "",
          headline: "MONSOON FESTIVE EDIT",
          headline_bn: "বর্ষার উৎসব সংগ্রহ",
          subhead: "Suit sets, sarees and co-ords for rainy-day weddings and Eid gatherings.",
          subhead_bn: "বৃষ্টির বিয়ে ও ঈদের আয়োজনের জন্য স্যুট সেট, শাড়ি ও কো-অর্ড।",
          ctaLabel: "SHOP FESTIVE",
          ctaLabel_bn: "উৎসব সংগ্রহ দেখুন",
          ctaUrl: `${c}/festive`,
          caption: "NEW SEASON",
          caption_bn: "নতুন সিজন",
        },
        {
          image: "",
          headline: "EVERYDAY COTTONS",
          headline_bn: "প্রতিদিনের সুতি",
          subhead: "Breathable kurtas and easy sets for workdays and slow weekends.",
          subhead_bn: "অফিস ও অলস ছুটির দিনের জন্য হালকা কুর্তা ও সহজ সেট।",
          ctaLabel: "SHOP KURTAS",
          ctaLabel_bn: "কুর্তা দেখুন",
          ctaUrl: `${c}/kurtas`,
          caption: "WORK TO WEEKEND",
          caption_bn: "অফিস থেকে ছুটির দিন",
        },
        {
          image: "",
          headline: "LITTLE FESTIVE ONES",
          headline_bn: "ছোটদের উৎসব",
          subhead: "Girls' suits and minis in joyful festive colour.",
          subhead_bn: "উৎসবের রঙে মেয়েদের স্যুট ও মিনি।",
          ctaLabel: "SHOP GIRLS",
          ctaLabel_bn: "মেয়েদের সংগ্রহ",
          ctaUrl: `${c}/girls`,
          caption: "GIRLS & JOY",
          caption_bn: "মেয়েরা ও আনন্দ",
        },
      ] as any,
      autoAdvanceMs: 6000,
      atmosphere: "wash",
    }),
    // 2. CATEGORY CIRCLES — marketplace taxonomy, bilingual tiles.
    ws("circle_categories", {
      heading: "Shop by Category",
      heading_bn: "ক্যাটাগরি দেখুন",
      reveal: "rise",
      c1Title: "Suit Sets",
      c1Title_bn: "স্যুট সেট",
      c1Href: `${c}/suit-sets`,
      c2Title: "Kurtas",
      c2Title_bn: "কুর্তা",
      c2Href: `${c}/kurtas`,
      c3Title: "Sarees",
      c3Title_bn: "শাড়ি",
      c3Href: `${c}/sarees`,
      c4Title: "Dresses",
      c4Title_bn: "ড্রেস",
      c4Href: `${c}/dresses`,
      c5Title: "Bottoms",
      c5Title_bn: "বটম",
      c5Href: `${c}/bottoms`,
      c6Title: "Girls",
      c6Title_bn: "মেয়েদের",
      c6Href: `${c}/girls`,
      c7Title: "Jewellery",
      c7Title_bn: "গহনা",
      c7Href: `${c}/jewellery`,
      c8Title: "Sale",
      c8Title_bn: "সেল",
      c8Href: `${c}/sale`,
    }),
    // 3. MOST LOVED — bestsellers rail, editorial skin.
    ws("product_rail", {
      heading: "MOST LOVED",
      heading_bn: "সবচেয়ে জনপ্রিয়",
      limit: 10,
      source: "bestsellers",
      cardVariant: "standard",
      showRating: true,
      promise: "Free delivery · 7-day exchange",
      promise_bn: "ফ্রি ডেলিভারি · ৭ দিনের বদল",
      skin: "editorial",
      reveal: "rise",
    }),
    // 4. FESTIVE SPLIT — campaign break, text-led.
    ws("split_feature", {
      eyebrow: "MONSOON WEDDINGS",
      eyebrow_bn: "বর্ষার বিয়ে",
      heading: "Celebration dressing, lightened",
      heading_bn: "হালকা উৎসব সাজ",
      body: "Silk textures, easy anarkalis and two-piece sets — celebration wear without the heavy price tag.",
      body_bn: "সিল্ক, সহজ আনারকলি ও টু-পিস সেট — ভারী দাম ছাড়াই উৎসবের পোশাক।",
      ctaLabel: "SHOP OCCASION",
      ctaLabel_bn: "অনুষ্ঠান সংগ্রহ",
      ctaHref: `${c}/occasion`,
      imageUrl: "",
      imageAlt: "",
      flip: true,
      reveal: "rise",
    }),
    // 5. NEW THIS WEEK — recommendation source, editorial rail.
    ws("product_rail", {
      heading: "NEW THIS WEEK",
      heading_bn: "এই সপ্তাহে নতুন",
      limit: 10,
      source: "recommended",
      cardVariant: "standard",
      showRating: false,
      promise: "Fresh picks, honest prices",
      promise_bn: "নতুন বাছাই, সৎ দাম",
      skin: "editorial",
      reveal: "rise",
    }),
    // 6. COLOUR CIRCLES — filtered-collection discovery.
    ws("circle_categories", {
      heading: "Shop by Colour",
      heading_bn: "রঙ দেখুন",
      reveal: "rise",
      c1Title: "White",
      c1Title_bn: "সাদা",
      c1Href: `${c}/white`,
      c2Title: "Pink",
      c2Title_bn: "গোলাপি",
      c2Href: `${c}/pink`,
      c3Title: "Blue",
      c3Title_bn: "নীল",
      c3Href: `${c}/blue`,
      c4Title: "Green",
      c4Title_bn: "সবুজ",
      c4Href: `${c}/green`,
      c5Title: "Black",
      c5Title_bn: "কালো",
      c5Href: `${c}/black`,
      c6Title: "Red",
      c6Title_bn: "লাল",
      c6Href: `${c}/red`,
      c7Title: "",
      c7Href: "",
      c8Title: "",
      c8Href: "",
    }),
    // 7. COLLECTION GRID — live data, bilingual heading.
    ws("collection_grid", {
      heading: "Shop by Collection",
      heading_bn: "কালেকশন দেখুন",
      limit: 8,
      columns: 4,
      showCount: true,
      cardVariant: "standard",
    }),
    // 8. TRUST STRIP — three proof badges, real claims only.
    ws("trust_marquee", {
      items: [
        {
          icon: "delivery",
          title: "Free Shipping",
          title_bn: "ফ্রি ডেলিভারি",
          body: "Orders over BDT 2,000",
          body_bn: "২০০০ টাকার উপরে অর্ডারে",
        },
        {
          icon: "secure",
          title: "Secure Payments",
          title_bn: "নিরাপদ পেমেন্ট",
          body: "bKash · Nagad · Cards · COD",
          body_bn: "বিকাশ · নগদ · কার্ড · ক্যাশ",
        },
        {
          icon: "returns",
          title: "Easy Exchange",
          title_bn: "সহজ বদল",
          body: "7-day exchange",
          body_bn: "৭ দিনের বদল",
        },
      ] as any,
      speed: "normal",
    }),
    // 9. CRAFT STORY — single editorial block, text-led.
    ws("collection_story", {
      eyebrow: "OUR PROMISE",
      eyebrow_bn: "আমাদের প্রতিশ্রুতি",
      heading: "Woven for real calendars",
      heading_bn: "আসল ক্যালেন্ডারের জন্য বোনা",
      body: "BlueOcean curates ethnic wear for monsoon weddings, Eid mornings and workdays — festive shelves at everyday doors.",
      body_bn: "বর্ষার বিয়ে, ঈদের সকাল ও অফিস — প্রতিটি দিনের জন্য এথনিক পোশাক, সৎ দামে।",
      ctaLabel: "OUR STORY",
      ctaLabel_bn: "আমাদের গল্প",
      ctaHref: "/pages/about",
      imageUrl: "",
      scrim: false,
      reveal: "fade",
    }),
    // 10. WALL OF VOICES — single illustrative voice.
    ws("testimonials", {
      testimonials: [
        {
          quote: "Breathable fabric, honest price — my Eid suit arrived ready to wear.",
          quote_bn: "হালকা ফ্যাব্রিক, সৎ দাম — ঈদের স্যুট পরার মতো হয়েই এসেছে।",
          author: "A happy customer",
          author_bn: "একজন সন্তুষ্ট ক্রেতা",
          role: "Verified buyer",
          role_bn: "যাচাইকৃত ক্রেতা",
        },
      ] as any,
      autoAdvanceMs: 6000,
      skin: "wall",
      reveal: "fade",
    }),
    // 11. STORES — city names + hours only, never invented addresses.
    ws("store_locator", {
      heading: "Visit Our Stores",
      heading_bn: "আমাদের স্টোরে আসুন",
      s1Name: "Flagship — Dhaka",
      s1Name_bn: "ফ্ল্যাগশিপ — ঢাকা",
      s1Hours: "Open 10am – 9pm",
      s1Hours_bn: "সকাল ১০টা – রাত ৯টা",
      s2Name: "Store — Chattogram",
      s2Name_bn: "স্টোর — চট্টগ্রাম",
      s2Hours: "Open 10am – 9pm",
      s2Hours_bn: "সকাল ১০টা – রাত ৯টা",
      reveal: "rise",
    }),
    // 12. NEWSLETTER — the single signup CTA.
    ws("newsletter", {
      heading: "New drops, first inbox",
      heading_bn: "নতুন ড্রপ, সবার আগে ইনবক্সে",
      body: "New arrivals, restocks and sale alerts. One useful letter — never spam.",
      body_bn: "নতুন সংগ্রহ, রিস্টক ও সেল অ্যালার্ট। একটি কাজের চিঠি — কোনো স্প্যাম নয়।",
      buttonLabel: "Subscribe",
      buttonLabel_bn: "সাবস্ক্রাইব",
      consentText: "We email only for drops and sales. Unsubscribe anytime.",
      consentText_bn: "শুধু ড্রপ ও সেলের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
      reveal: "fade",
    }),
  ];
}
