import { DEFAULT_PERMALINKS } from "../../permalink";
import type { Section } from "../../builder-ast";
import { withSongoskritiDefaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti homepage — curated high-fashion editorial composition.
 *
 * Structural hierarchy (10 sections / 8 distinct types):
 *
 * hero_carousel → department_grid → product_rail (signature sarees)
 * → craft_story (artisan loom) → product_rail (new arrivals)
 * → split_feature (festive edit) → collection_story (from the loom)
 * → product_rail (complete the look / jewellery)
 * → trust_footer → store_locator
 */
export function buildHomepageMain(s: SectionBuilder): Section[] {
  s = withSongoskritiDefaults(s);
  const c = DEFAULT_PERMALINKS.collectionBase; // "/c"

  return [
    // ────────────────────────────────────────────────────────────────────
    // 1. HERO — full-bleed cinematic campaign, 2 curated slides
    // ────────────────────────────────────────────────────────────────────
    s("hero_carousel", {
      skin: "fullbleed",
      slides: [
        {
          image: "/ph/songoskriti/hero-festive.jpg",
          headline: "Heritage, Woven for Today",
          headline_bn: "ঐতিহ্য, আজকের জন্য বোনা",
          subhead:
            "Contemporary silhouettes rooted in the craft of Bangladesh.",
          subhead_bn: "বাংলাদেশের কারুশিল্পে প্রোথিত আধুনিক সিলুয়েট।",
          ctaLabel: "Shop New Arrivals",
          ctaLabel_bn: "নতুন সংগ্রহ দেখুন",
          ctaUrl: `${c}/new-in`,
          caption: "Handcrafted Luxury",
          caption_bn: "হস্তনির্মিত বিলাসিতা",
        },
        {
          image: "/ph/songoskriti/hero-weaves.jpg",
          headline: "The Art of Jamdani",
          headline_bn: "জামদানির শিল্পকলা",
          subhead:
            "Fine threads, patient hands. An enduring legacy woven with timeless grace.",
          subhead_bn:
            "সূক্ষ্ম সুতো, ধৈর্যশীল হাত। এক কালজয়ী ঐতিহ্য।",
          ctaLabel: "Explore Heritage Weaves",
          ctaLabel_bn: "ঐতিহ্যবাহী বুনন দেখুন",
          ctaUrl: `${c}/heritage`,
          caption: "UNESCO Heritage Handloom",
          caption_bn: "ইউনেস্কো স্বীকৃত ঐতিহ্য",
        },
      ],
      autoAdvanceMs: 6000,
      atmosphere: "wash",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 2. VISUAL CATEGORY DISCOVERY — 6 diverse editorial tiles
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
    // 3. SIGNATURE SAREES — major product collection rail
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "Signature Sarees",
      heading_bn: "সিগনেচার শাড়ি",
      subhead: "Master handloom drapes crafted for timeless elegance.",
      subhead_bn: "প্রতিটি উপলক্ষের জন্য হাতে বোনা গল্প।",
      limit: 8,
      source: "collection",
      collection: "sarees",
      cardVariant: "standard",
      showRating: false,
      badgeLabel: "HANDLOOM",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 4. THE ARTISAN STORY — full-bleed craft narrative break
    // ────────────────────────────────────────────────────────────────────
    s("craft_story", {
      eyebrow: "THE ARTISAN'S CALLING",
      eyebrow_bn: "বুননের পেছনের হাত",
      heading: "The Human Hand Behind the Loom",
      heading_bn: "ধীরে তৈরি। বছরের পর বছর পরা।",
      body: "In Tangail, Sonargaon and across Bangladesh, master artisans safeguard generational techniques that cannot be mass-produced.",
      body_bn:
        "টাঙ্গাইল, সোনারগাঁয়ে প্রজন্মের পর প্রজন্ম তাঁতিরা সংরক্ষণ করছেন যে অনন্য কৌশল।",
      ctaLabel: "EXPLORE HERITAGE",
      ctaLabel_bn: "ঐতিহ্য অন্বেষণ করুন",
      ctaHref: `${c}/heritage`,
      imageUrl: "/ph/songoskriti/hero-artisans.jpg",
      scrim: true,
      advMotion: "line-reveal",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 5. NEW ARRIVALS — horizontal product carousel
    // ────────────────────────────────────────────────────────────────────
    s("product_rail", {
      heading: "New Arrivals",
      heading_bn: "নতুন এসেছে",
      subhead: "Fresh weaves and seasonal silhouettes, just off the loom.",
      subhead_bn: "নতুন বুনন, সদ্য এসেছে।",
      limit: 8,
      source: "collection",
      collection: "new-in",
      cardVariant: "standard",
      showRating: false,
      badgeLabel: "NEW",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 6. THE FESTIVE EDIT — curated split campaign (women + men)
    // ────────────────────────────────────────────────────────────────────
    s("split_feature", {
      heading: "The Festive Edit",
      heading_bn: "উৎসবের বিশেষ আয়োজন",
      body: "Jamdani drapes, silk textures and modern Panjabis made for celebrations that feel entirely your own.",
      body_bn: "জামদানি, সিল্ক ও আধুনিক পাঞ্জাবিতে আপনার উৎসব সম্পূর্ণ করুন।",
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
    // 7. HERITAGE COLLECTIONS — 4-tile signature weaves grid
    // ────────────────────────────────────────────────────────────────────
    s("collection_story", {
      heading: "From the Loom",
      heading_bn: "তাঁত থেকে",
      subhead:
        "Jamdani, Tangail Taant, Rajshahi Silk and Nakshi Kantha — timeless weaves, each with a story.",
      subhead_bn: "জামদানি, টাঙ্গাইল তাঁত, রাজশাহী সিল্ক ও নকশি কাঁথা।",
      collections: [
        {
          title: "Jamdani",
          image: "/ph/songoskriti/hero-weaves.jpg",
          href: `${c}/jamdani`,
          subtitle: "UNESCO Heritage",
        },
        {
          title: "Rajshahi Silk",
          image: "/ph/songoskriti/prod-saree.png",
          href: `${c}/wedding`,
          subtitle: "Artisan crafted",
        },
        {
          title: "Tangail Handloom",
          image: "/ph/songoskriti/cat-newin.png",
          href: `${c}/sarees`,
          subtitle: "Limited weave",
        },
        {
          title: "Nakshi Kantha",
          image: "/ph/songoskriti/cat-living.png",
          href: `${c}/living`,
          subtitle: "Master stitch",
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 8. COMPLETE THE LOOK / JEWELLERY — artisan accessories rail
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
      badgeLabel: "ARTISAN",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 9. COMMUNITY LOOKBOOK — authentic customer styling
    // ────────────────────────────────────────────────────────────────────
    s("ugc_gallery", {
      heading: "WORN BY YOU",
      heading_bn: "আপনার পরিধানে",
      subhead: "SONGOSKRITI IN THE WORLD",
      subhead_bn: "সংস্কৃতি সারা দুনিয়ায়",
      handleLabel: "Follow @SONGOSKRITI",
      handleHref: "https://instagram.com",
      images:
        "/ph/songoskriti/ugc-1.jpg, /ph/songoskriti/ugc-2.jpg, /ph/songoskriti/ugc-3.png, /ph/songoskriti/ugc-4.png, /ph/songoskriti/ugc-5.jpg, /ph/songoskriti/ugc-6.jpg",
    }),

    // ────────────────────────────────────────────────────────────────────
    // 10. WHY SONGOSKRITI — trust & craft commitments
    // ────────────────────────────────────────────────────────────────────
    s("trust_footer", {
      i1Title: "Fast delivery",
      i1Title_bn: "দ্রুত ডেলিভারি",
      i2Title: "Easy returns",
      i2Title_bn: "সহজ রিটার্ন",
      i3Title: "Secure payment",
      i3Title_bn: "নিরাপদ পেমেন্ট",
      items: [
        {
          icon: "secure",
          title: "AUTHENTIC CRAFT",
          title_bn: "খাঁটি কারুশিল্প",
          body: "Verified artisan-made pieces — no factory substitutes",
          body_bn: "যাচাইকৃত কারিগর-তৈরি পণ্য — কারখানার বিকল্প নয়",
        },
        {
          icon: "delivery",
          title: "NATIONWIDE DELIVERY",
          title_bn: "সারাদেশে ডেলিভারি",
          body: "Reliable delivery across Bangladesh",
          body_bn: "সারা বাংলাদেশে নির্ভরযোগ্য ডেলিভারি",
        },
        {
          icon: "returns",
          title: "EASY EXCHANGE",
          title_bn: "সহজ বিনিময়",
          body: "Straightforward 7-day exchange policy",
          body_bn: "সহজ ৭-দিনের বিনিময় নীতি",
        },
        {
          icon: "support",
          title: "HUMAN SUPPORT",
          title_bn: "মানবিক সহায়তা",
          body: "Real people, not automated walls",
          body_bn: "সত্যিকারের মানুষ, স্বয়ংক্রিয় উত্তর নয়",
        },
      ],
    }),

    // ────────────────────────────────────────────────────────────────────
    // 10. STORE LOCATIONS — flagship retail presence
    // ────────────────────────────────────────────────────────────────────
    s("store_locator", {
      heading: "VISIT SONGOSKRITI",
      heading_bn: "সংস্কৃতি দেখুন",
      images:
        "/ph/songoskriti/cat-women.png, /ph/songoskriti/cat-men.jpg, /ph/songoskriti/hero-festive.jpg",
      s1Name: "Uttara Flagship",
      s1Name_bn: "উত্তরা ফ্ল্যাগশিপ",
      s1Hours: "Open 10am – 9pm daily",
      s1Hours_bn: "প্রতিদিন সকাল ১০টা – রাত ৯টা",
      s2Name: "Gulshan Showroom",
      s2Name_bn: "গুলশান শোরুম",
      s2Hours: "Open 10am – 9pm daily",
      s2Hours_bn: "প্রতিদিন সকাল ১০টা – রাত ৯টা",
      s3Name: "Chattogram Store",
      s3Name_bn: "চট্টগ্রাম স্টোর",
      s3Hours: "Open 10am – 8pm daily",
      s3Hours_bn: "প্রতিদিন সকাল ১০টা – রাত ৮টা",
    }),
  ];
}
