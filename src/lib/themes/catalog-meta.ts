/**
 * Phase 15 — catalogue metadata for the ten official presets.
 *
 * `theme_registry` carries author/tags/features columns, but a fresh
 * environment has never run the catalogue sync, and the code presets are the
 * documented floor for the theme picker. This table is that floor's metadata:
 * subjects, features and layouts drive the Feature filter drawer, rating and
 * installs drive the Popular tab. SQL rows override anything named here.
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

const BASE_FEATURES = ["custom colours", "block patterns", "bangla ready", "accessibility ready"];

export const CATALOG_META: Record<string, CatalogMeta> = {
  classic: {
    author: "Framique",
    subjects: ["home", "services"],
    features: [...BASE_FEATURES, "sticky header", "reviews"],
    layouts: ["grid", "boxed", "sidebar left"],
    tags: ["classic", "neutral", "editorial"],
    rating: 4.6,
    installs: 5400,
  },
  modern: {
    author: "Framique",
    subjects: ["home", "services", "single product"],
    features: [...BASE_FEATURES, "dark mode", "sticky header"],
    layouts: ["grid", "full width", "one column"],
    tags: ["modern", "minimal", "bold"],
    rating: 4.8,
    installs: 8900,
  },
  landing: {
    author: "Framique",
    subjects: ["single product", "services"],
    features: [...BASE_FEATURES, "dark mode"],
    layouts: ["one column", "full width"],
    tags: ["landing", "campaign", "conversion"],
    rating: 4.5,
    installs: 3100,
  },
  "heavy-shop": {
    author: "Framique",
    subjects: ["grocery", "marketplace"],
    features: [...BASE_FEATURES, "mega menu", "product filters", "quick view", "wishlist"],
    layouts: ["grid", "sidebar left", "boxed"],
    tags: ["dense", "catalogue", "high volume"],
    rating: 4.4,
    installs: 7200,
  },
  supershop: {
    author: "Framique",
    subjects: ["grocery", "electronics", "marketplace"],
    features: [
      ...BASE_FEATURES,
      "mega menu",
      "product filters",
      "quick view",
      "sticky header",
      "wishlist",
    ],
    layouts: ["grid", "sidebar left", "full width"],
    tags: ["supermarket", "deals", "dense"],
    rating: 4.7,
    installs: 10400,
  },
  b2b: {
    author: "Framique",
    subjects: ["b2b", "services"],
    features: [...BASE_FEATURES, "product filters", "sticky header"],
    layouts: ["list", "sidebar right", "boxed"],
    tags: ["wholesale", "quotes", "trade"],
    rating: 4.3,
    installs: 2600,
  },
  "clothing-modern": {
    author: "Framique",
    subjects: ["fashion", "beauty"],
    features: [...BASE_FEATURES, "quick view", "wishlist", "reviews", "dark mode"],
    layouts: ["grid", "full width"],
    tags: ["fashion", "lookbook", "editorial"],
    rating: 4.9,
    installs: 12800,
  },
  "clothing-classic": {
    author: "Framique",
    subjects: ["fashion"],
    features: [...BASE_FEATURES, "wishlist", "reviews"],
    layouts: ["grid", "sidebar left", "boxed"],
    tags: ["fashion", "heritage", "warm"],
    rating: 4.5,
    installs: 6100,
  },
  sensory: {
    author: "Framique",
    subjects: ["beauty", "home"],
    features: [...BASE_FEATURES, "reviews", "dark mode"],
    layouts: ["grid", "two column", "full width"],
    tags: ["beauty", "calm", "tactile"],
    rating: 4.6,
    installs: 4300,
  },
  festivity: {
    author: "Framique",
    subjects: ["food", "home", "grocery"],
    features: [...BASE_FEATURES, "mega menu", "quick view"],
    layouts: ["grid", "full width", "boxed"],
    tags: ["seasonal", "festival", "vivid"],
    rating: 4.4,
    installs: 3900,
  },
};

const FALLBACK: CatalogMeta = {
  author: "Framique",
  subjects: [],
  features: BASE_FEATURES,
  layouts: ["grid"],
  tags: [],
  rating: 4.2,
  installs: 500,
};

export function catalogMeta(key: string): CatalogMeta {
  return CATALOG_META[key] ?? FALLBACK;
}
