import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import { withSongoskritiDefaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti homepage — deep fashion-catalog rebuild.
 *
 * Structural hierarchy (21 sections / 12 distinct types — port inventory A1):
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
  const p = DEFAULT_PERMALINKS.productBase; // "/p"

  return [
    // ────────────────────────────────────────────────────────────────────
    // 1. HERO — full-bleed cinematic campaign, 3 rotating slides
    // ────────────────────────────────────────────────────────────────────
    s("hero_carousel", {
      skin: "fullbleed",
      slides: [
        {
          image: "/ph/songoskriti/hero-festive.jpg",
          headline: "Handloom Sarees & Festive Wear",
          headline_bn: "হ্যান্ডলুম শাড়ি ও উৎসবের পোশাক",
          subhead:
            "Authentic hand-woven Jamdani, Rajshahi silk, and festive panjabis.",
          subhead_bn: "আসল তাঁতের জামদানি, রাজশাহী সিল্ক এবং উৎসবের পাঞ্জাবি।",
          ctaLabel: "Shop New Arrivals",
          ctaLabel_bn: "নতুন সংগ্রহ দেখুন",
          ctaUrl: `${c}/new-in`,
        },
        {
          image: "/ph/songoskriti/edit-festive-main.jpg",
          headline: "The Festive Edit",
          headline_bn: "উৎসবের বিশেষ সংগ্রহ",
          subhead:
            "Jamdani drapes, silk textures and modern Panjabis made for celebrations.",
          subhead_bn: "উৎসবের জন্য জামদানি, সিল্ক ও আধুনিক পাঞ্জাবি।",
          ctaLabel: "Shop Festive",
          ctaLabel_bn: "উৎসব সংগ্রহ",
          ctaUrl: `${c}/festive`,
        },
        {
          image: "/ph/songoskriti/hero-weaves.jpg",
          headline: "Dhakai Jamdani & Silk Weaves",
          headline_bn: "ঢাকাই জামদানি ও সিল্কের বুনন",
          subhead:
            "Traditional geometric motifs and heritage weaves crafted on authentic wooden pit looms.",
          subhead_bn:
            "ঐতিহ্যবাহী কাঠের তাঁতে বোনা ক্লাসিক জ্যামিতিক নকশার জামদানি ও সিল্ক।",
          ctaLabel: "Explore Heritage Weaves",
          ctaLabel_bn: "ঐতিহ্যবাহী বুনন দেখুন",
          ctaUrl: `${c}/heritage`,
        },
      ],
      autoAdvanceMs: 6000,
      atmosphere: "wash",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 2. VISUAL CATEGORY DISCOVERY — 6 large editorial tiles
    // ────────────────────────────────────────────────────────────────────
    s("department_grid", {
      heading: "SHOP THE COLLECTION",
      heading_bn: "সংগ্রহ দেখুন",
      columns: 6,
      advMotion: "rise",
      departments: [
        {
          title: "Sarees",
          image: "/ph/songoskriti/prod-saree.png",
          href: `${c}/sarees`,
        },
        {
          title: "Panjabi",
          image: "/ph/songoskriti/prod-panjabi.png",
          href: `${c}/panjabi`,
        },
        {
          title: "Festive",
          image: "/ph/songoskriti/hero-festive.jpg",
          href: `${c}/festive`,
        },
        {
          title: "Wedding",
          image: "/ph/songoskriti/edit-festive-main.jpg",
          href: `${c}/wedding`,
        },
        {
          title: "Jewellery",
          image: "/ph/songoskriti/cat-jewelry.png",
          href: `${c}/jewellery`,
        },
        {
          title: "Heritage",
          image: "/ph/songoskriti/cat-newin.png",
          href: `${c}/heritage`,
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 3. SIGNATURE SAREES — major product collection rail (8–12 items)
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "Signature Sarees",
      heading_bn: "সিগনেচার শাড়ি",
      subhead: "Hand-woven Jamdani, Katan, and pure silk sarees.",
      subhead_bn: "হাতে বোনা জামদানি, কাতান এবং পিওর সিল্ক শাড়ি।",
      limit: 10,
      source: "collection",
      collection: "sarees",
      cardVariant: "standard",
      showRating: false,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 4. THE ART OF JAMDANI — full-bleed editorial campaign break
    // ────────────────────────────────────────────────────────────────────
    s("craft_story", {
      eyebrow: "HERITAGE COLLECTION",
      eyebrow_bn: "ঐতিহ্য সংগ্রহ",
      heading: "THE ART OF JAMDANI",
      heading_bn: "জামদানির শিল্পকলা",
      body: "Fine cotton and silk threads woven by hand on traditional wooden pit looms.",
      body_bn: "কাঠের তাঁতে হাতে বোনা ঐতিহ্যবাহী সুতি ও সিল্কের জামদানি।",
      ctaLabel: "EXPLORE JAMDANI",
      ctaLabel_bn: "জামদানি দেখুন",
      ctaHref: `${c}/jamdani`,
      imageUrl: "/ph/songoskriti/hero-weaves.jpg",
      scrim: true,
      advMotion: "fade",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 5. NEW ARRIVALS — horizontal product carousel
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "New arrivals",
      heading_bn: "নতুন এসেছে",
      subhead: "Latest additions to our seasonal collections.",
      subhead_bn: "আমাদের সাম্প্রতিক কালেকশনের নতুন সংযোজন।",
      limit: 10,
      source: "collection",
      collection: "new-in",
      cardVariant: "compact",
      showRating: false,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 6. THE FESTIVE EDIT — split campaign (women + men)
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "THE FESTIVE EDIT",
      heading_bn: "উৎসবের সাজ",
      body: "Festive collection featuring pure silk sarees, tailored panjabis, and celebratory attire.",
      body_bn: "উৎসবের কালেকশন: পিওর সিল্ক শাড়ি, পাঞ্জাবি এবং উৎসবের পোশাক।",
      ctaLabel: "SHOP WOMEN",
      ctaLabel_bn: "নারীর সংগ্রহ",
      ctaUrl: `${c}/women`,
      ctaLabel2: "SHOP MEN",
      ctaLabel2_bn: "পুরুষের সংগ্রহ",
      ctaUrl2: `${c}/men`,
      primaryImage: "/ph/songoskriti/edit-festive-main.jpg",
      secondaryImage: "/ph/songoskriti/cat-men.jpg",
      layout: "image_left",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 7. FESTIVE SELECTION — curated festive attire
    // Reference per-device override (mobile merchandising): 10 across on
    // desktop, 4 on phones. The bp layer only accepts responsive fields.
    {
      ...s("product_rail", {
        heading: "Festive Selection",
        heading_bn: "উৎসবের সংগ্রহ",
        subhead: "Curated handloom sarees and festive attire.",
        subhead_bn: "নির্বাচিত তাঁতের শাড়ি এবং উৎসবের পোশাক।",
        limit: 10,
        source: "collection",
        collection: "festive",
        cardVariant: "editorial",
        showRating: false,
      }),
      bp: { mobile: { limit: 4 } },
    },

    // 7b. RECENTLY VIEWED — personal shelf (Biba-style re-entry point).
    s("recently_viewed", {
      heading: "Recently viewed",
      heading_bn: "সম্প্রতি দেখা",
      limit: 6,
      showClear: true,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 8. SHOP BY OCCASION — expanded occasion grid (7 occasions)
    // ────────────────────────────────────────────────────────────────────
    s("finder_row", {
      heading: "Shop by occasion",
      heading_bn: "উপলক্ষ অনুযায়ী কিনুন",
      body: "Curated attire for Eid, weddings, holud ceremonies, and festive gatherings.",
      body_bn: "ঈদ, বিয়ে, গায়ে হলুদ ও পারিবারিক উৎসবের জন্য পোশাক।",
      o1Label: "EID & FESTIVE",
      o1Label_bn: "ঈদ ও উৎসব",
      o1Href: `${c}/festive`,
      o2Label: "WEDDING",
      o2Label_bn: "বিয়ে",
      o2Href: `${c}/wedding`,
      o3Label: "MEHENDI",
      o3Label_bn: "মেহেদি",
      o3Href: `${c}/mehendi`,
      o4Label: "SANGEET",
      o4Label_bn: "সঙ্গীত সন্ধ্যা",
      o4Href: `${c}/sangeet`,
      o5Label: "GIFTING",
      o5Label_bn: "উপহার",
      o5Href: `${c}/gifting`,
      o6Label: "EVERYDAY",
      o6Label_bn: "প্রতিদিনের",
      o6Href: `${c}/everyday`,
      o7Label: "FAMILY MATCHING",
      o7Label_bn: "পারিবারিক ম্যাচিং",
      o7Href: `${c}/family`,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 9. THE MODERN PANJABI — men's campaign (split)
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "THE MODERN\nPANJABI",
      heading_bn: "আধুনিক\nপাঞ্জাবি",
      body: "Tailored handloom cotton and silk panjabis for festive occasions and everyday wear.",
      body_bn: "উৎসব ও দৈনন্দিন ব্যবহারের জন্য সুতি এবং সিল্কের পাঞ্জাবি।",
      ctaLabel: "SHOP PANJABI",
      ctaLabel_bn: "পাঞ্জাবি সংগ্রহ",
      ctaUrl: `${c}/panjabi`,
      primaryImage: "/ph/songoskriti/campaign-men.jpg",
      secondaryImage: "/ph/songoskriti/cat-men.jpg",
      layout: "image_right",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 10. MEN'S PRODUCT RAIL — compact panjabi carousel beneath campaign
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "Shop Panjabi",
      heading_bn: "পাঞ্জাবি সংগ্রহ",
      subhead: "Handloom, cotton, silk — for every occasion.",
      subhead_bn: "হাতে বোনা, কটন, সিল্ক — প্রতিটি উপলক্ষের জন্য।",
      limit: 8,
      source: "collection",
      collection: "panjabi",
      cardVariant: "compact",
      showRating: false,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 11. EVERYDAY HERITAGE — lighter everyday wear section
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "Everyday heritage",
      heading_bn: "দৈনন্দিন ঐতিহ্য",
      subhead: "Cotton sarees, handloom staples and everyday ethnic pieces.",
      subhead_bn: "কটন শাড়ি, হাতে বোনা এবং দৈনন্দিন জাতিগত পোশাক।",
      limit: 8,
      source: "collection",
      collection: "everyday",
      cardVariant: "standard",
      showRating: false,
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
      ctaLabel_bn: "বধূর সংগ্রহ",
      ctaUrl: `${c}/wedding`,
      ctaLabel2: "SHOP GROOM",
      ctaLabel2_bn: "বরের সংগ্রহ",
      ctaUrl2: `${c}/groom`,
      primaryImage: "/ph/songoskriti/edit-festive-main.jpg",
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
        "Hand-loomed Jamdani, Rajshahi silk, Tangail taant, and Nakshi Kantha.",
      subhead_bn:
        "জামদানি, রাজশাহী সিল্ক, টাঙ্গাইল তাঁত এবং নকশী কাঁথা সংগ্রহ।",
      collections: [
        {
          title: "Jamdani",
          image: "/ph/songoskriti/hero-weaves.jpg",
          href: `${c}/jamdani`,
          subtitle: "Traditional Handloom",
        },
        {
          title: "Rajshahi Silk",
          image: "/ph/songoskriti/prod-saree.png",
          href: `${c}/rajshahi-silk`,
          subtitle: "Pure Silk Weave",
        },
        {
          title: "Tangail Handloom",
          image: "/ph/songoskriti/cat-newin.png",
          href: `${c}/heritage-handloom`,
          subtitle: "Cotton Taant",
        },
        {
          title: "Nakshi Kantha",
          image: "/ph/songoskriti/cat-living.png",
          href: `${c}/nakshi-kantha`,
          subtitle: "Hand-Embroidered",
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 14. JEWELLERY / COMPLETE THE LOOK
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "Complete the Look",
      heading_bn: "সম্পূর্ণ করুন লুক",
      subhead: "Filigree brass, jhumkas, and heritage handcrafted accessories.",
      subhead_bn: "ঝুমকা, নেকলেস, চুড়ি ও ঐতিহ্যবাহী গহনা।",
      limit: 8,
      source: "collection",
      collection: "jewellery",
      cardVariant: "editorial",
      showRating: false,
    }),

    // ────────────────────────────────────────────────────────────────────
    // 15. ARTISAN STORY — the human behind the weave
    // ────────────────────────────────────────────────────────────────────
    s("craft_story", {
      eyebrow: "HANDLOOM WEAVING",
      eyebrow_bn: "তাঁত বুনন",
      heading: "Handcrafted Sarees & Attire",
      heading_bn: "হাতে তৈরি শাড়ি ও পোশাক",
      body: "Carefully woven fabrics and traditional attire crafted by Bangladeshi weavers.",
      body_bn: "বাংলাদেশি তাঁতিদের তৈরি যত্নশীল ঐতিহ্যবাহী শাড়ি ও পোশাক।",
      ctaLabel: "EXPLORE HERITAGE",
      ctaLabel_bn: "ঐতিহ্য অন্বেষণ করুন",
      ctaHref: `${c}/heritage`,
      imageUrl: "/ph/songoskriti/hero-artisans.jpg",
      scrim: true,
      advMotion: "line-reveal",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 16. SEASONAL LOOKBOOK — editorial lookbook
    // ────────────────────────────────────────────────────────────────────
    s("ugc_gallery", {
      heading: "SEASONAL LOOKBOOK",
      heading_bn: "সিজনাল লুকবুক",
      subhead: "FLAME FASHION BD LOOKBOOK",
      subhead_bn: "ফ্লেম ফ্যাশন লুকবুক",
      handleLabel: "Follow @flamefashionbd",
      handleHref: "https://instagram.com/flamefashionbd",
      images:
        "/ph/songoskriti/ugc-1.jpg, /ph/songoskriti/ugc-2.jpg, /ph/songoskriti/ugc-3.png, /ph/songoskriti/ugc-4.png, /ph/songoskriti/ugc-5.jpg, /ph/songoskriti/ugc-6.jpg",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 17. TESTIMONIALS — elegant review carousel
    // ────────────────────────────────────────────────────────────────────
    s("testimonials", {
      skin: "carousel",
      autoAdvanceMs: 6000,
      testimonials: [],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 18. THE FLAME FASHION BD JOURNAL — blog/editorial content cards
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "THE FLAME FASHION BD\nJOURNAL",
      heading_bn: "ফ্লেম ফ্যাশন\nজার্নাল",
      body: "Styling guides, fabric care, and stories about our traditional collections.",
      body_bn: "স্টাইলিং নির্দেশিকা, কাপড়ের যত্ন এবং আমাদের ঐতিহ্যবাহী কালেকশনের গল্প।",
      ctaLabel: "HOW TO IDENTIFY AUTHENTIC JAMDANI →",
      ctaLabel_bn: "খাঁটি জামদানি চেনার উপায় →",
      ctaUrl: "/blog/authentic-jamdani",
      ctaLabel2: "WHAT TO WEAR TO A BENGALI WEDDING →",
      ctaLabel2_bn: "বাঙালি বিয়েতে কী পরবেন →",
      ctaUrl2: "/blog/bengali-wedding",
      primaryImage: "/ph/songoskriti/hero-weaves.jpg",
      secondaryImage: "/ph/songoskriti/hero-artisans.jpg",
      layout: "image_right",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 19. TRUST STRIP — policy-verified merchant assurances
    // ────────────────────────────────────────────────────────────────────
    s("trust_footer", {
      items: [
        {
          icon: "delivery",
          title: "CASH ON DELIVERY",
          title_bn: "ক্যাশ অন ডেলিভারি",
          policyKey: "cod",
        },
        {
          icon: "support",
          title: "CUSTOMER CARE",
          title_bn: "গ্রাহক সেবা",
          policyKey: "support",
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 20. STORE LOCATIONS — clean default (no fictional physical outlets)
    // ────────────────────────────────────────────────────────────────────
    s("store_locator", {
      heading: "Store Locations",
      heading_bn: "স্টোর লোকেশন",
    }),
  ];
}
