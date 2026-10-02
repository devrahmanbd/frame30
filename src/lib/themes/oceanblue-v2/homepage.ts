import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import { withOceanblueV2Defaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * Oceanblue-v2 homepage — maroon studied-DNA discovery rhythm (spec §3).
 *
 * Structural hierarchy (11 main sections + header/footer chrome = 14
 * spec slots, maroon campaign rhythm):
 *
 * hero (4 photographic slides, banner skin) → visual category tiles
 * → Most Loved rail → maroon split campaign → Recommended rail
 * → Shop by Color → trust marquee → editorial story → single
 * testimonial → store locator → newsletter.
 *
 * Imageless by default: every media slot degrades to its neutral
 * placeholder (MediaFrame muted frame, circle initial, null rails), so a
 * fresh install renders complete with copy only and the merchant's
 * photography drops in 1:1. No fabricated metrics, ratings, prices,
 * addresses or store names in defaults.
 */
export function buildHomepageMain(s: SectionBuilder): Section[] {
  s = withOceanblueV2Defaults(s);
  const c = DEFAULT_PERMALINKS.collectionBase; // "/c"

  return [
    // ────────────────────────────────────────────────────────────────────
    // 1. HERO — banner carousel, 4 campaign slides (H1 claimed by slide 1).
    // NOTE: the announcement bar is intentionally NOT a main section —
    // `announcement_bar` is header/footer-slotted only, and the shared
    // StoreHeader already renders the chrome announcement copy, so
    // authoring one here would double-render (or go invalid in main).
    // ────────────────────────────────────────────────────────────────────
    s("hero_carousel", {
      skin: "banner",
      slides: [
        {
          image: "/ph/oceanblue-v2/hero-newin.jpg",
          headline: "New Season, Everyday Ethnic",
          headline_bn: "নতুন সিজন, প্রতিদিনের এথনিক",
          subhead: "Salwar sets, kurtas and sarees for workdays and weddings.",
          subhead_bn: "অফিস ও বিয়ে — সব উপলক্ষে সালোয়ার সেট, কুর্তা ও শাড়ি।",
          ctaLabel: "Shop New Arrivals",
          ctaLabel_bn: "নতুন সংগ্রহ দেখুন",
          ctaUrl: `${c}/new-in`,
          caption: "AW'26 is here",
          caption_bn: "নতুন সিজন এসেছে",
        },
        {
          image: "/ph/oceanblue-v2/hero-wedding.jpg",
          headline: "The Wedding Edit",
          headline_bn: "বিয়ের বিশেষ সংগ্রহ",
          subhead: "Lehengas, anarkalis and jewellery sets for the big day.",
          subhead_bn: "বড় দিনের জন্য লেহেঙ্গা, আনারকলি ও গহনার সেট।",
          ctaLabel: "Shop Wedding",
          ctaLabel_bn: "বিয়ের সংগ্রহ",
          ctaUrl: `${c}/wedding`,
          caption: "Wedding splendor",
          caption_bn: "বিয়ের জাঁকজমক",
        },
        {
          image: "/ph/oceanblue-v2/hero-girls.jpg",
          headline: "Girls, Festive & Bright",
          headline_bn: "মেয়েদের উৎসবমুখর সংগ্রহ",
          subhead: "Festive minis, girls' suits and bright young fits.",
          subhead_bn: "উৎসবের মিনি, মেয়েদের স্যুট ও উজ্জ্বল নতুন ফিট।",
          ctaLabel: "Shop Girls",
          ctaLabel_bn: "মেয়েদের সংগ্রহ",
          ctaUrl: `${c}/girls`,
          caption: "Young & festive",
          caption_bn: "তরুণ ও উৎসবমুখর",
        },
        {
          image: "",
          headline: "Nxt: Fresh Fits, Young Mood",
          headline_bn: "এনএক্সটি — নতুন ফিট, তরুণ মেজাজ",
          subhead: "Easy co-ords, playful prints and everyday statements.",
          subhead_bn: "সহজ কো-অর্ড, মজার প্রিন্ট ও প্রতিদিনের স্টেটমেন্ট।",
          ctaLabel: "Shop Nxt",
          ctaLabel_bn: "এনএক্সটি দেখুন",
          ctaUrl: `${c}/nxt`,
          caption: "Just landed",
          caption_bn: "সদ্য এসেছে",
        },
      ],
      autoAdvanceMs: 5000,
      atmosphere: "wash",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 2. VISUAL CATEGORY DISCOVERY — 8 circle tiles
    // ────────────────────────────────────────────────────────────────────
    s("circle_categories", {
      heading: "Shop by Category",
      heading_bn: "ক্যাটাগরি দেখুন",
      reveal: "rise",
      c1Title: "Salwar Kameez",
      c1Href: `${c}/salwar-kameez`,
      c2Title: "Kurtas & Tops",
      c2Href: `${c}/kurtas-tops`,
      c3Title: "Dresses",
      c3Href: `${c}/dresses`,
      c4Title: "Bottoms",
      c4Href: `${c}/bottoms`,
      c5Title: "Girls",
      c5Href: `${c}/girls`,
      c6Title: "Jewellery",
      c6Href: `${c}/jewellery`,
      c7Title: "Collections",
      c7Href: `${c}/collections`,
      c8Title: "Sale",
      c8Href: `${c}/sale`,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 3. MOST LOVED — bestsellers source, minimal rail
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "Most Loved",
      heading_bn: "সবচেয়ে জনপ্রিয়",
      limit: 10,
      source: "bestsellers",
      cardVariant: "standard",
      showRating: true,
      promise: "Free delivery · 7-day exchange",
      promise_bn: "ফ্রি ডেলিভারি · ৭ দিনের বদল",
      skin: "minimal",
      reveal: "rise",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 4. MAROON SPLIT — campaign break, text-led, single real permalink
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "The Festive Edit",
      heading_bn: "উৎসবের বিশেষ সংগ্রহ",
      body: "Two-piece sets, silk textures and easy festive kurtas — celebration dressing without the heavy price tag.",
      body_bn:
        "টু-পিস সেট, সিল্ক ও সহজ উৎসব কুর্তা — ভারী দাম ছাড়াই উৎসবের সাজ।",
      ctaLabel: "Shop Festive",
      ctaLabel_bn: "উৎসব সংগ্রহ",
      ctaHref: `${c}/festive`,
      reveal: "rise",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 5. RECOMMENDED — recommendation source, minimal rail
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "Recommended for You",
      heading_bn: "আপনার জন্য",
      limit: 10,
      source: "recommended",
      cardVariant: "standard",
      showRating: false,
      promise: "Picked for this season",
      promise_bn: "এই সিজনের বাছাই",
      skin: "minimal",
      reveal: "rise",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 6. SHOP BY COLOR — color-family tiles to filtered collections
    // ────────────────────────────────────────────────────────────────────
    s("circle_categories", {
      heading: "Shop by Color",
      heading_bn: "রঙ দেখুন",
      reveal: "rise",
      c1Title: "White",
      c1Href: `${c}/white`,
      c2Title: "Pink",
      c2Href: `${c}/pink`,
      c3Title: "Blue",
      c3Href: `${c}/blue`,
      c4Title: "Green",
      c4Href: `${c}/green`,
      c5Title: "Black",
      c5Href: `${c}/black`,
      c6Title: "Red",
      c6Href: `${c}/red`,
      c7Title: "Maroon",
      c7Href: `${c}/maroon`,
      c8Title: "Gold",
      c8Href: `${c}/gold`,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 7. TRUST MARQUEE — three proof badges, real claims only
    // ────────────────────────────────────────────────────────────────────
    s("trust_marquee", {
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
          title: "Easy Return",
          title_bn: "সহজ রিটার্ন",
          body: "7-day exchange",
          body_bn: "৭ দিনের বদল",
        },
      ],
      speed: "normal",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 8. BRAND STORY — single editorial block, text-led
    // ────────────────────────────────────────────────────────────────────
    s("collection_story", {
      eyebrow: "Our promise",
      eyebrow_bn: "আমাদের প্রতিশ্রুতি",
      heading: "Festive shelves, everyday doors",
      heading_bn: "উৎসবের তাক, প্রতিদিনের দরজায়",
      body: "Oceanblue curates ethnic wear for real calendars — office days, Eid mornings and wedding nights — at prices that stay honest.",
      body_bn:
        "অফিস, ঈদের সকাল ও বিয়ের রাত — আসল ক্যালেন্ডারের জন্য এথনিক পোশাক, সৎ দামে।",
      ctaLabel: "Our story",
      ctaLabel_bn: "আমাদের গল্প",
      ctaHref: "/pages/about",
      imageUrl: "",
      scrim: false,
      reveal: "fade",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 9. TESTIMONIAL — single illustrative voice, honestly labelled
    // ────────────────────────────────────────────────────────────────────
    s("testimonials", {
      testimonials: [
        {
          quote: "Good quality for the price, and the exchange was painless.",
          quote_bn: "দামের তুলনায় ভালো মান, আর বদলানো ছিল ঝামেলাহীন।",
          author: "A happy customer",
          author_bn: "একজন সন্তুষ্ট ক্রেতা",
          role: "Illustrative review",
          role_bn: "নমুনা পর্যালোচনা",
        },
      ],
      autoAdvanceMs: 6000,
      skin: "single",
      reveal: "fade",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 10. STORE LOCATOR — names + hours only; addresses/phones are the
    // merchant's to fill (never invented here)
    // ────────────────────────────────────────────────────────────────────
    s("store_locator", {
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

    // ────────────────────────────────────────────────────────────────────
    // 11. NEWSLETTER — the single signup CTA
    // ────────────────────────────────────────────────────────────────────
    s("newsletter", {
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
      reveal: "fade",
    }),
  ];
}
