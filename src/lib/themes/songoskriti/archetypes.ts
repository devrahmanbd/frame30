import type { Section, SectionBuilder, PropRow } from "@/lib/builder-ast";

export type CollectionConfig = {
  type: "department" | "campaign" | "listing";
  title: string;
  title_bn: string;
  subtitle?: string;
  subtitle_bn?: string;
  heroImage?: string;
  categories?: PropRow[];
  featuredCollection?: string; // slug
  editorial?: {
    image: string;
    heading: string;
    heading_bn: string;
    body: string;
    body_bn: string;
  };
  secondaryCollection?: string; // slug
};

export const SONGOSKRITI_COLLECTIONS: Record<string, CollectionConfig> = {
  women: {
    type: "department",
    title: "Women",
    title_bn: "নারী",
    heroImage: "/ph/songoskriti/cat-women.png",
    categories: [
      { iLabel: "Sarees", iHref: "/c/sarees" },
      { iLabel: "Jamdani", iHref: "/c/jamdani" },
      { iLabel: "Handloom", iHref: "/c/heritage-handloom" },
      { iLabel: "Festive", iHref: "/c/festive" },
      { iLabel: "Wedding", iHref: "/c/wedding" },
      { iLabel: "Everyday", iHref: "/c/everyday" },
      { iLabel: "Jewellery", iHref: "/c/jewellery" },
    ],
    featuredCollection: "women",
    editorial: {
      image: "/ph/songoskriti/edit-festive-main.jpg",
      heading: "The Art of the Saree",
      heading_bn: "শাড়ির শিল্প",
      body: "Woven by hand, shaped for today.",
      body_bn: "হাতে বোনা, আজকের জন্য তৈরি।",
    },
    secondaryCollection: "new-in",
  },
  men: {
    type: "department",
    title: "Men",
    title_bn: "পুরুষ",
    heroImage: "/ph/songoskriti/cat-men.jpg",
    categories: [
      { iLabel: "Panjabi", iHref: "/c/panjabi" },
      { iLabel: "Festive", iHref: "/c/festive" },
      { iLabel: "Wedding", iHref: "/c/wedding" },
      { iLabel: "Everyday", iHref: "/c/everyday" },
      { iLabel: "Handloom", iHref: "/c/heritage-handloom" },
      { iLabel: "Groom", iHref: "/c/groom" },
    ],
    featuredCollection: "men",
    editorial: {
      image: "/ph/songoskriti/campaign-men.jpg",
      heading: "Men's Festive & Everyday Collection",
      heading_bn: "পুরুষদের উৎসব ও দৈনন্দিন পোশাক",
      body: "Fine cotton and silk panjabis, waistcoats, and everyday kurtas.",
      body_bn: "সুতি ও সিল্কের পাঞ্জাবি, কটি এবং দৈনন্দিন কুর্তা।",
    },
    secondaryCollection: "best-sellers",
  },
  kids: {
    type: "department",
    title: "Kids",
    title_bn: "বাচ্চাদের",
    heroImage: "/ph/songoskriti/cat-kids.jpg",
    categories: [
      { iLabel: "Girls Festive", iHref: "/c/girls-festive" },
      { iLabel: "Boys Panjabi", iHref: "/c/boys-panjabi" },
      { iLabel: "New In Kids", iHref: "/c/kids-new-in" },
      { iLabel: "Family Sets", iHref: "/c/family" },
    ],
    featuredCollection: "kids",
    editorial: {
      image: "/ph/songoskriti/hero-festive.jpg",
      heading: "Festive Wear for Children",
      heading_bn: "ছোটদের উৎসবের পোশাক",
      body: "Comfortable handloom cotton and festive clothing for children.",
      body_bn: "বাচ্চাদের জন্য আরামদায়ক সুতি ও উৎসবের পোশাক।",
    },
  },
  festive: {
    type: "campaign",
    title: "Festive",
    title_bn: "উৎসব",
    subtitle: "Curated handloom sarees, panjabis, and celebration attire.",
    subtitle_bn: "নির্বাচিত তাঁতের শাড়ি, পাঞ্জাবি ও উৎসবের পোশাক।",
    heroImage: "/ph/songoskriti/hero-festive.jpg",
    categories: [
      { iLabel: "Women", iHref: "/c/women" },
      { iLabel: "Men", iHref: "/c/men" },
      { iLabel: "Kids", iHref: "/c/kids" },
    ],
    featuredCollection: "festive",
    editorial: {
      image: "/ph/songoskriti/hero-artisans.jpg",
      heading: "Festive Attire & Celebration Weaves",
      heading_bn: "উৎসবের পোশাক ও ঐতিহ্যবাহী বুনন",
      body: "Handloom silk sarees, embroidered panjabis, and festive collections.",
      body_bn: "হাতে বোনা সিল্ক শাড়ি, কারুকাজ করা পাঞ্জাবি ও উৎসবের সংগ্রহ।",
    },
  },
  heritage: {
    type: "campaign",
    title: "Heritage",
    title_bn: "ঐতিহ্য",
    subtitle: "Authentic handloom craft of Bangladesh.",
    subtitle_bn: "বাংলাদেশের ঐতিহ্যবাহী তাঁতশিল্প।",
    heroImage: "/ph/songoskriti/hero-artisans.jpg",
    categories: [
      { iLabel: "Jamdani", iHref: "/c/jamdani" },
      { iLabel: "Heritage Handloom", iHref: "/c/heritage-handloom" },
      { iLabel: "Nakshi Kantha", iHref: "/c/nakshi-kantha" },
      { iLabel: "Rajshahi Silk", iHref: "/c/rajshahi-silk" },
    ],
    featuredCollection: "heritage",
    editorial: {
      image: "/ph/songoskriti/hero-artisans.jpg",
      heading: "Traditional Craft & Handloom",
      heading_bn: "ঐতিহ্যবাহী তাঁত ও কারুশিল্প",
      body: "Authentic Dhakai Jamdani, Rajshahi silk, and Nakshi Kantha craft.",
      body_bn: "আসল ঢাকাই জামদানি, রাজশাহী সিল্ক এবং নকশিকাঁথা শিল্প।",
    },
  },
  collections: {
    type: "campaign",
    title: "Collections",
    title_bn: "কালেকশন",
    subtitle:
      "Explore handcrafted collections, authentic weaves, and festive occasions.",
    subtitle_bn:
      "হস্তশিল্পের সংগ্রহ, আসল বুনন এবং উৎসবের পোশাক অন্বেষণ করুন।",
    heroImage: "/ph/songoskriti/hero-weaves.jpg",
    categories: [
      { iLabel: "New Arrivals", iHref: "/c/new-in" },
      { iLabel: "Best Sellers", iHref: "/c/best-sellers" },
      { iLabel: "Festive", iHref: "/c/festive" },
      { iLabel: "Wedding", iHref: "/c/wedding" },
      { iLabel: "Heritage", iHref: "/c/heritage" },
    ],
    featuredCollection: "new-in",
  },
};

let n = 0;
const s: SectionBuilder = (type, props = {}) => ({
  id: `${type}-arch-${n++}`,
  type,
  props,
});

export function buildCollectionArchetype(
  slug: string,
  name: string,
): Section[] | null {
  const config =
    SONGOSKRITI_COLLECTIONS[slug] ||
    (slug === "" ? SONGOSKRITI_COLLECTIONS["collections"] : null);

  if (!config) {
    // Type C - Product Listing
    return [
      s("category_header", {
        title: name,
        title_bn: name,
        subtitle: "Curated collection",
        subtitle_bn: "নির্বাচিত কালেকশন",
        alignment: "left",
      }),
      s("result_toolbar", { sortDefault: "Featured" }),
      s("product_grid", {
        heading: "",
        heading_bn: "",
        source: "collection",
        collection: slug,
      }),
    ];
  }

  const sections: Section[] = [];

  if (config.type === "department") {
    // TYPE A — DEPARTMENT LANDING PAGE
    sections.push(
      s("hero_carousel", {
        h1Heading: config.title,
        h1Heading_bn: config.title_bn,
        h1Image: config.heroImage || "",
        h1Scrim: 20,
      }),
    );

    if (config.categories) {
      sections.push(
        s("circle_categories", {
          heading: "Shop " + config.title,
          heading_bn: config.title_bn + " কিনুন",
          items: config.categories,
        }),
      );
    }

    if (config.featuredCollection) {
      sections.push(
        s("result_toolbar", { sortDefault: "Featured" }),
        s("product_grid", {
          heading: "Signature " + config.title,
          heading_bn: "সিগনেচার " + config.title_bn,
          source: "collection",
          collection: config.featuredCollection,
        }),
      );
    }

    if (config.editorial) {
      sections.push(
        s("craft_story", {
          image1: config.editorial.image,
          heading: config.editorial.heading,
          heading_bn: config.editorial.heading_bn,
          body: config.editorial.body,
          body_bn: config.editorial.body_bn,
        }),
      );
    }

    if (config.secondaryCollection) {
      sections.push(
        s("product_rail", {
          heading: "New In " + config.title,
          heading_bn: "নতুন " + config.title_bn,
          source: "collection",
          collection: config.secondaryCollection,
          limit: 8,
          cardVariant: "standard",
        }),
      );
    }
  } else if (config.type === "campaign") {
    // TYPE B — EDITORIAL / CAMPAIGN LANDING
    sections.push(
      s("hero_carousel", {
        h1Heading: config.title,
        h1Heading_bn: config.title_bn,
        h1Image: config.heroImage || "",
        h1Scrim: 30,
      }),
    );

    if (config.categories) {
      sections.push(
        s("circle_categories", {
          heading: "Explore " + config.title,
          heading_bn: config.title_bn + " এক্সপ্লোর করুন",
          items: config.categories,
        }),
      );
    }

    if (config.featuredCollection) {
      sections.push(
        s("result_toolbar", { sortDefault: "Featured" }),
        s("product_grid", {
          heading: "Featured " + config.title,
          heading_bn: "ফিচারড " + config.title_bn,
          source: "collection",
          collection: config.featuredCollection,
        }),
      );
    }

    if (config.editorial) {
      sections.push(
        s("craft_story", {
          image1: config.editorial.image,
          heading: config.editorial.heading,
          heading_bn: config.editorial.heading_bn,
          body: config.editorial.body,
          body_bn: config.editorial.body_bn,
        }),
      );
    }
  }

  return sections;
}
