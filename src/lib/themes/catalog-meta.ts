/**
 * Phase 15 — catalogue metadata for the ten official presets.
 *
 * `theme_registry` carries author/tags/features columns, but a fresh
 * environment has never run the catalogue sync, and the code presets are the
 * documented floor for the theme picker. This table is that floor's metadata:
 * subjects, features and layouts drive the Feature filter drawer. Rating and
 * installs are honest zeros until real marketplace telemetry aggregates them
 * (no-fabrication rule); Popular sort falls back to name order on ties. SQL
 * rows override anything named here.
 */

export type CatalogMeta = {
  author: string;
  subjects: string[];
  features: string[];
  layouts: string[];
  tags: string[];
  rating: number;
  installs: number;
};

const BASE_FEATURES = [
  "custom colours",
  "block patterns",
  "bangla ready",
  "accessibility ready",
];

export const CATALOG_META: Record<string, CatalogMeta> = {
  classic: {
    author: "Framique",
    subjects: ["home", "services"],
    features: [...BASE_FEATURES, "sticky header", "reviews"],
    layouts: ["grid", "boxed", "sidebar left"],
    tags: ["classic", "neutral", "editorial"],
    rating: 0,
    installs: 0,
  },
  modern: {
    author: "Framique",
    subjects: ["home", "services", "single product"],
    features: [...BASE_FEATURES, "dark mode", "sticky header"],
    layouts: ["grid", "full width", "one column"],
    tags: ["modern", "minimal", "bold"],
    rating: 0,
    installs: 0,
  },
  landing: {
    author: "Framique",
    subjects: ["single product", "services"],
    features: [...BASE_FEATURES, "dark mode"],
    layouts: ["one column", "full width"],
    tags: ["landing", "campaign", "conversion"],
    rating: 0,
    installs: 0,
  },
  "heavy-shop": {
    author: "Framique",
    subjects: ["grocery", "marketplace"],
    features: [
      ...BASE_FEATURES,
      "mega menu",
      "product filters",
      "quick view",
      "wishlist",
    ],
    layouts: ["grid", "sidebar left", "boxed"],
    tags: ["dense", "catalogue", "high volume"],
    rating: 0,
    installs: 0,
  },
  supershop: {
    author: "Framique",
    subjects: ["marketplace", "electronics", "fashion", "grocery"],
    features: [
      ...BASE_FEATURES,
      "flash sale",
      "countdown timer",
      "mega menu",
      "product filters",
      "brand strip",
      "quick view",
      "sticky header",
      "wishlist",
      "sponsored slots",
    ],
    layouts: ["grid", "sidebar left", "dense compact"],
    tags: ["marketplace", "deals", "flash-sale", "daraz-style", "dense"],
    rating: 0,
    installs: 0,
  },
  b2b: {
    author: "Framique",
    subjects: ["b2b", "services"],
    features: [...BASE_FEATURES, "product filters", "sticky header"],
    layouts: ["list", "sidebar right", "boxed"],
    tags: ["wholesale", "quotes", "trade"],
    rating: 0,
    installs: 0,
  },
  "clothing-modern": {
    author: "Framique",
    subjects: ["fashion", "beauty"],
    features: [
      ...BASE_FEATURES,
      "quick view",
      "wishlist",
      "reviews",
      "dark mode",
    ],
    layouts: ["grid", "full width"],
    tags: ["fashion", "lookbook", "editorial"],
    rating: 0,
    installs: 0,
  },
  sensory: {
    author: "Framique",
    subjects: ["beauty", "home"],
    features: [...BASE_FEATURES, "reviews", "dark mode"],
    layouts: ["grid", "two column", "full width"],
    tags: ["beauty", "calm", "tactile"],
    rating: 0,
    installs: 0,
  },
  "clothing-heritage": {
    author: "Framique Heritage",
    subjects: ["fashion", "home", "services"],
    features: [
      ...BASE_FEATURES,
      "mega menu",
      "lookbook",
      "size guide",
      "quick view",
      "wishlist",
      "product filters",
      "sticky header",
      "dark mode",
      "reviews",
    ],
    layouts: ["grid", "full width", "editorial"],
    tags: [
      "clothing",
      "fashion",
      "heritage",
      "aarong",
      "handloom",
      "saree",
      "panjabi",
      "artisan",
    ],
    rating: 0,
    installs: 0,
  },
  atelier: {
    author: "Framique Studio",
    subjects: ["fashion"],
    features: [
      ...BASE_FEATURES,
      "mega menu",
      "lookbook",
      "size guide",
      "quick view",
      "wishlist",
      "sticky header",
      "dark mode",
      "reviews",
    ],
    layouts: ["grid", "full width", "editorial"],
    tags: ["fashion", "editorial", "atelier", "designer", "lookbook"],
    rating: 0,
    installs: 0,
  },
  bazaar: {
    author: "Framique",
    subjects: ["marketplace", "grocery", "home"],
    features: [
      ...BASE_FEATURES,
      "mega menu",
      "product filters",
      "quick view",
      "sticky header",
      "wishlist",
      "reviews",
    ],
    layouts: ["grid", "sidebar left", "full width"],
    tags: ["marketplace", "multi-vendor", "catalogue", "deals"],
    rating: 0,
    installs: 0,
  },
  circuit: {
    author: "Framique Tech",
    subjects: ["electronics"],
    features: [
      ...BASE_FEATURES,
      "mega menu",
      "product filters",
      "quick view",
      "sticky header",
      "dark mode",
      "reviews",
    ],
    layouts: ["grid", "boxed", "sidebar left"],
    tags: ["electronics", "gadgets", "specs", "tech"],
    rating: 0,
    installs: 0,
  },
  rupaboti: {
    author: "Framique Glow",
    subjects: ["beauty"],
    features: [
      ...BASE_FEATURES,
      "product filters",
      "quick view",
      "wishlist",
      "dark mode",
      "reviews",
    ],
    layouts: ["grid", "two column", "full width"],
    tags: ["beauty", "cosmetics", "skincare", "wellness"],
    rating: 0,
    installs: 0,
  },
  festivity: {
    author: "Framique",
    subjects: ["food", "home", "grocery"],
    features: [...BASE_FEATURES, "mega menu", "quick view"],
    layouts: ["grid", "full width", "boxed"],
    tags: ["seasonal", "festival", "vivid"],
    rating: 0,
    installs: 0,
  },
};

const FALLBACK: CatalogMeta = {
  author: "Framique",
  subjects: [],
  features: BASE_FEATURES,
  layouts: ["grid"],
  tags: [],
  rating: 0,
  installs: 0,
};

export function catalogMeta(key: string): CatalogMeta {
  return CATALOG_META[key] ?? FALLBACK;
}
