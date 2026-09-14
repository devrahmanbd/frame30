/**
 * Phase 2 — widget supportiveness metadata.
 *
 * The catalog says what a widget *is*; this module says how a merchant is
 * supposed to find, understand and start using it:
 *
 *  - `widgetHelp` / `propHint` — bilingual help, exact key first then the
 *    generated-key patterns, so 164 props are covered without 164 strings.
 *  - `dataEmptyState` / `missingBindings` — a data widget with no binding
 *    tells the merchant which field to fill, in the editor only.
 *  - `presetsFor` / `applyPreset` — merchants start from a designed state;
 *    unknown preset keys are dropped (and reported) rather than written into
 *    the AST, because a preset is data and data is never trusted.
 *  - `searchWidgets` — label, synonym, vertical and help matching with a
 *    deterministic score, filtered to the widgets the active slot accepts.
 *
 * Pure and client-safe: no React, no network, no storage.
 */
import {
  SECTION_CATALOG,
  catalogEntry,
  flattenFields,
  imageKeysOf,
  type PropValue,
  type SectionType,
  type Slot,
} from "./builder-ast";
import { altKey } from "./media";
import { WIDGET_REGISTRY } from "./widget-registry";
import { PROP_HINTS, PROP_HINT_PATTERNS, WIDGET_HELP, type BiText } from "./widget-help";

export type { BiText };

export const VERTICALS = ["general", "apparel", "electronics", "beauty"] as const;
export type WidgetVertical = (typeof VERTICALS)[number];

/** Vertical membership follows the widget families the catalog ships. */
const APPAREL: SectionType[] = ["editorial_hero", "lookbook", "shoppable_image", "split_feature", "collection_story", "ugc_gallery", "social_strip", "store_locator", "size_selector", "size_guide", "fit_note", "back_in_stock", "care_panel", "sustain_badge", "complete_the_look", "wishlist_button"];
const ELECTRONICS: SectionType[] = ["spec_highlights", "compare_tray", "warranty_panel", "authenticity_badge", "emi_calculator", "price_sparkline", "bundle_builder", "doc_links", "support_strip", "buying_guide", "trade_in", "compare_table", "spec_table"];
const BEAUTY: SectionType[] = ["shade_finder", "skin_quiz", "routine_builder", "ingredient_list", "ingredient_glossary", "claim_chips", "before_after", "safety_note", "batch_info", "texture_strip", "how_to_use", "refill_widget", "gift_builder", "sample_picker", "consult_cta", "loyalty_strip"];

export function verticalsOf(type: SectionType): WidgetVertical[] {
  const out: WidgetVertical[] = [];
  if (APPAREL.includes(type)) out.push("apparel");
  if (ELECTRONICS.includes(type)) out.push("electronics");
  if (BEAUTY.includes(type)) out.push("beauty");
  return out.length ? out : ["general"];
}

/** Words merchants type that are not in the label. */
const SYNONYMS: Partial<Record<SectionType, string[]>> = {
  hero: ["banner", "masthead", "header image", "above the fold"],
  rich_text: ["paragraph", "text", "prose", "copy", "wysiwyg"],
  image: ["photo", "picture", "media"],
  video: ["youtube", "vimeo", "reel", "embed"],
  product_grid: ["products", "catalogue", "listing", "shop grid"],
  collection_grid: ["categories", "collections", "departments"],
  product_rail: ["carousel", "slider", "scroller", "related products"],
  faq: ["questions", "q&a", "help", "schema"],
  countdown: ["timer", "flash sale", "deadline"],
  marquee: ["ticker", "scrolling text"],
  newsletter: ["email signup", "subscribe", "lead capture"],
  html: ["custom code", "script", "embed", "iframe"],
  announcement_bar: ["top bar", "promo bar", "notice bar"],
  mega_menu: ["navigation", "nav", "menu"],
  footer_sitemap: ["footer links", "sitemap"],
  search_command: ["search", "autocomplete", "command palette"],
  account_cart: ["login", "basket", "mini cart"],
  buy_box: ["purchase panel", "add to cart", "atc"],
  variant_picker: ["options", "size", "colour", "swatch"],
  rating_summary: ["stars", "reviews average"],
  review_list: ["reviews", "ratings", "ugc"],
  free_shipping_bar: ["shipping threshold", "delivery progress"],
  emi_calculator: ["instalment", "finance", "monthly"],
  size_guide: ["measurements", "sizing chart"],
  shade_finder: ["colour match", "foundation match"],
  cart_drawer: ["mini cart", "side cart"],
  sticky_buy_bar: ["mobile buy bar", "floating cart"],
  spacer: ["gap", "whitespace"],
  divider: ["hr", "line", "separator"],
  container: ["section", "row", "box", "flex"],
  columns: ["grid", "two column", "split"],
};

export function synonymsOf(type: SectionType): string[] {
  return SYNONYMS[type] ?? [];
}

export function widgetHelp(type: SectionType): BiText {
  return WIDGET_HELP[type];
}

/** Exact prop key first; then the generated-key families. */
export function propHint(key: string): BiText | null {
  return PROP_HINTS[key] ?? PROP_HINT_PATTERNS.find((p) => p.test.test(key))?.hint ?? null;
}

/* ------------------------------------------------------- data empty states */

type DataEntry = { data?: { source: string; params?: { key: string; label: string; kind: string }[] } };

function dataSpec(type: SectionType) {
  return (WIDGET_REGISTRY as Record<string, DataEntry | undefined>)[type]?.data ?? null;
}

export function isDataWidget(type: SectionType): boolean {
  return dataSpec(type) !== null;
}

/** One hint per data source; each names the field to connect. */
const SOURCE_EMPTY: Record<string, BiText> = {
  collection: { en: "No collection connected — set the collection handle to choose what this shows.", bn: "কোনো কালেকশন সংযুক্ত নয় — কী দেখাবে তা ঠিক করতে কালেকশন হ্যান্ডেল দিন।" },
  taxonomy: { en: "Reads your categories. Publish at least one category for this to fill.", bn: "আপনার ক্যাটাগরি থেকে ডেটা নেয় — অন্তত একটি ক্যাটাগরি প্রকাশ করুন।" },
  variants: { en: "Needs a product. On a product template it uses the current product; elsewhere set a product handle.", bn: "একটি প্রোডাক্ট দরকার — প্রোডাক্ট টেমপ্লেটে বর্তমান প্রোডাক্ট নেয়, অন্যত্র প্রোডাক্ট হ্যান্ডেল দিন।" },
  specs: { en: "Needs a product handle to read specifications from.", bn: "স্পেসিফিকেশন পড়তে প্রোডাক্ট হ্যান্ডেল দরকার।" },
  reviews: { en: "Shows published reviews for a product — set the product handle.", bn: "প্রোডাক্টের প্রকাশিত রিভিউ দেখায় — প্রোডাক্ট হ্যান্ডেল দিন।" },
  qna: { en: "Shows answered questions for a product — set the product handle.", bn: "প্রোডাক্টের উত্তরকৃত প্রশ্ন দেখায় — প্রোডাক্ট হ্যান্ডেল দিন।" },
  facets: { en: "Reads the filters of a collection — set the collection handle.", bn: "কালেকশনের ফিল্টার নেয় — কালেকশন হ্যান্ডেল দিন।" },
  recommendation: { en: "Filled by the recommendation service once the store has traffic.", bn: "স্টোরে ট্রাফিক এলে রেকমেন্ডেশন সার্ভিস এটি পূরণ করবে।" },
  order: { en: "Shows a signed-in shopper's order; nothing renders for guests.", bn: "সাইন-ইন করা ক্রেতার অর্ডার দেখায় — গেস্টদের জন্য কিছু দেখাবে না।" },
  finance: { en: "Needs a product handle to price the instalments against.", bn: "কিস্তির হিসাব করতে প্রোডাক্ট হ্যান্ডেল দরকার।" },
  product: { en: "Needs a product handle.", bn: "প্রোডাক্ট হ্যান্ডেল দরকার।" },
};

/** Editor-only guidance for a data widget. `null` for static widgets. */
export function dataEmptyState(type: SectionType): BiText | null {
  const spec = dataSpec(type);
  if (!spec) return null;
  return SOURCE_EMPTY[spec.source] ?? { en: "Connect this widget's data source in the Content panel.", bn: "কনটেন্ট প্যানেলে এই উইজেটের ডেটা সোর্স সংযুক্ত করুন।" };
}

/** Which data params are still unset — drives the in-editor hint. */
export function missingBindings(type: SectionType, props: Record<string, PropValue>): string[] {
  const spec = dataSpec(type);
  if (!spec) return [];
  return (spec.params ?? [])
    .filter((p) => p.kind === "text" && !String(props[p.key] ?? "").trim())
    .map((p) => p.key);
}

/* -------------------------------------------------------------- a11y rules */

/** Media widgets must carry alt text before publish. */
export function requiredAltKeys(type: SectionType): string[] {
  return imageKeysOf(type).map(altKey);
}

export function isMediaWidget(type: SectionType): boolean {
  return imageKeysOf(type).length > 0;
}

/**
 * Heading levels a widget may choose. A page's `h1` is claimed by exactly one
 * widget, so section headings start at `h2` and may only step down one level:
 * the options can never produce a skipped level.
 */
export const HEADING_LEVEL_OPTIONS = ["h2", "h3"] as const;
export type HeadingLevel = (typeof HEADING_LEVEL_OPTIONS)[number];

export function headingLevelNumber(value: unknown): number {
  return String(value ?? "h2") === "h3" ? 3 : 2;
}

/* ----------------------------------------------------------------- presets */

export type WidgetPreset = {
  key: string;
  label: BiText;
  /** Prop overrides layered over the catalog defaults. */
  props: Record<string, PropValue>;
};

const PRESETS: Partial<Record<SectionType, WidgetPreset[]>> = {
  hero: [
    { key: "split", label: { en: "Split", bn: "স্প্লিট" }, props: { align: "left", maxW: "container", padY: 72 } },
    { key: "centred", label: { en: "Centred", bn: "মধ্যবর্তী" }, props: { align: "center", maxW: "narrow", padY: 96 } },
    { key: "full", label: { en: "Full bleed", bn: "পূর্ণ প্রস্থ" }, props: { align: "center", maxW: "full", padY: 128 } },
  ],
  product_grid: [
    { key: "grid4", label: { en: "Four up", bn: "চার কলাম" }, props: { columns: 4, limit: 8, cardVariant: "standard" } },
    { key: "dense", label: { en: "Dense", bn: "ঘন" }, props: { columns: 4, limit: 12, cardVariant: "compact", density: "compact" } },
    { key: "editorial", label: { en: "Editorial", bn: "এডিটোরিয়াল" }, props: { columns: 3, limit: 6, cardVariant: "editorial" } },
  ],
  container: [
    { key: "one", label: { en: "Single column", bn: "এক কলাম" }, props: { columns: 1, gap: 24 } },
    { key: "two", label: { en: "Two columns", bn: "দুই কলাম" }, props: { columns: 2, gap: 24 } },
    { key: "band", label: { en: "Surface band", bn: "সারফেস ব্যান্ড" }, props: { columns: 1, bg: "surface", padY: 64 } },
  ],
  banner: [
    { key: "wide", label: { en: "Wide", bn: "চওড়া" }, props: { maxW: "full" } },
    { key: "card", label: { en: "Card", bn: "কার্ড" }, props: { maxW: "container", radius: "lg", border: "hairline" } },
  ],
  product_rail: [
    { key: "standard", label: { en: "Standard rail", bn: "সাধারণ রেল" }, props: { limit: 12, cardVariant: "standard" } },
    { key: "compact", label: { en: "Compact rail", bn: "কমপ্যাক্ট রেল" }, props: { limit: 16, cardVariant: "compact" } },
  ],
};

/** Always at least one preset: "As designed" is the catalog default state. */
export function presetsFor(type: SectionType): WidgetPreset[] {
  return [{ key: "default", label: { en: "As designed", bn: "ডিফল্ট" }, props: {} }, ...(PRESETS[type] ?? [])];
}

export type PresetApplication = {
  props: Record<string, PropValue>;
  /** Keys the preset declared that the widget's schema does not own. */
  dropped: string[];
};

/**
 * Layers a preset over the catalog defaults. A preset is data, so keys are
 * validated against the widget's own schema; unknown keys are reported, not
 * written, which keeps a stale preset from poisoning the AST.
 */
export function applyPreset(type: SectionType, presetKey: string): PresetApplication {
  const entry = catalogEntry(type);
  if (!entry) return { props: {}, dropped: [] };
  const preset = presetsFor(type).find((p) => p.key === presetKey);
  // Data params live in the widget registry, not the catalog schema, but they
  // are still props the widget owns — a preset may legitimately set them.
  const known = new Set([
    ...flattenFields(entry.fields).map((f) => f.key),
    ...(dataSpec(type)?.params ?? []).map((p) => p.key),
  ]);
  const props: Record<string, PropValue> = { ...entry.defaults };
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(preset?.props ?? {})) {
    if (!known.has(key)) {
      dropped.push(key);
      continue;
    }
    props[key] = value;
  }
  return { props, dropped };
}

/* ------------------------------------------------------------------ search */

export type WidgetSearchHit = {
  type: SectionType;
  label: string;
  group: string;
  score: number;
  /** Why it matched — surfaced as a chip so search never feels arbitrary. */
  reason: "label" | "synonym" | "vertical" | "help";
};

export type WidgetSearchQuery = {
  term?: string;
  slot: Slot;
  vertical?: WidgetVertical;
  /** Most-recently-used types, ranked ahead of equal-scoring matches. */
  recent?: SectionType[];
  limit?: number;
};

const MAX_HITS = 60;

/**
 * Deterministic scoring: an exact label beats a prefix, a prefix beats a
 * substring, synonyms beat help prose. Slot legality is a filter, never a
 * score, so the tray can only offer widgets the slot actually accepts.
 */
export function searchWidgets(query: WidgetSearchQuery): WidgetSearchHit[] {
  const term = (query.term ?? "").trim().toLowerCase();
  const recent = query.recent ?? [];
  const limit = Math.min(Math.max(query.limit ?? MAX_HITS, 1), MAX_HITS);
  const hits: WidgetSearchHit[] = [];

  for (const entry of SECTION_CATALOG) {
    if (!entry.slots.includes(query.slot)) continue;
    const verticals = verticalsOf(entry.type);
    if (query.vertical && query.vertical !== "general" && !verticals.includes(query.vertical) && !verticals.includes("general")) {
      continue;
    }
    const label = entry.label.toLowerCase();
    const synonyms = synonymsOf(entry.type);
    const help = WIDGET_HELP[entry.type].en.toLowerCase();
    let score = 0;
    let reason: WidgetSearchHit["reason"] = "label";

    if (!term) {
      score = 10;
      reason = query.vertical && query.vertical !== "general" && verticals.includes(query.vertical) ? "vertical" : "label";
    } else if (label === term) {
      score = 100;
    } else if (label.startsWith(term)) {
      score = 80;
    } else if (label.includes(term) || entry.type.includes(term)) {
      score = 60;
    } else if (synonyms.some((s) => s.includes(term))) {
      score = 45;
      reason = "synonym";
    } else if (help.includes(term)) {
      score = 20;
      reason = "help";
    } else {
      continue;
    }

    const recentIndex = recent.indexOf(entry.type);
    if (recentIndex >= 0) score += Math.max(6 - recentIndex, 1);
    if (query.vertical && query.vertical !== "general" && verticals.includes(query.vertical)) score += 5;
    hits.push({ type: entry.type, label: entry.label, group: entry.group, score, reason });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Widgets recommended for a vertical, in catalog order. */
export function recommendedFor(vertical: WidgetVertical, slot: Slot): SectionType[] {
  return SECTION_CATALOG.filter((e) => e.slots.includes(slot) && verticalsOf(e.type).includes(vertical)).map((e) => e.type);
}
