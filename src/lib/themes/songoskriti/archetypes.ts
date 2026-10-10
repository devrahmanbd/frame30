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
      { iLabel: "Tangail", iHref: "/c/tangail" },
      { iLabel: "Festive", iHref: "/c/festive" },
      { iLabel: "Wedding", iHref: "/c/wedding" },
      { iLabel: "Everyday", iHref: "/c/everyday" },
      { iLabel: "Jewellery", iHref: "/c/jewellery" },
    ],
    featuredCollection: "women",
    editorial: {
      image: "/ph/songoskriti/songoskriti_saree.jpg", // TBD
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
    heroImage: "/ph/songoskriti/cat-men.png",
    categories: [
      { iLabel: "Panjabi", iHref: "/c/panjabi" },
      { iLabel: "Festive", iHref: "/c/festive" },
      { iLabel: "Wedding", iHref: "/c/wedding" },
      { iLabel: "Casual", iHref: "/c/casual" },
      { iLabel: "Silk", iHref: "/c/silk" },
      { iLabel: "Handloom", iHref: "/c/handloom" },
    ],
    featuredCollection: "men",
    editorial: {
      image: "/ph/songoskriti/songoskriti_men.jpg", // TBD
      heading: "Crafted for the Modern Man",
      heading_bn: "আধুনিক পুরুষের জন্য তৈরি",
      body: "Heritage techniques meet contemporary tailoring.",
      body_bn: "ঐতিহ্যবাহী কৌশলের সাথে সমসাময়িক টেইলারিং।",
    },
    secondaryCollection: "bestsellers",
  },
  kids: {
    type: "department",
    title: "Kids",
    title_bn: "বাচ্চাদের",
    heroImage: "/ph/songoskriti/cat-kids.png",
    categories: [
      { iLabel: "Girls", iHref: "/c/girls" },
      { iLabel: "Boys", iHref: "/c/boys" },
      { iLabel: "Festive", iHref: "/c/festive" },
      { iLabel: "Occasion", iHref: "/c/occasion" },
      { iLabel: "Family Matching", iHref: "/c/family" },
    ],
    featuredCollection: "kids",
    editorial: {
      image: "/ph/songoskriti/hero-festive.png",
      heading: "Festive Little Ones",
      heading_bn: "উৎসবে ছোটরা",
      body: "Playful, comfortable, and beautifully crafted.",
      body_bn: "আনন্দদায়ক, আরামদায়ক এবং সুন্দরভাবে তৈরি।",
    },
  },
  festive: {
    type: "campaign",
    title: "Festive",
    title_bn: "উৎসব",
    subtitle: "Celebrate in authentic Bangladeshi craft.",
    subtitle_bn: "আসল বাংলাদেশি কারুশিল্পে উদযাপন করুন।",
    heroImage: "/ph/songoskriti/hero-festive.png",
    categories: [
      { iLabel: "Women", iHref: "/c/women" },
      { iLabel: "Men", iHref: "/c/men" },
      { iLabel: "Kids", iHref: "/c/kids" },
    ],
    featuredCollection: "festive",
    editorial: {
      image: "/ph/songoskriti/hero-artisans.png",
      heading: "Woven for Celebration",
      heading_bn: "উদযাপনের জন্য বোনা",
      body: "Pieces designed to be cherished for generations.",
      body_bn: "প্রজন্মের পর প্রজন্ম ধরে লালন করার জন্য ডিজাইন করা পিস।",
    },
  },
  heritage: {
    type: "campaign",
    title: "Heritage",
    title_bn: "ঐতিহ্য",
    subtitle: "The crafts of Bangladesh.",
    subtitle_bn: "বাংলাদেশের কারুশিল্প।",
    heroImage: "/ph/songoskriti/hero-artisans.png",
    categories: [
      { iLabel: "Jamdani", iHref: "/c/jamdani" },
      { iLabel: "Tangail", iHref: "/c/tangail" },
      { iLabel: "Nakshi Kantha", iHref: "/c/kantha" },
      { iLabel: "Rajshahi Silk", iHref: "/c/silk" },
      { iLabel: "Handloom", iHref: "/c/handloom" },
    ],
    featuredCollection: "heritage",
    editorial: {
      image: "/ph/songoskriti/songoskriti_artisan.jpg",
      heading: "The Hands Behind the Weave",
      heading_bn: "বুননের পেছনের হাত",
      body: "Supporting artisan communities across 64 districts.",
      body_bn: "৬৪ জেলা জুড়ে কারিগর সম্প্রদায়কে সমর্থন করা।",
    },
  },
  collections: {
    type: "campaign",
    title: "Collections",
    title_bn: "কালেকশন",
    subtitle:
      "Explore the stories, occasions and craft traditions behind Songoskriti.",
    subtitle_bn:
      "সংস্কৃতির পেছনের গল্প, উৎসব এবং কারুশিল্পের ঐতিহ্য অন্বেষণ করুন।",
    heroImage: "/ph/songoskriti/hero-weaves.png",
    categories: [
      { iLabel: "New Arrivals", iHref: "/c/new-in" },
      { iLabel: "Best Sellers", iHref: "/c/bestsellers" },
      { iLabel: "Festive", iHref: "/c/festive" },
      { iLabel: "Bridal", iHref: "/c/bridal" },
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
        subtitle: "Fresh from the loom.",
        subtitle_bn: "লুম থেকে সরাসরি।",
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
