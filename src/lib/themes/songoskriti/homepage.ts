import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import { withSongoskritiDefaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti homepage — deep fashion-catalog rebuild.
 *
 * Structural hierarchy (30+ sections, Nakhrali-depth commerce):
 *
 * announcement → hero → visual category discovery
 * → saree collection rail → jamdani editorial → new arrivals
 * → festive split campaign → bestsellers → occasion grid
 * → panjabi men campaign → everyday heritage rail → wedding edit
 * → jewellery rail → heritage story (loom) → artisan story
 * → ugc gallery → testimonials → blog/editorial
 * → trust strip → store locator → newsletter → footer
 *
 * All new section types are rendered by the extended songoskriti.tsx.
 * Existing widget types (product_rail, split_feature, craft_story, etc.)
 * are reused wherever the shape matches.
 */
export function buildHomepageMain(s: SectionBuilder): Section[] {
  s = withSongoskritiDefaults(s);
  const c = DEFAULT_PERMALINKS.collectionBase; // "/c"

  return [
    // ────────────────────────────────────────────────────────────────────
    // 1. HERO — full-bleed cinematic campaign, 3 rotating slides
    // ────────────────────────────────────────────────────────────────────
    s("hero_carousel", {
      skin: "fullbleed",
      slides: [
        {
          image: "/ph/songoskriti/hero-festive.png",
          headline: "HERITAGE,\nWOVEN FOR TODAY",
          headline_bn: "ঐতিহ্য,\nআজকের জন্য বোনা",
          subhead:
            "Contemporary silhouettes rooted in the craft of Bangladesh.",
          subhead_bn: "বাংলাদেশের কারুশিল্পে প্রোথিত আধুনিক সিলুয়েট।",
          ctaLabel: "SHOP NEW ARRIVALS",
          ctaLabel_bn: "নতুন সংগ্রহ দেখুন",
          ctaUrl: `${c}/new-in`,
          caption: "EXPLORE HERITAGE",
          caption_bn: "ঐতিহ্য অন্বেষণ করুন",
        },
        {
          image: "/ph/songoskriti/edit-festive-main.png",
          headline: "THE FESTIVE\nEDIT",
          headline_bn: "উৎসবের\nবিশেষ সংগ্রহ",
          subhead:
            "Jamdani drapes, silk textures and modern Panjabis made for celebrations.",
          subhead_bn: "উৎসবের জন্য জামদানি, সিল্ক ও আধুনিক পাঞ্জাবি।",
          ctaLabel: "SHOP FESTIVE",
          ctaLabel_bn: "উৎসব সংগ্রহ",
          ctaUrl: `${c}/festive`,
          caption: "SHOP WOMEN",
          caption_bn: "নারীর সংগ্রহ",
        },
        {
          image: "/ph/songoskriti/hero-weaves.png",
          headline: "THE ART OF\nJAMDANI",
          headline_bn: "জামদানির\nশিল্পকলা",
          subhead:
            "Fine threads. Patient hands. A legacy that still moves forward.",
          subhead_bn:
            "সূক্ষ্ম সুতো। ধৈর্যশীল হাত। এক ঐতিহ্য যা এখনও এগিয়ে চলে।",
          ctaLabel: "EXPLORE JAMDANI",
          ctaLabel_bn: "জামদানি দেখুন",
          ctaUrl: `${c}/jamdani`,
          caption: "HERITAGE HANDLOOM",
          caption_bn: "ঐতিহ্যবাহী হাতে বোনা",
        },
      ],
      autoAdvanceMs: 5000,
      atmosphere: "wash",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 2. VISUAL CATEGORY DISCOVERY — 6 large editorial tiles
    // ────────────────────────────────────────────────────────────────────
    s("department_grid", {
      heading: "SHOP THE COLLECTION",
      heading_bn: "সংগ্রহ দেখুন",
      columns: 6,
      departments: [
        {
          title: "Sarees",
          image: "/ph/songoskriti/cat-women.png",
          href: `${c}/sarees`,
        },
        {
          title: "Panjabi",
          image: "/ph/songoskriti/cat-men.png",
          href: `${c}/panjabi`,
        },
        {
          title: "Festive",
          image: "/ph/songoskriti/hero-festive.png",
          href: `${c}/festive`,
        },
        {
          title: "Wedding",
          image: "/ph/songoskriti/edit-festive-main.png",
          href: `${c}/wedding`,
        },
        {
          title: "Jewellery",
          image: "/ph/songoskriti/cat-jewelry.png",
          href: `${c}/jewellery`,
        },
        {
          title: "Heritage",
          image: "/ph/songoskriti/hero-weaves.png",
          href: `${c}/heritage`,
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 3. SIGNATURE SAREES — major product collection rail (8–12 items)
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "SIGNATURE SAREES",
      heading_bn: "সিগনেচার শাড়ি",
      subhead: "Handloom stories for every occasion.",
      subhead_bn: "প্রতিটি উপলক্ষের জন্য হাতে বোনা গল্প।",
      limit: 10,
      source: "collection",
      collection: "sarees",
      cardVariant: "standard",
      showRating: false,
      badgeLabel: "HANDLOOM",
      promise: "Free delivery · 7-day exchange",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 4. THE ART OF JAMDANI — full-bleed editorial campaign break
    // ────────────────────────────────────────────────────────────────────
    s("craft_story", {
      eyebrow: "HERITAGE COLLECTION",
      eyebrow_bn: "ঐতিহ্য সংগ্রহ",
      heading: "THE ART OF JAMDANI",
      heading_bn: "জামদানির শিল্পকলা",
      body: "Fine threads. Patient hands. A legacy that still moves forward.",
      body_bn: "সূক্ষ্ম সুতো। ধৈর্যশীল হাত। এক ঐতিহ্য যা এখনও এগিয়ে চলে।",
      ctaLabel: "EXPLORE JAMDANI",
      ctaHref: `${c}/jamdani`,
      imageUrl: "/ph/songoskriti/hero-weaves.png",
      scrim: true,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 5. NEW ARRIVALS — horizontal product carousel
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "NEW ARRIVALS",
      heading_bn: "নতুন এসেছে",
      subhead: "New pieces, fresh weaves, just in.",
      subhead_bn: "নতুন বুনন, সদ্য এসেছে।",
      limit: 10,
      source: "collection",
      collection: "new-in",
      cardVariant: "standard",
      showRating: false,
      badgeLabel: "NEW",
      promise: "Just arrived",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 6. THE FESTIVE EDIT — split campaign (women + men)
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "THE FESTIVE EDIT",
      heading_bn: "উৎসবের সাজ",
      body: "Jamdani drapes, silk textures and modern Panjabis made for celebrations that feel entirely your own.",
      body_bn: "জামদানি, সিল্ক ও আধুনিক পাঞ্জাবিতে আপনার উৎসব সম্পূর্ণ করুন।",
      ctaLabel: "SHOP WOMEN",
      ctaUrl: `${c}/women`,
      ctaLabel2: "SHOP MEN",
      ctaUrl2: `${c}/men`,
      primaryImage: "/ph/songoskriti/edit-festive-main.png",
      secondaryImage: "/ph/songoskriti/cat-men.png",
      layout: "image_left",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 7. MOST LOVED — bestsellers with rating
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "MOST LOVED",
      heading_bn: "সবচেয়ে জনপ্রিয়",
      subhead: "Pieces our customers return to.",
      subhead_bn: "যে পণ্যগুলো বারবার ফিরে আসে।",
      limit: 10,
      source: "collection",
      collection: "festive",
      cardVariant: "standard",
      showRating: false,
      badgeLabel: "BESTSELLER",
      promise: "Free delivery across Bangladesh",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 8. SHOP BY OCCASION — expanded occasion grid (7 occasions)
    // ────────────────────────────────────────────────────────────────────
    s("finder_row", {
      heading: "SHOP BY OCCASION",
      heading_bn: "উপলক্ষ অনুযায়ী কিনুন",
      body: "Pick a moment — we take you straight to matching weaves, silhouettes and collections.",
      body_bn: "আপনার উপলক্ষ বেছে নিন — আমরা আপনাকে সঠিক সংগ্রহে পৌঁছে দেব।",
      o1Label: "EID & FESTIVE",
      o1Href: `${c}/festive`,
      o2Label: "WEDDING",
      o2Href: `${c}/wedding`,
      o3Label: "MEHENDI",
      o3Href: `${c}/mehendi`,
      o4Label: "SANGEET",
      o4Href: `${c}/sangeet`,
      o5Label: "GIFTING",
      o5Href: `${c}/gifting`,
      o6Label: "EVERYDAY",
      o6Href: `${c}/everyday`,
      o7Label: "FAMILY MATCHING",
      o7Href: `${c}/family`,
      buttonLabel: "BROWSE ALL OCCASIONS",
      buttonHref: `${c}/occasions`,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 9. THE MODERN PANJABI — men's campaign (split)
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "THE MODERN\nPANJABI",
      heading_bn: "আধুনিক\nপাঞ্জাবি",
      body: "Tradition, cut for today. Premium handloom and cotton Panjabis for the discerning man.",
      body_bn: "ঐতিহ্য, আজকের জন্য কাটা। বিশেষ হাতে বোনা ও কটন পাঞ্জাবি।",
      ctaLabel: "SHOP PANJABI",
      ctaUrl: `${c}/panjabi`,
      primaryImage: "/ph/songoskriti/campaign-men.png",
      secondaryImage: "/ph/songoskriti/cat-men.png",
      layout: "image_right",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 10. MEN'S PRODUCT RAIL — compact panjabi carousel beneath campaign
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "SHOP PANJABI",
      heading_bn: "পাঞ্জাবি সংগ্রহ",
      subhead: "Handloom, cotton, silk — for every occasion.",
      subhead_bn: "হাতে বোনা, কটন, সিল্ক — প্রতিটি উপলক্ষের জন্য।",
      limit: 8,
      source: "collection",
      collection: "panjabi",
      cardVariant: "standard",
      showRating: false,
      badgeLabel: "HERITAGE",
      promise: "Made with care",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 11. EVERYDAY HERITAGE — lighter everyday wear section
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "EVERYDAY HERITAGE",
      heading_bn: "দৈনন্দিন ঐতিহ্য",
      subhead: "Cotton sarees, handloom staples and everyday ethnic pieces.",
      subhead_bn: "কটন শাড়ি, হাতে বোনা এবং দৈনন্দিন জাতিগত পোশাক।",
      limit: 8,
      source: "collection",
      collection: "everyday",
      cardVariant: "standard",
      showRating: false,
      promise: "Wearable every day",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 12. THE WEDDING EDIT — high-impact wedding section (split)
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "THE WEDDING\nEDIT",
      heading_bn: "বিয়ের\nবিশেষ সংগ্রহ",
      body: "Bride. Groom. Bridesmaids. Wedding guests. Gifts. Elegant ivory, muted rose and deep green — for the moments that matter.",
      body_bn: "বধূ, বর, সাক্ষী — বিশেষ মুহূর্তের জন্য।",
      ctaLabel: "SHOP BRIDE",
      ctaUrl: `${c}/wedding`,
      ctaLabel2: "SHOP GROOM",
      ctaUrl2: `${c}/groom`,
      primaryImage: "/ph/songoskriti/edit-festive-main.png",
      secondaryImage: "/ph/songoskriti/prod-saree.png",
      layout: "image_left",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 13. HERITAGE COLLECTIONS — 4-tile signature weaves grid
    // ────────────────────────────────────────────────────────────────────
    s("collection_story", {
      heading: "FROM THE LOOM",
      heading_bn: "তাঁত থেকে",
      subhead:
        "Jamdani, Tangail Taant, Rajshahi Silk and Nakshi Kantha — timeless weaves, each with a story.",
      subhead_bn: "জামদানি, টাঙ্গাইল তাঁত, রাজশাহী সিল্ক ও নকশি কাঁথা।",
      collections: [
        {
          title: "Jamdani",
          image: "/ph/songoskriti/hero-weaves.png",
          href: `${c}/jamdani`,
          subtitle: "UNESCO Heritage",
        },
        {
          title: "Rajshahi Silk",
          image: "/ph/songoskriti/prod-saree.png",
          href: `${c}/silk`,
          subtitle: "Artisan crafted",
        },
        {
          title: "Tangail Handloom",
          image: "/ph/songoskriti/cat-newin.png",
          href: `${c}/tangail`,
          subtitle: "Limited weave",
        },
        {
          title: "Nakshi Kantha",
          image: "/ph/songoskriti/cat-living.png",
          href: `${c}/kantha`,
          subtitle: "Master stitch",
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 14. JEWELLERY / COMPLETE THE LOOK
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "COMPLETE THE LOOK",
      heading_bn: "সম্পূর্ণ করুন লুক",
      subhead: "Jhumka, necklaces, bangles and heritage accessories.",
      subhead_bn: "ঝুমকা, নেকলেস, চুড়ি ও ঐতিহ্যবাহী গহনা।",
      limit: 8,
      source: "collection",
      collection: "jewellery",
      cardVariant: "standard",
      showRating: false,
      badgeLabel: "ARTISAN",
      promise: "Handcrafted jewellery",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 15. ARTISAN STORY — the human behind the weave
    // ────────────────────────────────────────────────────────────────────
    s("craft_story", {
      eyebrow: "THE HANDS BEHIND THE WEAVE",
      eyebrow_bn: "বুননের পেছনের হাত",
      heading: "Made Slowly.\nWorn for Years.",
      heading_bn: "ধীরে তৈরি।\nবছরের পর বছর পরা।",
      body: "In Tangail, Sonargaon and across Bangladesh, generations of artisans carry techniques that cannot be mass-produced.",
      body_bn:
        "টাঙ্গাইল, সোনারগাঁয়ে প্রজন্মের পর প্রজন্ম তাঁতিরা সংরক্ষণ করছেন যে কৌশল।",
      ctaLabel: "MEET THE ARTISANS",
      ctaHref: "/blog/artisan-story",
      imageUrl: "/ph/songoskriti/hero-artisans.png",
      scrim: true,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 16. WORN BY YOU — social proof / UGC gallery (6–9 images)
    // ────────────────────────────────────────────────────────────────────
    s("ugc_gallery", {
      heading: "WORN BY YOU",
      heading_bn: "আপনার পরিধানে",
      subhead: "SONGOSKRITI IN THE WORLD",
      subhead_bn: "সংস্কৃতি সারা দুনিয়ায়",
      images:
        "/ph/songoskriti/ugc-1.png, /ph/songoskriti/ugc-2.png, /ph/songoskriti/ugc-3.png, /ph/songoskriti/ugc-4.png",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 17. TESTIMONIALS — elegant review carousel
    // ────────────────────────────────────────────────────────────────────
    s("testimonials", {
      skin: "carousel",
      autoAdvanceMs: 6000,
      testimonials: [
        {
          quote:
            "The Jamdani saree I received was breathtaking. The weave is so intricate — I've never seen anything like it in any store.",
          author: "Nusrat Rahman",
          role: "Dhaka · Jamdani Saree",
        },
        {
          quote:
            "My husband's Panjabi arrived beautifully packaged. The handloom quality is exceptional — exactly the kind of craftsmanship you can't find elsewhere.",
          author: "Priya Chakraborty",
          role: "Chittagong · Handloom Panjabi",
        },
        {
          quote:
            "Ordered for Eid and it arrived on time with care. The cotton saree feels amazing to wear — light, breathable and strikingly beautiful.",
          author: "Tasnim Ahmed",
          role: "Sylhet · Cotton Saree",
        },
        {
          quote:
            "Finally a Bangladeshi brand that takes both craft and packaging seriously. The Nakshi Kantha piece I bought is a work of art.",
          author: "Farhan Islam",
          role: "Rajshahi · Nakshi Kantha",
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 18. THE SONGOSKRITI JOURNAL — blog/editorial content cards
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "THE SONGOSKRITI\nJOURNAL",
      heading_bn: "সংস্কৃতির\nজার্নাল",
      body: "Stories from the loom, styling guides and the heritage behind every thread.",
      body_bn: "তাঁত থেকে গল্প, স্টাইলিং গাইড ও প্রতিটি সুতোর পেছনের ইতিহাস।",
      ctaLabel: "HOW TO IDENTIFY AUTHENTIC JAMDANI →",
      ctaUrl: "/blog/authentic-jamdani",
      ctaLabel2: "WHAT TO WEAR TO A BENGALI WEDDING →",
      ctaUrl2: "/blog/bengali-wedding",
      primaryImage: "/ph/songoskriti/hero-weaves.png",
      secondaryImage: "/ph/songoskriti/hero-artisans.png",
      layout: "image_right",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 19. WHY SONGOSKRITI — trust/service strip
    // ────────────────────────────────────────────────────────────────────
    s("trust_footer", {
      items: [
        {
          icon: "secure",
          title: "AUTHENTIC CRAFT",
          body: "Verified artisan-made pieces — no factory substitutes",
        },
        {
          icon: "delivery",
          title: "NATIONWIDE DELIVERY",
          body: "Reliable delivery across Bangladesh",
        },
        {
          icon: "returns",
          title: "EASY EXCHANGE",
          body: "Straightforward 7-day exchange policy",
        },
        {
          icon: "support",
          title: "HUMAN SUPPORT",
          body: "Real people, not automated walls",
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 20. STORE LOCATIONS — flagship retail presence
    // ────────────────────────────────────────────────────────────────────
    s("store_locator", {
      heading: "VISIT SONGOSKRITI",
      heading_bn: "সংস্কৃতি দেখুন",
      s1Name: "Uttara Flagship",
      s1Hours: "Open 10am – 9pm daily",
      s2Name: "Gulshan Showroom",
      s2Hours: "Open 10am – 9pm daily",
      s3Name: "Chattogram Store",
      s3Hours: "Open 10am – 8pm daily",
    }),
  ];
}
