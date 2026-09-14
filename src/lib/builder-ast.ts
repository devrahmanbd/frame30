/**
 * Page-builder AST v2.
 *
 * Every page is slot-keyed (header / main / footer) and every widget is a plain
 * data node, so a version snapshot is fully serialisable and replayable. A page
 * belongs to a template key (index / product / collection / ...) and a theme
 * carries one AST per template plus a token set.
 *
 * Nothing here trusts the client: `parseAst` / `parseTemplates` / `parseTokens`
 * are the server-side shape guards, and an unknown or malformed widget is kept
 * as a placeholder instead of breaking the whole page render.
 */
import { SIZES_LABEL, SIZES_PRESETS, altKey, sizesKey } from "./media";
import { PRESET_BN } from "./theme-presets.bn";
import { biTextState, bnKey, readBiText, type Locale } from "./bitext";
import { isTaxonomyValue, type TaxonomySource } from "./taxonomy";
import { UNIT_KINDS, type UnitKind } from "./unit-format";
import { VISIBILITY_OPS, type VisibilityRule, type VisibilityKind } from "./visibility";
import { hasFixedWidth, isUppercaseHostile, spanClass } from "./responsive";
import { headingIssues } from "./seo-technical";
import { DEFAULT_GLOBALS, globalsToCss, parseGlobals, type ThemeGlobals } from "./theme-globals";
import { JSONLD_SINGLETONS, jsonLdIssues, sectionJsonLd } from "./structured-data";
import { answerBlockIssues, authorIssues, localeParityIssues } from "./seo-answers";
import { guardrailIssues } from "./builder-guardrails";


export type { Locale };


export const TEMPLATE_KEYS = [
  "index",
  "product",
  "collection",
  "page",
  "blog",
  "cart",
  "checkout",
  // Phase 6: the search-results template is a first-class theme part, so a
  // merchant designs the listing shoppers land on instead of inheriting a
  // hand-written page.
  "search",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/**
 * Phase 5 — templates whose `<h1>` is supplied by the route, not by a widget.
 * Declared here (not as a test allow-list) so `lintTemplate` can be strict in
 * both directions: these templates must NOT contain an h1-claiming widget, and
 * every other template must contain exactly one.
 */
export const ROUTE_H1_TEMPLATES = ["product", "collection", "page", "blog", "search"] as const;
const ROUTE_H1 = new Set<string>(ROUTE_H1_TEMPLATES);
export function routeSuppliesH1(template?: TemplateKey | null): boolean {
  return !!template && ROUTE_H1.has(template);
}

export const SLOTS = ["header", "main", "footer"] as const;
export type Slot = (typeof SLOTS)[number];

export const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

export type SectionType =
  | "container"
  | "columns"
  | "divider"
  | "hero"
  | "heading"
  | "rich_text"
  | "image"
  | "video"
  | "product_grid"
  | "collection_grid"
  | "banner"
  | "feature_row"
  | "testimonial"
  | "faq"
  | "countdown"
  | "marquee"
  | "newsletter"
  | "spacer"
  | "html"
  | "plugin_block"
  | "breadcrumb"
  | "product_media"
  | "price_block"
  | "add_to_cart"
  | "product_meta"
  | "page_content"
  | "cart_summary"
  // Phase 1 shared primitives, surfaced as widgets.
  | "tabs"
  | "accordion"
  | "sticky_bar"
  | "spec_table"
  | "quiz"
  | "recently_viewed"
  | "quick_view"
  | "bundle_offer"
  // Phase 2.1 chrome widgets.
  | "announcement_bar"
  | "utility_bar"
  | "trust_bar"
  | "payment_icons"
  | "notice"
  | "mega_menu"
  | "department_strip"
  | "footer_sitemap"
  | "search_command"
  | "account_cart"
  // Phase 2.2 merchandising widgets.
  | "product_rail"
  | "deal_card"
  | "deal_strip"
  | "sponsored_slot"
  | "brand_strip"
  | "brand_rail"
  | "compare_table"
  | "rank_list"
  // Phase 2.3 product detail page widgets.
  | "buy_box"
  | "variant_picker"
  | "delivery_promise"
  | "stock_delivery"
  | "rating_summary"
  | "review_list"
  | "product_qna"
  | "seller_card"
  | "sticky_buy_bar"
  // Phase 2.4 collection / search widgets.
  | "facet_sidebar"
  | "filter_chips"
  | "result_toolbar"
  | "pagination"
  | "category_header"
  | "empty_state"
  // Phase 2.5 cart / checkout / account widgets.
  | "cart_lines"
  | "cart_drawer"
  | "checkout_steps"
  | "payment_methods"
  | "order_tracker"
  | "free_shipping_bar"
  // Phase 2.6 Atelier (apparel) widgets.
  | "editorial_hero"
  | "lookbook"
  | "shoppable_image"
  | "split_feature"
  | "collection_story"
  | "ugc_gallery"
  | "social_strip"
  | "store_locator"
  | "size_selector"
  | "size_guide"
  | "fit_note"
  | "back_in_stock"
  | "care_panel"
  | "sustain_badge"
  | "complete_the_look"
  | "wishlist_button"
  // Phase 2.7 Circuit (electronics) widgets.
  | "spec_highlights"
  | "compare_tray"
  | "warranty_panel"
  | "authenticity_badge"
  | "emi_calculator"
  | "price_sparkline"
  | "bundle_builder"
  | "doc_links"
  | "support_strip"
  | "buying_guide"
  | "trade_in"
  // Phase 2.8 Rupaboti (beauty) widgets.
  | "shade_finder"
  | "skin_quiz"
  | "routine_builder"
  | "ingredient_list"
  | "ingredient_glossary"
  | "claim_chips"
  | "before_after"
  | "safety_note"
  | "batch_info"
  | "texture_strip"
  | "how_to_use"
  | "refill_widget"
  | "gift_builder"
  | "sample_picker"
  | "consult_cta"
  | "loyalty_strip"
  // Phase 7 — layout primitives (Elementor-grade basics).
  | "button"
  | "icon"
  | "form"
  | "nav_menu"
  | "logo"
  | "carousel"
  // Phase 8 — blog archive pack: the reader listing as builder widgets, so the
  // blog wears the active theme instead of a hand-written wrapper.
  | "blog_archive"
  | "blog_terms"
  | "blog_pager";

export type PropScalar = string | number | boolean;
/** A repeatable row (Phase 3.2 `array` fields). Always JSON-safe. */
export type PropRow = Record<string, PropScalar>;
export type PropValue = PropScalar | PropRow[];
/** Hard cap on repeatable rows per array field. */
export const MAX_ARRAY_ROWS = 24;

/** AST v3 nesting limits. A stored tree that exceeds them is truncated, never rejected. */
export const MAX_TREE_DEPTH = 6;
export const MAX_NODES_PER_TEMPLATE = 300;

export type Section = {
  id: string;
  type: SectionType;
  props: Record<string, PropValue>;
  /**
   * AST v3: child nodes, only accepted by catalog entries flagged
   * `container: true`. Depth is capped at MAX_TREE_DEPTH and the whole
   * template is capped at MAX_NODES_PER_TEMPLATE nodes.
   */
  children?: Section[];
  /** Per-breakpoint visibility. Absent = visible everywhere. */
  hidden?: Breakpoint[];
  /**
   * Per-breakpoint prop overrides. Reserved key so existing sections stay
   * valid without migration; base props inherit downward when absent.
   */
  bp?: Partial<Record<Breakpoint, Record<string, PropValue>>>;
  /** Set when the stored node failed validation; renderer shows a placeholder. */
  invalid?: string;
  /** Phase 3.2: AND-combined conditional visibility rules. */
  when?: VisibilityRule[];
  /** Phase 3.2: renders only for visitors assigned to this experiment variant. */
  ab?: { experiment: string; variant: string };
};

export type ThemeAst = { header: Section[]; main: Section[]; footer: Section[] };
export type ThemeTemplates = Partial<Record<TemplateKey, ThemeAst>>;

export const EMPTY_AST: ThemeAst = { header: [], main: [], footer: [] };

/**
 * Phase 1.1: `bitext` is a text field with a বাংলা sibling stored under
 * `${key}_bn`. It sanitises exactly like `text`/`textarea`; the difference is
 * that the inspector shows two tabs and lint checks translation coverage.
 *
 * Phase 3.2 adds typed kinds: `color`, `range`, `image`, `taxonomy`, `unit`,
 * plus the structural `group` (titled cluster of sub-fields, flattened into
 * props) and `array` (repeatable rows stored as `PropRow[]`).
 */
export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "url"
  | "boolean"
  | "embed"
  | "bitext"
  | "color"
  | "range"
  | "image"
  | "taxonomy"
  | "unit"
  | "group"
  | "html"
  | "array";
export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  max?: number;
  /** Inspector panel this field belongs to. */
  panel?: "content" | "layout" | "style" | "advanced";
  /** Field can be overridden per breakpoint. */
  responsive?: boolean;
  /** `group` / `array`: nested schema. */
  fields?: Field[];
  /** Numeric bounds for `number`, `range` and `unit`. */
  min?: number;
  step?: number;
  /** Unit shown/formatted for a `unit` field. */
  unit?: UnitKind;
  /** Term list a `taxonomy` field draws from. */
  source?: TaxonomySource;
  /** `array`: which sub-key titles each collapsed row. */
  itemLabel?: string;
  /** `array`: maximum rows (defaults to MAX_ARRAY_ROWS). */
  maxRows?: number;
};

export type CatalogEntry = {
  type: SectionType;
  label: string;
  group: "layout" | "content" | "commerce" | "engagement" | "context";
  slots: Slot[];
  /** A page may have exactly one primary heading; these types can claim it. */
  heading: boolean;
  /**
   * Templates where this widget resolves live data. Absent = every template.
   * Outside these templates the renderer shows a labelled placeholder.
   */
  templates?: TemplateKey[];
  /** AST v3: the node may hold `children`. Everything else is a leaf. */
  container?: boolean;
  defaults: Record<string, PropValue>;
  fields: Field[];
};



const text = (key: string, label: string, max = 200): Field => ({
  key,
  label,
  kind: "text",
  max,
  panel: "content",
});
const area = (key: string, label: string, max = 2000): Field => ({
  key,
  label,
  kind: "textarea",
  max,
  panel: "content",
});
const num = (key: string, label: string): Field => ({ key, label, kind: "number", panel: "layout" });
const cols = (key: string, label: string): Field => ({
  key,
  label,
  kind: "number",
  panel: "layout",
  responsive: true,
});
const url = (key: string, label: string): Field => ({ key, label, kind: "url", max: 500, panel: "content" });
const embed = (key: string, label: string): Field => ({ key, label, kind: "embed", max: 500, panel: "content" });
const bool = (key: string, label: string): Field => ({ key, label, kind: "boolean", panel: "layout" });

/**
 * Phase 7.4: guides make claims, so they carry attribution. Shared so every
 * authored widget exposes the same four inspector fields.
 */
const AUTHOR_FIELDS: Field[] = [
  text("author", "Author name", 80),
  text("authorRole", "Author expertise / role", 120),
  text("reviewedBy", "Reviewed by", 80),
  text("reviewedOn", "Reviewed on (YYYY-MM-DD)", 10),
];

/** Phase 2.2: one shared product-card vocabulary across every merchandising widget. */
const DENSITY: Field = {
  key: "density",
  label: "Density",
  kind: "select",
  panel: "style",
  options: [
    { value: "comfortable", label: "Comfortable" },
    { value: "compact", label: "Compact" },
  ],
};

const CARD_VARIANT: Field = {
  key: "cardVariant",
  label: "Card style",
  kind: "select",
  panel: "style",
  options: [
    { value: "standard", label: "Standard" },
    { value: "compact", label: "Compact" },
    { value: "wide", label: "Wide" },
    { value: "editorial", label: "Editorial" },
  ],
};

const ALIGN: Field = {

  key: "align",
  label: "Alignment",
  kind: "select",
  panel: "style",
  responsive: true,
  options: [
    { value: "left", label: "Left" },
    { value: "center", label: "Centre" },
  ],
};


const BASE_CATALOG: CatalogEntry[] = [
  {
    // AST v3 unlock: the only node type that owns a subtree.
    type: "container",
    label: "Container",
    group: "layout",
    slots: ["header", "main", "footer"],
    heading: false,
    container: true,
    defaults: { columns: 1, gap: 24, padY: 0, maxW: "container", align: "left", bg: "none" },
    fields: [
      cols("columns", "Columns (1-4)"),
      { key: "gap", label: "Gap in px (0-64)", kind: "number", panel: "layout", responsive: true },
      { key: "padY", label: "Vertical padding in px (0-160)", kind: "number", panel: "style", responsive: true },
      {
        key: "maxW",
        label: "Width",
        kind: "select",
        panel: "style",
        options: [
          { value: "container", label: "Container" },
          { value: "narrow", label: "Narrow" },
          { value: "full", label: "Full width" },
        ],
      },
      {
        key: "bg",
        label: "Background",
        kind: "select",
        panel: "style",
        options: [
          { value: "none", label: "None" },
          { value: "surface", label: "Surface" },
          { value: "muted", label: "Muted" },
        ],
      },
      ALIGN,
    ],
  },
  {
    // Sugar over container with a fixed split; same renderer, same children.
    type: "columns",
    label: "Columns",
    group: "layout",
    slots: ["header", "main", "footer"],
    heading: false,
    container: true,
    defaults: { columns: 2, gap: 24, padY: 0, maxW: "container", align: "left", bg: "none" },
    fields: [
      cols("columns", "Columns (1-4)"),
      { key: "gap", label: "Gap in px (0-64)", kind: "number", panel: "layout", responsive: true },
      { key: "padY", label: "Vertical padding in px (0-160)", kind: "number", panel: "style", responsive: true },
      ALIGN,
    ],
  },
  {
    type: "divider",
    label: "Divider",
    group: "layout",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: { label: "", padY: 24 },
    fields: [text("label", "Label (optional)", 60), num("padY", "Vertical padding in px (0-96)")],
  },
  {
    type: "hero",
    label: "Hero",
    group: "layout",
    slots: ["main"],
    heading: true,
    defaults: {
      heading: "Welcome to our store",
      subheading: "",
      ctaLabel: "",
      ctaHref: "",
      align: "left",
      image: "",
      s2Heading: "",
      s2Image: "",
      s3Heading: "",
      s3Image: "",
    },
    fields: [
      text("heading", "Heading"),
      area("subheading", "Sub-heading", 400),
      text("ctaLabel", "Button label", 40),
      url("ctaHref", "Button link"),
      url("image", "Slide 1 image"),
      text("s2Heading", "Slide 2 heading"),
      url("s2Image", "Slide 2 image"),
      text("s3Heading", "Slide 3 heading"),
      url("s3Image", "Slide 3 image"),
      ALIGN,
    ],
  },
  {
    type: "heading",
    label: "Heading",
    group: "content",
    slots: ["header", "main", "footer"],
    heading: true,
    defaults: { text: "Section heading", level: "h2", align: "left" },
    fields: [
      text("text", "Text"),
      { key: "level", label: "Level", kind: "select", options: [{ value: "h2", label: "H2" }, { value: "h3", label: "H3" }] },
      ALIGN,
    ],
  },
  {
    type: "rich_text",
    label: "Text block",
    group: "content",
    slots: ["main", "footer"],
    heading: false,
    defaults: { heading: "", body: "Tell customers about your store." },
    fields: [text("heading", "Heading"), area("body", "Body")],
  },
  {
    type: "image",
    label: "Image",
    group: "content",
    slots: ["main", "footer"],
    heading: false,
    defaults: { src: "", alt: "", caption: "", ratio: "16/9" },
    fields: [
      url("src", "Image URL"),
      text("alt", "Alt text (required for accessibility)", 160),
      text("caption", "Caption", 160),
      { key: "ratio", label: "Aspect ratio", kind: "select", options: [{ value: "16/9", label: "16:9" }, { value: "4/3", label: "4:3" }, { value: "1/1", label: "Square" }] },
    ],
  },
  {
    type: "video",
    label: "Video",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: { src: "", title: "" },
    fields: [embed("src", "Embed URL (YouTube / Vimeo)"), text("title", "Accessible title", 120)],
  },
  {
    type: "product_grid",
    label: "Product grid",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Products", limit: 12, columns: 4, cardVariant: "standard", density: "comfortable", showRating: false, promise: "" },
    fields: [
      text("heading", "Heading"),
      num("limit", "Max products"),
      cols("columns", "Columns (2-4)"),
      text("promise", "Delivery promise", 60),
      bool("showRating", "Show rating"),
      CARD_VARIANT,
      DENSITY,
    ],
  },
  {
    type: "collection_grid",
    label: "Collection grid",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Collections", limit: 8, columns: 4, cardVariant: "standard", showCount: true },
    fields: [
      text("heading", "Heading"),
      num("limit", "Max collections"),
      cols("columns", "Columns (2-4)"),
      bool("showCount", "Show product counts"),
      CARD_VARIANT,
    ],
  },
  {
    type: "banner",
    label: "Announcement banner",
    group: "layout",
    slots: ["header", "main"],
    heading: false,
    defaults: { text: "Free delivery over BDT 2,000", tone: "info" },
    fields: [
      text("text", "Message"),
      { key: "tone", label: "Tone", kind: "select", options: [{ value: "info", label: "Info" }, { value: "warn", label: "Warning" }, { value: "success", label: "Success" }] },
    ],
  },
  {
    type: "feature_row",
    label: "Feature row",
    group: "layout",
    slots: ["main", "footer"],
    heading: false,
    defaults: { itemOne: "Cash on delivery", itemTwo: "Mobile payments", itemThree: "Nationwide shipping" },
    fields: [text("itemOne", "Item 1", 80), text("itemTwo", "Item 2", 80), text("itemThree", "Item 3", 80)],
  },
  {
    type: "testimonial",
    label: "Testimonial",
    group: "engagement",
    slots: ["main"],
    heading: false,
    defaults: { quote: "Great products and fast delivery.", author: "A happy customer" },
    fields: [area("quote", "Quote", 400), text("author", "Author", 80)],
  },
  {
    type: "faq",
    label: "FAQ accordion",
    group: "engagement",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Frequently asked", q1: "", a1: "", q2: "", a2: "", q3: "", a3: "" },
    fields: [
      text("heading", "Heading"),
      text("q1", "Question 1"), area("a1", "Answer 1", 600),
      text("q2", "Question 2"), area("a2", "Answer 2", 600),
      text("q3", "Question 3"), area("a3", "Answer 3", 600),
    ],
  },
  {
    type: "countdown",
    label: "Countdown",
    group: "engagement",
    slots: ["header", "main"],
    heading: false,
    defaults: { label: "Offer ends in", endsAt: "" },
    fields: [text("label", "Label", 80), text("endsAt", "Ends at (ISO date-time)", 40)],
  },
  {
    type: "marquee",
    label: "Marquee",
    group: "engagement",
    slots: ["header", "main"],
    heading: false,
    // Phase 2.6 [U]: pause on hover, and a static fallback under reduced motion.
    defaults: { text: "New arrivals every week", speed: 30, pauseOnHover: true },
    fields: [text("text", "Text"), num("speed", "Seconds per loop"), bool("pauseOnHover", "Pause on hover")],
  },
  {
    type: "newsletter",
    label: "Newsletter signup",
    group: "engagement",
    slots: ["main", "footer"],
    heading: false,
    defaults: { heading: "Stay in touch", body: "Get offers by email. Unsubscribe any time.", buttonLabel: "Subscribe", consentText: "" },
    fields: [text("heading", "Heading"), area("body", "Body", 300), text("buttonLabel", "Button label", 40), text("consentText", "Consent line", 200)],
  },
  {
    type: "spacer",
    label: "Spacer",
    group: "layout",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: { size: 32 },
    fields: [num("size", "Height in px (8-160)")],
  },
  {
    type: "html",
    label: "Custom HTML",
    group: "content",
    slots: ["main", "footer"],
    heading: false,
    defaults: { body: "", markup: "" },
    fields: [
      area("body", "Plain text — markup and scripts are stripped", 2000),
      {
        key: "markup",
        label: "HTML — rendered inside a sandboxed frame (no cookies, no page access)",
        kind: "html",
        max: 8000,
        panel: "advanced",
      },
    ],
  },

  {
    // Phase 5: the single namespaced tier through which plugins contribute
    // widgets. The core registry stays closed; `pluginKey` selects the
    // sandboxed island, and unknown/incompatible keys render a placeholder.
    type: "plugin_block",
    label: "App block",
    group: "content",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: { pluginKey: "", height: 320 },
    fields: [
      text("pluginKey", "App widget key (plugin:{app}/{widget})", 90),
      num("height", "Height in px (80-1200)"),
    ],
  },

  {
    type: "breadcrumb",
    label: "Breadcrumb",
    group: "context",
    slots: ["header", "main"],
    heading: false,
    templates: ["product", "collection", "page", "blog", "search"],
    defaults: { homeLabel: "Home" },
    fields: [text("homeLabel", "Home label", 40)],
  },
  {
    type: "product_media",
    label: "Product media",
    group: "context",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: {
      ratio: "1/1",
      showThumbnails: true,
      zoom: true,
      image1: "",
      image2: "",
      image3: "",
      image4: "",
      altText: "",
    },
    fields: [
      {
        key: "ratio",
        label: "Aspect ratio",
        kind: "select",
        panel: "layout",
        responsive: true,
        options: [
          { value: "1/1", label: "Square" },
          { value: "4/3", label: "4:3" },
          { value: "16/9", label: "16:9" },
        ],
      },
      bool("showThumbnails", "Show thumbnails"),
      bool("zoom", "Tap to zoom"),
      url("image1", "Image 1"),
      url("image2", "Image 2"),
      url("image3", "Image 3"),
      url("image4", "Image 4"),
      text("altText", "Alt text", 160),
    ],
  },
  {
    type: "price_block",
    label: "Price block",
    group: "context",
    slots: ["main"],
    heading: false,
    templates: ["product", "cart"],
    defaults: { showCompareAt: true, note: "" },
    fields: [bool("showCompareAt", "Show compare-at price"), text("note", "Note under price", 120)],
  },
  {
    type: "add_to_cart",
    label: "Add to cart",
    group: "context",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { label: "Add to cart", showQuantity: true },
    fields: [text("label", "Button label", 40), bool("showQuantity", "Show quantity picker")],
  },
  {
    type: "product_meta",
    label: "Product details",
    group: "context",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { heading: "Product details" },
    fields: [text("heading", "Heading")],
  },
  {
    type: "page_content",
    label: "Page content",
    group: "context",
    slots: ["main"],
    heading: false,
    templates: ["page", "blog"],
    defaults: {},
    fields: [],
  },
  {
    // Phase 2.5 [U]: no longer a passive host slot — it renders the server quote.
    type: "cart_summary",
    label: "Cart summary",
    group: "commerce",
    slots: ["main"],
    heading: true,
    templates: ["cart", "checkout"],
    defaults: {
      heading: "Order summary",
      subtotalLabel: "Subtotal",
      discountLabel: "Discount",
      shippingLabel: "Delivery",
      codLabel: "Cash on delivery fee",
      vatLabel: "VAT",
      totalLabel: "Total",
      ctaLabel: "Checkout",
      couponLabel: "Coupon code",
      couponApplyLabel: "Apply",
      emptyText: "Add something to see your total.",
      freeShippingLabel: "Spend",
      freeShippingSuffix: "more for free shipping",
      freeShippingDone: "Free shipping unlocked.",
      showCoupon: true,
      showCta: true,
      showFreeShipping: true,
    },
    fields: [
      text("heading", "Heading"),
      text("subtotalLabel", "Subtotal label", 40),
      text("discountLabel", "Discount label", 40),
      text("shippingLabel", "Delivery label", 40),
      text("codLabel", "COD fee label", 40),
      text("vatLabel", "VAT label", 40),
      text("totalLabel", "Total label", 40),
      text("ctaLabel", "Checkout button label", 40),
      text("couponLabel", "Coupon field label", 40),
      text("couponApplyLabel", "Coupon button label", 40),
      text("emptyText", "Empty text", 120),
      text("freeShippingLabel", "Free shipping prefix", 40),
      text("freeShippingSuffix", "Free shipping suffix", 60),
      text("freeShippingDone", "Free shipping unlocked text", 80),
      bool("showCoupon", "Show coupon field"),
      bool("showCta", "Show checkout button"),
      bool("showFreeShipping", "Show free shipping progress"),
    ],
  },

  /* ------------------------- Phase 1 — shared primitives ------------------- */
  {
    // Consumes the Tabs primitive: one roving-focus implementation.
    type: "tabs",
    label: "Tabs",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      t1Label: "Overview", t1Body: "",
      t2Label: "Details", t2Body: "",
      t3Label: "", t3Body: "",
    },
    fields: [
      text("t1Label", "Tab 1 label", 60), area("t1Body", "Tab 1 body", 1200),
      text("t2Label", "Tab 2 label", 60), area("t2Body", "Tab 2 body", 1200),
      text("t3Label", "Tab 3 label", 60), area("t3Body", "Tab 3 body", 1200),
    ],
  },
  {
    // Consumes the Disclosure primitive — same a11y contract as `faq`.
    type: "accordion",
    label: "Accordion",
    group: "content",
    slots: ["main", "footer"],
    heading: false,
    defaults: {
      heading: "",
      i1Title: "", i1Body: "",
      i2Title: "", i2Body: "",
      i3Title: "", i3Body: "",
      openFirst: false,
    },
    fields: [
      text("heading", "Heading"),
      text("i1Title", "Item 1 title"), area("i1Body", "Item 1 body", 1200),
      text("i2Title", "Item 2 title"), area("i2Body", "Item 2 body", 1200),
      text("i3Title", "Item 3 title"), area("i3Body", "Item 3 body", 1200),
      bool("openFirst", "Open the first item by default"),
    ],
  },
  {
    type: "sticky_bar",
    label: "Sticky bar",
    group: "engagement",
    slots: ["header", "footer"],
    heading: false,
    defaults: { text: "Free delivery over BDT 2,000", ctaLabel: "", ctaHref: "", position: "bottom" },
    fields: [
      text("text", "Message"),
      text("ctaLabel", "Button label", 40),
      url("ctaHref", "Button link"),
      {
        key: "position",
        label: "Position",
        kind: "select",
        panel: "layout",
        options: [
          { value: "bottom", label: "Bottom" },
          { value: "top", label: "Top" },
        ],
      },
    ],
  },
  {
    // Consumes the DataTable primitive (sticky chrome + mobile stacking).
    type: "spec_table",
    label: "Spec table",
    group: "content",
    slots: ["main"],
    heading: false,
    // Phase 2.7 [U]: rows may declare a group, and groups collapse. Every
    // pre-2.7 prop still means what it meant, so stored ASTs need no migration.
    defaults: {
      caption: "",
      columnLabel: "This product",
      grouped: true,
      handle: "",
      r1Group: "", r1Label: "", r1Value: "",
      r2Group: "", r2Label: "", r2Value: "",
      r3Group: "", r3Label: "", r3Value: "",
      r4Group: "", r4Label: "", r4Value: "",
      r5Group: "", r5Label: "", r5Value: "",
      r6Group: "", r6Label: "", r6Value: "",
    },
    fields: [
      text("caption", "Caption", 160),
      text("columnLabel", "Column heading", 80),
      bool("grouped", "Collapsible groups"),
      text("handle", "Product handle", 120),
      text("r1Group", "Row 1 group", 60), text("r1Label", "Row 1 label", 80), text("r1Value", "Row 1 value", 160),
      text("r2Group", "Row 2 group", 60), text("r2Label", "Row 2 label", 80), text("r2Value", "Row 2 value", 160),
      text("r3Group", "Row 3 group", 60), text("r3Label", "Row 3 label", 80), text("r3Value", "Row 3 value", 160),
      text("r4Group", "Row 4 group", 60), text("r4Label", "Row 4 label", 80), text("r4Value", "Row 4 value", 160),
      text("r5Group", "Row 5 group", 60), text("r5Label", "Row 5 label", 80), text("r5Value", "Row 5 value", 160),
      text("r6Group", "Row 6 group", 60), text("r6Label", "Row 6 label", 80), text("r6Value", "Row 6 value", 160),
    ],
  },
  {
    // Consumes the flow machine; the result is a shareable filter URL.
    type: "quiz",
    label: "Quiz / finder",
    group: "engagement",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Find your match",
      resultBase: "/",
      resultLabel: "See my matches",
      q1Key: "", q1Label: "", q1Choices: "", q1Multiple: false,
      q2Key: "", q2Label: "", q2Choices: "", q2Multiple: false,
      q3Key: "", q3Label: "", q3Choices: "", q3Multiple: false,
      consentText: "",
    },
    fields: [
      text("heading", "Heading"),
      url("resultBase", "Result URL base"),
      text("resultLabel", "Result button label", 60),
      text("q1Key", "Step 1 filter key", 40), text("q1Label", "Step 1 question"),
      text("q1Choices", "Step 1 choices (comma separated)", 300), bool("q1Multiple", "Step 1 allows multiple"),
      text("q2Key", "Step 2 filter key", 40), text("q2Label", "Step 2 question"),
      text("q2Choices", "Step 2 choices (comma separated)", 300), bool("q2Multiple", "Step 2 allows multiple"),
      text("q3Key", "Step 3 filter key", 40), text("q3Label", "Step 3 question"),
      text("q3Choices", "Step 3 choices (comma separated)", 300), bool("q3Multiple", "Step 3 allows multiple"),
      text("consentText", "Consent line", 200),
    ],
  },
  {
    // Consumes the cross-section channel; survives navigation, capped and per-store.
    type: "recently_viewed",
    label: "Recently viewed",
    group: "commerce",
    slots: ["main", "footer"],
    heading: false,
    defaults: { heading: "Recently viewed", limit: 6, showClear: true },
    fields: [text("heading", "Heading"), num("limit", "Max items (1-12)"), bool("showClear", "Show clear button")],
  },
  {
    // Consumes the overlay host: focus trap, scroll lock, Escape, focus restore.
    type: "quick_view",
    label: "Quick view",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Quick view", buttonLabel: "Quick view", limit: 6 },
    fields: [text("heading", "Heading"), text("buttonLabel", "Button label", 40), num("limit", "Max products")],
  },
  {
    // Bundle/total contract: the item set posts to the server and the widget
    // renders the returned total. Client money math is forbidden.
    type: "bundle_offer",
    label: "Bundle offer",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Build your bundle",
      buttonLabel: "Calculate total",
      i1Label: "", i1VariantId: "",
      i2Label: "", i2VariantId: "",
      i3Label: "", i3VariantId: "",
      i4Label: "", i4VariantId: "",
    },
    fields: [
      text("heading", "Heading"),
      text("buttonLabel", "Button label", 40),
      text("i1Label", "Item 1 label"), text("i1VariantId", "Item 1 variant id", 60),
      text("i2Label", "Item 2 label"), text("i2VariantId", "Item 2 variant id", 60),
      text("i3Label", "Item 3 label"), text("i3VariantId", "Item 3 variant id", 60),
      text("i4Label", "Item 4 label"), text("i4VariantId", "Item 4 variant id", 60),
    ],
  },

  /* ---------------------------- Phase 2.1 — chrome widgets ----------------- */
  {
    type: "announcement_bar",
    label: "Announcement bar",
    group: "engagement",
    slots: ["header", "footer"],
    heading: false,
    defaults: { m1: "Free delivery over BDT 2,000", m2: "", m3: "", href: "", dismissible: true, rotateMs: 6000 },
    fields: [
      text("m1", "Message 1", 160),
      text("m2", "Message 2", 160),
      text("m3", "Message 3", 160),
      url("href", "Link"),
      bool("dismissible", "Dismissible"),
      num("rotateMs", "Rotation in ms (0 = off)"),
    ],
  },
  {
    type: "utility_bar",
    label: "Utility bar",
    group: "engagement",
    slots: ["header"],
    heading: false,
    defaults: {
      note: "",
      l1Label: "", l1Href: "",
      l2Label: "", l2Href: "",
      l3Label: "", l3Href: "",
      showLanguage: true,
    },
    fields: [
      text("note", "Note", 120),
      text("l1Label", "Link 1 label", 40), url("l1Href", "Link 1 URL"),
      text("l2Label", "Link 2 label", 40), url("l2Href", "Link 2 URL"),
      text("l3Label", "Link 3 label", 40), url("l3Href", "Link 3 URL"),
      bool("showLanguage", "Show language toggle"),
    ],
  },
  {
    type: "trust_bar",
    label: "Trust bar",
    group: "content",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: {
      i1Icon: "delivery", i1Title: "Fast delivery", i1Body: "",
      i2Icon: "returns", i2Title: "Easy returns", i2Body: "",
      i3Icon: "secure", i3Title: "Secure payment", i3Body: "",
      i4Icon: "support", i4Title: "", i4Body: "",
    },
    fields: [
      text("i1Icon", "Item 1 icon key", 20), text("i1Title", "Item 1 title"), text("i1Body", "Item 1 body", 120),
      text("i2Icon", "Item 2 icon key", 20), text("i2Title", "Item 2 title"), text("i2Body", "Item 2 body", 120),
      text("i3Icon", "Item 3 icon key", 20), text("i3Title", "Item 3 title"), text("i3Body", "Item 3 body", 120),
      text("i4Icon", "Item 4 icon key", 20), text("i4Title", "Item 4 title"), text("i4Body", "Item 4 body", 120),
    ],
  },
  {
    type: "payment_icons",
    label: "Payment icons",
    group: "content",
    slots: ["footer", "main"],
    heading: false,
    defaults: { heading: "We accept", marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery" },
    fields: [text("heading", "Heading"), area("marks", "Marks (comma separated)", 300)],
  },
  {
    type: "notice",
    label: "Notice",
    group: "content",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: { text: "", tone: "info", dismissible: false },
    fields: [
      area("text", "Message", 300),
      {
        key: "tone",
        label: "Tone",
        kind: "select",
        panel: "style",
        options: [
          { value: "info", label: "Info" },
          { value: "success", label: "Success" },
          { value: "warning", label: "Warning" },
          { value: "danger", label: "Danger" },
        ],
      },
      bool("dismissible", "Dismissible"),
    ],
  },
  {
    // Three-level navigation sourced from the taxonomy data source.
    type: "mega_menu",
    label: "Mega menu",
    group: "content",
    slots: ["header"],
    heading: false,
    defaults: { label: "Shop", limit: 8, columns: 4 },
    fields: [text("label", "Trigger label", 40), num("limit", "Max top-level entries"), cols("columns", "Columns (1-4)")],
  },
  {
    type: "department_strip",
    label: "Department strip",
    group: "content",
    slots: ["header", "main"],
    heading: false,
    defaults: { heading: "", limit: 12 },
    fields: [text("heading", "Heading"), num("limit", "Max departments")],
  },
  {
    type: "footer_sitemap",
    label: "Footer sitemap",
    group: "content",
    slots: ["footer"],
    heading: false,
    defaults: {
      c1Title: "Shop", c1Links: "New in|/, Best sellers|/",
      c2Title: "Help", c2Links: "Contact|/, Shipping|/",
      c3Title: "About", c3Links: "",
      c4Title: "", c4Links: "",
    },
    fields: [
      text("c1Title", "Column 1 title", 40), area("c1Links", "Column 1 links (Label|/href, …)", 600),
      text("c2Title", "Column 2 title", 40), area("c2Links", "Column 2 links (Label|/href, …)", 600),
      text("c3Title", "Column 3 title", 40), area("c3Links", "Column 3 links (Label|/href, …)", 600),
      text("c4Title", "Column 4 title", 40), area("c4Links", "Column 4 links (Label|/href, …)", 600),
    ],
  },
  {
    // Typeahead palette in the shared overlay host; the server ranks, never the client.
    type: "search_command",
    label: "Search",
    group: "content",
    slots: ["header"],
    heading: false,
    defaults: { placeholder: "Search products", buttonLabel: "Search", limit: 6 },
    fields: [
      text("placeholder", "Placeholder", 60),
      text("buttonLabel", "Button label", 40),
      num("limit", "Max suggestions"),
    ],
  },
  {
    type: "account_cart",
    label: "Account and cart",
    group: "commerce",
    slots: ["header"],
    heading: false,
    defaults: { accountLabel: "Account", cartLabel: "Cart", showCount: true },
    fields: [
      text("accountLabel", "Account label", 40),
      text("cartLabel", "Cart label", 40),
      bool("showCount", "Show item count"),
    ],
  },

  /* ------------------------------- Phase 2.2 — merchandising widgets ------ */

  {
    type: "product_rail",
    label: "Product rail",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Trending now",
      limit: 12,
      source: "collection",
      collection: "",
      cardVariant: "compact",
      showRating: false,
      promise: "",
    },
    fields: [
      text("heading", "Heading"),
      {
        key: "source",
        label: "Source",
        kind: "select",
        panel: "content",
        options: [
          { value: "collection", label: "Collection" },
          { value: "bestsellers", label: "Bestsellers" },
          { value: "recommended", label: "Recommended" },
        ],
      },
      text("promise", "Delivery promise", 60),
      bool("showRating", "Show rating"),
      CARD_VARIANT,
    ],
  },
  {
    type: "deal_card",
    label: "Deal card",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Deal of the day", badgeLabel: "Save", endsAt: "", ctaLabel: "Shop now", ctaHref: "" },
    fields: [
      text("heading", "Heading"),
      text("badgeLabel", "Save badge label", 24),
      text("endsAt", "Ends at (ISO date-time)", 40),
      text("ctaLabel", "Button label", 40),
      url("ctaHref", "Button link"),
    ],
  },
  {
    type: "deal_strip",
    label: "Deal strip",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Today's deals", limit: 8, collection: "", badgeLabel: "Save", cardVariant: "compact" },
    fields: [
      text("heading", "Heading"),
      text("badgeLabel", "Save badge label", 24),
      CARD_VARIANT,
    ],
  },
  {
    type: "sponsored_slot",
    label: "Sponsored slot",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Featured", limit: 4, cardVariant: "compact" },
    fields: [text("heading", "Heading"), CARD_VARIANT],
  },
  {
    type: "brand_strip",
    label: "Brand strip",
    group: "commerce",
    slots: ["main", "footer"],
    heading: false,
    defaults: { heading: "Shop by brand", limit: 12, columns: 4, kind: "brand" },
    fields: [text("heading", "Heading"), cols("columns", "Columns (2-4)")],
  },
  {
    type: "brand_rail",
    label: "Brand rail",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Top brands", limit: 16, kind: "brand" },
    fields: [text("heading", "Heading")],
  },
  {
    type: "compare_table",
    label: "Compare table",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      caption: "Compare products",
      limit: 4,
      collection: "",
      r1Label: "Price",
      r2Label: "Availability",
      r3Label: "",
      r4Label: "",
    },
    fields: [
      text("caption", "Caption", 120),
      text("r1Label", "Row 1 label", 60),
      text("r2Label", "Row 2 label", 60),
      text("r3Label", "Row 3 label", 60),
      text("r4Label", "Row 4 label", 60),
    ],
  },
  {
    type: "rank_list",
    label: "Rank list",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { heading: "Bestsellers", limit: 10, collection: "" },
    fields: [text("heading", "Heading")],
  },

  /* --------------------------------- Phase 2.3 — product detail page ------ */
  {
    type: "buy_box",
    label: "Buy box",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: {
      handle: "",
      label: "Add to cart",
      showQuantity: true,
      showCompareAt: true,
      note: "",
      promise: "",
    },
    fields: [
      text("handle", "Product handle", 120),
      text("label", "Button label", 40),
      bool("showQuantity", "Show quantity picker"),
      bool("showCompareAt", "Show compare-at price"),
      text("note", "Note under price", 120),
      text("promise", "Delivery line", 120),
    ],
  },
  {
    type: "variant_picker",
    label: "Variant picker",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { handle: "", heading: "Choose an option", mode: "chip", axisOneLabel: "", axisTwoLabel: "" },
    fields: [
      text("handle", "Product handle", 120),
      text("heading", "Heading", 80),
      {
        key: "mode",
        label: "Display mode",
        kind: "select",
        panel: "layout",
        responsive: true,
        options: [
          { value: "chip", label: "Chips" },
          { value: "dropdown", label: "Dropdown" },
          { value: "swatch", label: "Swatches" },
          { value: "shade", label: "Shades (on-skin preview)" },
          { value: "matrix", label: "Matrix" },
        ],
      },
      text("axisOneLabel", "Axis 1 label", 40),
      text("axisTwoLabel", "Axis 2 label", 40),
    ],
  },
  {
    type: "delivery_promise",
    label: "Delivery promise",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product", "cart", "checkout"],
    defaults: {
      heading: "Delivery",
      insideLabel: "Inside Dhaka",
      insideDays: "1-2 working days",
      outsideLabel: "Outside Dhaka",
      outsideDays: "2-4 working days",
      note: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("insideLabel", "Zone 1 label", 60),
      text("insideDays", "Zone 1 estimate", 60),
      text("outsideLabel", "Zone 2 label", 60),
      text("outsideDays", "Zone 2 estimate", 60),
      text("note", "Note", 160),
    ],
  },
  {
    type: "stock_delivery",
    label: "Stock and dispatch",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { handle: "", lowStockAt: 5, cutOff: "Order before 4pm for same-day dispatch" },
    fields: [
      text("handle", "Product handle", 120),
      num("lowStockAt", "Low-stock threshold"),
      text("cutOff", "Dispatch cut-off", 120),
    ],
  },
  {
    type: "rating_summary",
    label: "Rating summary",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { handle: "", heading: "Customer ratings", showHistogram: true, verifiedOnly: false },
    fields: [
      text("handle", "Product handle", 120),
      text("heading", "Heading", 80),
      bool("showHistogram", "Show histogram"),
      bool("verifiedOnly", "Verified purchases only"),
    ],
  },
  {
    type: "review_list",
    label: "Review list",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { handle: "", heading: "Reviews", limit: 6, sort: "recent", verifiedOnly: false, emptyText: "No reviews yet." },
    fields: [
      text("handle", "Product handle", 120),
      text("heading", "Heading", 80),
      num("limit", "Reviews per page"),
      {
        key: "sort",
        label: "Sort",
        kind: "select",
        panel: "content",
        options: [
          { value: "recent", label: "Most recent" },
          { value: "rating_desc", label: "Highest rated" },
          { value: "rating_asc", label: "Lowest rated" },
        ],
      },
      bool("verifiedOnly", "Verified purchases only"),
      text("emptyText", "Empty state text", 120),
    ],
  },
  {
    type: "product_qna",
    label: "Questions and answers",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: {
      handle: "",
      heading: "Questions and answers",
      askLabel: "Ask a question",
      askHref: "",
      q1: "",
      a1: "",
      q2: "",
      a2: "",
      q3: "",
      a3: "",
    },
    fields: [
      text("handle", "Product handle", 120),
      text("heading", "Heading", 80),
      text("askLabel", "Ask button label", 40),
      url("askHref", "Ask button link"),
      text("q1", "Question 1", 160),
      area("a1", "Answer 1", 600),
      text("q2", "Question 2", 160),
      area("a2", "Answer 2", 600),
      text("q3", "Question 3", 160),
      area("a3", "Answer 3", 600),
    ],
  },
  {
    type: "seller_card",
    label: "Seller card",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: {
      name: "",
      tagline: "",
      logoUrl: "",
      rating: 0,
      policy: "",
      linkLabel: "Visit store",
      linkHref: "",
    },
    fields: [
      text("name", "Seller name", 80),
      text("tagline", "Tagline", 120),
      url("logoUrl", "Logo URL"),
      num("rating", "Rating out of 5"),
      text("policy", "Policy line", 160),
      text("linkLabel", "Link label", 40),
      url("linkHref", "Link URL"),
    ],
  },
  {
    type: "sticky_buy_bar",
    label: "Sticky buy bar",
    group: "commerce",
    slots: ["main", "footer"],
    heading: false,
    templates: ["product"],
    defaults: { handle: "", label: "Add to cart", showPrice: true, dockAfter: 320 },
    fields: [
      text("handle", "Product handle", 120),
      text("label", "Button label", 40),
      bool("showPrice", "Show price"),
      num("dockAfter", "Dock after (px scrolled)"),
    ],
  },

  /* ------------------------------ Phase 2.4 — collection / search widgets - */
  {
    type: "category_header",
    label: "Category header",
    group: "commerce",
    slots: ["main"],
    heading: true,
    templates: ["collection", "page", "search"],
    defaults: {
      heading: "All products",
      body: "",
      imageUrl: "",
      scrim: true,
      showCount: true,
      showBreadcrumb: true,
      homeLabel: "Home",
    },
    fields: [
      text("heading", "Title", 120),
      area("body", "Description", 600),
      url("imageUrl", "Banner image"),
      bool("scrim", "Darken banner behind text"),
      bool("showCount", "Show result count"),
      bool("showBreadcrumb", "Show breadcrumb"),
      text("homeLabel", "Breadcrumb home label", 40),
    ],
  },
  {
    type: "facet_sidebar",
    label: "Facet sidebar",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["collection", "search"],
    defaults: {
      heading: "Filters",
      limit: 24,
      showCategories: true,
      showKinds: true,
      showPrice: true,
      showStock: true,
      collapsed: false,
      drawerLabel: "Filters",
      clearLabel: "Clear all",
      categoryLabel: "Category",
      kindLabel: "Type",
      priceLabel: "Price",
      stockLabel: "Availability",
      inStockLabel: "In stock only",
    },
    fields: [
      text("heading", "Heading", 60),
      num("limit", "Max options per group"),
      bool("showCategories", "Category facet"),
      bool("showKinds", "Type facet"),
      bool("showPrice", "Price facet"),
      bool("showStock", "Availability facet"),
      bool("collapsed", "Start collapsed"),
      text("drawerLabel", "Mobile button label", 40),
      text("clearLabel", "Clear label", 40),
      text("categoryLabel", "Category group label", 40),
      text("kindLabel", "Type group label", 40),
      text("priceLabel", "Price group label", 40),
      text("stockLabel", "Availability group label", 40),
      text("inStockLabel", "In-stock option label", 40),
    ],
  },
  {
    type: "filter_chips",
    label: "Active filter chips",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["collection", "search"],
    defaults: { clearLabel: "Clear all", emptyText: "", showWhenEmpty: false },
    fields: [
      text("clearLabel", "Clear label", 40),
      text("emptyText", "Text when nothing is filtered", 80),
      bool("showWhenEmpty", "Show when nothing is filtered"),
    ],
  },
  {
    type: "result_toolbar",
    label: "Result toolbar",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["collection", "search"],
    defaults: {
      countLabel: "products",
      showSort: true,
      showDensity: true,
      filtersLabel: "Filters",
      sortLabel: "Sort",
    },
    fields: [
      text("countLabel", "Count noun", 40),
      bool("showSort", "Show sort control"),
      bool("showDensity", "Show density toggle"),
      text("filtersLabel", "Mobile filters label", 40),
      text("sortLabel", "Sort label", 40),
    ],
  },
  {
    type: "pagination",
    label: "Pagination",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["collection", "blog", "search"],
    defaults: {
      mode: "numbered",
      moreLabel: "Load more",
      prevLabel: "Previous",
      nextLabel: "Next",
      pageLabel: "Page",
    },
    fields: [
      {
        key: "mode",
        label: "Mode",
        kind: "select",
        panel: "layout",
        options: [
          { value: "numbered", label: "Numbered pages" },
          { value: "more", label: "Load more (with crawlable links)" },
        ],
      },
      text("moreLabel", "Load-more label", 40),
      text("prevLabel", "Previous label", 40),
      text("nextLabel", "Next label", 40),
      text("pageLabel", "Page word", 24),
    ],
  },
  {
    type: "empty_state",
    label: "Empty state",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["collection", "page", "search"],
    defaults: {
      heading: "Nothing matches those filters",
      body: "Try removing a filter or searching for something else.",
      clearLabel: "Clear all filters",
      showSuggestions: true,
      limit: 4,
    },
    fields: [
      text("heading", "Heading", 120),
      area("body", "Body", 400),
      text("clearLabel", "Clear label", 40),
      bool("showSuggestions", "Show suggested products"),
      num("limit", "Max suggestions"),
    ],
  },

  /* ------------------- Phase 2.5 — cart / checkout / account -------------- */
  {
    type: "cart_lines",
    label: "Cart lines",
    group: "commerce",
    slots: ["main"],
    heading: true,
    templates: ["cart", "checkout"],
    defaults: {
      heading: "Your items",
      removeLabel: "Remove",
      emptyText: "Your cart is empty.",
    },
    fields: [
      text("heading", "Heading"),
      text("removeLabel", "Remove label", 40),
      text("emptyText", "Empty text", 120),
    ],
  },
  {
    type: "cart_drawer",
    label: "Cart drawer",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["page", "collection", "product", "cart"],
    defaults: {
      heading: "Your cart",
      triggerLabel: "Cart",
      removeLabel: "Remove",
      emptyText: "Your cart is empty.",
      totalLabel: "Total",
      subtotalLabel: "Subtotal",
      shippingLabel: "Delivery",
      ctaLabel: "Checkout",
      showCoupon: false,
      showCta: true,
      showFreeShipping: true,
    },
    fields: [
      text("heading", "Drawer title"),
      text("triggerLabel", "Trigger label", 40),
      text("removeLabel", "Remove label", 40),
      text("emptyText", "Empty text", 120),
      text("ctaLabel", "Checkout button label", 40),
      bool("showCoupon", "Show coupon field"),
      bool("showCta", "Show checkout button"),
      bool("showFreeShipping", "Show free shipping progress"),
    ],
  },
  {
    type: "checkout_steps",
    label: "Checkout steps",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["cart", "checkout"],
    defaults: {
      heading: "Checkout progress",
      step1: "Cart",
      step2: "Details",
      step3: "Payment",
      step4: "Confirmation",
      activeStep: 1,
    },
    fields: [
      text("heading", "Accessible label"),
      text("step1", "Step 1 label", 40),
      text("step2", "Step 2 label", 40),
      text("step3", "Step 3 label", 40),
      text("step4", "Step 4 label", 40),
      num("activeStep", "Active step (1-4)"),
    ],
  },
  {
    type: "payment_methods",
    label: "Payment methods",
    group: "commerce",
    slots: ["main"],
    heading: true,
    templates: ["checkout", "cart"],
    defaults: { heading: "Payment method", note: "", emptyText: "No payment method is available right now." },
    fields: [
      text("heading", "Heading"),
      area("note", "Note", 200),
      text("emptyText", "Empty text", 120),
    ],
  },
  {
    type: "order_tracker",
    label: "Order tracker",
    group: "commerce",
    slots: ["main"],
    heading: true,
    templates: ["page"],
    defaults: {
      heading: "Order status",
      step1: "Placed",
      step2: "Confirmed",
      step3: "Shipped",
      step4: "Delivered",
      note: "",
    },
    fields: [
      text("heading", "Heading"),
      text("step1", "Stage 1 label", 40),
      text("step2", "Stage 2 label", 40),
      text("step3", "Stage 3 label", 40),
      text("step4", "Stage 4 label", 40),
      area("note", "Note", 200),
    ],
  },
  {
    type: "free_shipping_bar",
    label: "Free shipping progress",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["cart", "checkout", "collection", "product", "search"],
    defaults: {
      freeShippingLabel: "Spend",
      freeShippingSuffix: "more for free shipping",
      freeShippingDone: "Free shipping unlocked.",
    },
    fields: [
      text("freeShippingLabel", "Prefix", 40),
      text("freeShippingSuffix", "Suffix", 60),
      text("freeShippingDone", "Unlocked text", 80),
    ],
  },

  /* ------------------------------ Phase 2.6 — Atelier (apparel) widgets --- */
  {
    type: "editorial_hero",
    label: "Editorial hero",
    group: "content",
    slots: ["main"],
    heading: true,
    defaults: {
      eyebrow: "",
      heading: "The new season",
      body: "",
      ctaLabel: "Shop the collection",
      ctaHref: "",
      imageUrl: "",
      layout: "stacked",
      scrim: true,
    },
    fields: [
      text("eyebrow", "Eyebrow", 60),
      text("heading", "Heading", 120),
      area("body", "Body", 400),
      text("ctaLabel", "Link label", 40),
      url("ctaHref", "Link URL"),
      url("imageUrl", "Background image"),
      {
        key: "layout",
        label: "Layout",
        kind: "select",
        panel: "style",
        options: [
          { value: "stacked", label: "Stacked" },
          { value: "split", label: "Split" },
        ],
      },
      bool("scrim", "Darken image behind text"),
    ],
  },
  {
    type: "lookbook",
    label: "Lookbook",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Lookbook",
      i1Image: "", i1Alt: "", i1Href: "",
      i2Image: "", i2Alt: "", i2Href: "",
      i3Image: "", i3Alt: "", i3Href: "",
      i4Image: "", i4Alt: "", i4Href: "",
      offset: true,
    },
    fields: [
      text("heading", "Heading", 80),
      url("i1Image", "Image 1"), text("i1Alt", "Image 1 alt", 120), url("i1Href", "Image 1 link"),
      url("i2Image", "Image 2"), text("i2Alt", "Image 2 alt", 120), url("i2Href", "Image 2 link"),
      url("i3Image", "Image 3"), text("i3Alt", "Image 3 alt", 120), url("i3Href", "Image 3 link"),
      url("i4Image", "Image 4"), text("i4Alt", "Image 4 alt", 120), url("i4Href", "Image 4 link"),
      bool("offset", "Offset alignment"),
    ],
  },
  {
    type: "shoppable_image",
    label: "Shoppable image",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Shop the look",
      imageUrl: "",
      altText: "",
      limit: 4,
      collection: "",
      p1x: 25, p1y: 30,
      p2x: 60, p2y: 45,
      p3x: 40, p3y: 70,
      p4x: 75, p4y: 80,
    },
    fields: [
      text("heading", "Heading", 80),
      url("imageUrl", "Image"),
      text("altText", "Image alt", 160),
      num("limit", "Max pins (1-4)"),
      text("collection", "Collection handle", 120),
      num("p1x", "Pin 1 X %"), num("p1y", "Pin 1 Y %"),
      num("p2x", "Pin 2 X %"), num("p2y", "Pin 2 Y %"),
      num("p3x", "Pin 3 X %"), num("p3y", "Pin 3 Y %"),
      num("p4x", "Pin 4 X %"), num("p4y", "Pin 4 Y %"),
    ],
  },
  {
    type: "split_feature",
    label: "Split feature",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      eyebrow: "",
      heading: "Made to last",
      body: "",
      ctaLabel: "",
      ctaHref: "",
      imageUrl: "",
      imageAlt: "",
      flip: false,
    },
    fields: [
      text("eyebrow", "Eyebrow", 60),
      text("heading", "Heading", 120),
      area("body", "Body", 800),
      text("ctaLabel", "Link label", 40),
      url("ctaHref", "Link URL"),
      url("imageUrl", "Image"),
      text("imageAlt", "Image alt", 160),
      bool("flip", "Image on the right"),
    ],
  },
  {
    type: "collection_story",
    label: "Collection story",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      eyebrow: "",
      heading: "The story",
      body: "",
      ctaLabel: "",
      ctaHref: "",
      imageUrl: "",
      scrim: true,
    },
    fields: [
      text("eyebrow", "Eyebrow", 60),
      text("heading", "Heading", 120),
      area("body", "Prose", 1200),
      text("ctaLabel", "Link label", 40),
      url("ctaHref", "Link URL"),
      url("imageUrl", "Background image"),
      bool("scrim", "Darken image behind text"),
    ],
  },
  {
    type: "ugc_gallery",
    label: "Customer gallery",
    group: "commerce",
    slots: ["main", "footer"],
    heading: false,
    defaults: { heading: "As worn by you", limit: 6, collection: "", note: "" },
    fields: [
      text("heading", "Heading", 80),
      num("limit", "Max tiles (2-12)"),
      text("collection", "Collection handle", 120),
      text("note", "Caption", 160),
    ],
  },
  {
    type: "social_strip",
    label: "Social strip",
    group: "engagement",
    slots: ["main", "footer"],
    heading: false,
    defaults: {
      heading: "@yourstore",
      href: "",
      i1Image: "", i2Image: "", i3Image: "", i4Image: "", i5Image: "", i6Image: "",
    },
    fields: [
      text("heading", "Heading", 60),
      url("href", "Profile link"),
      url("i1Image", "Image 1"), url("i2Image", "Image 2"), url("i3Image", "Image 3"),
      url("i4Image", "Image 4"), url("i5Image", "Image 5"), url("i6Image", "Image 6"),
    ],
  },
  {
    type: "store_locator",
    label: "Store locator",
    group: "content",
    slots: ["main", "footer"],
    heading: false,
    defaults: {
      heading: "Visit us",
      s1Name: "", s1Address: "", s1Hours: "", s1Phone: "",
      s2Name: "", s2Address: "", s2Hours: "", s2Phone: "",
      s3Name: "", s3Address: "", s3Hours: "", s3Phone: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("s1Name", "Store 1 name", 80), area("s1Address", "Store 1 address", 300), text("s1Hours", "Store 1 hours", 120), text("s1Phone", "Store 1 phone", 40),
      text("s2Name", "Store 2 name", 80), area("s2Address", "Store 2 address", 300), text("s2Hours", "Store 2 hours", 120), text("s2Phone", "Store 2 phone", 40),
      text("s3Name", "Store 3 name", 80), area("s3Address", "Store 3 address", 300), text("s3Hours", "Store 3 hours", 120), text("s3Phone", "Store 3 phone", 40),
    ],
  },
  {
    type: "size_selector",
    label: "Size selector",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { handle: "", heading: "Size", notifyLabel: "Notify me", guideLabel: "Size guide" },
    fields: [
      text("handle", "Product handle", 120),
      text("heading", "Heading", 60),
      text("notifyLabel", "Out-of-stock action label", 40),
      text("guideLabel", "Size guide link label", 40),
    ],
  },
  {
    type: "size_guide",
    label: "Size guide",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product", "page"],
    defaults: {
      heading: "Size guide",
      openLabel: "Size guide",
      unit: "cm",
      c1Label: "Chest",
      c2Label: "Waist",
      c3Label: "Length",
      r1Label: "S", r1c1: 0, r1c2: 0, r1c3: 0,
      r2Label: "M", r2c1: 0, r2c2: 0, r2c3: 0,
      r3Label: "L", r3c1: 0, r3c2: 0, r3c3: 0,
      r4Label: "XL", r4c1: 0, r4c2: 0, r4c3: 0,
      note: "",
    },
    fields: [
      text("heading", "Drawer title", 60),
      text("openLabel", "Trigger label", 40),
      {
        key: "unit",
        label: "Default unit",
        kind: "select",
        panel: "content",
        options: [
          { value: "cm", label: "Centimetres" },
          { value: "in", label: "Inches" },
        ],
      },
      text("c1Label", "Measurement 1", 40),
      text("c2Label", "Measurement 2", 40),
      text("c3Label", "Measurement 3", 40),
      text("r1Label", "Size 1", 20), num("r1c1", "Size 1 · m1 (cm)"), num("r1c2", "Size 1 · m2 (cm)"), num("r1c3", "Size 1 · m3 (cm)"),
      text("r2Label", "Size 2", 20), num("r2c1", "Size 2 · m1 (cm)"), num("r2c2", "Size 2 · m2 (cm)"), num("r2c3", "Size 2 · m3 (cm)"),
      text("r3Label", "Size 3", 20), num("r3c1", "Size 3 · m1 (cm)"), num("r3c2", "Size 3 · m2 (cm)"), num("r3c3", "Size 3 · m3 (cm)"),
      text("r4Label", "Size 4", 20), num("r4c1", "Size 4 · m1 (cm)"), num("r4c2", "Size 4 · m2 (cm)"), num("r4c3", "Size 4 · m3 (cm)"),
      area("note", "Note", 300),
    ],
  },
  {
    type: "fit_note",
    label: "Fit note",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { fit: "true", note: "", modelHeight: "", modelSize: "" },
    fields: [
      {
        key: "fit",
        label: "Fit",
        kind: "select",
        panel: "content",
        options: [
          { value: "small", label: "Runs small" },
          { value: "true", label: "True to size" },
          { value: "large", label: "Runs large" },
        ],
      },
      text("note", "Note", 200),
      text("modelHeight", "Model height", 40),
      text("modelSize", "Size worn", 40),
    ],
  },
  {
    type: "back_in_stock",
    label: "Back in stock",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: {
      handle: "",
      heading: "Notify me when it's back",
      body: "",
      buttonLabel: "Notify me",
      consentText: "",
    },
    fields: [
      text("handle", "Product handle", 120),
      text("heading", "Heading", 80),
      area("body", "Body", 300),
      text("buttonLabel", "Button label", 40),
      text("consentText", "Consent line", 200),
    ],
  },
  {
    type: "care_panel",
    label: "Material & care",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product", "page"],
    defaults: {
      heading: "Material & care",
      composition: "",
      care: "",
      origin: "",
      open: false,
    },
    fields: [
      text("heading", "Heading", 60),
      area("composition", "Composition", 300),
      area("care", "Care instructions", 400),
      text("origin", "Made in", 80),
      bool("open", "Start open"),
    ],
  },
  {
    type: "sustain_badge",
    label: "Sustainability claims",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "",
      c1Label: "", c1Source: "",
      c2Label: "", c2Source: "",
      c3Label: "", c3Source: "",
    },
    fields: [
      text("heading", "Heading", 60),
      text("c1Label", "Claim 1", 60), text("c1Source", "Claim 1 source", 200),
      text("c2Label", "Claim 2", 60), text("c2Source", "Claim 2 source", 200),
      text("c3Label", "Claim 3", 60), text("c3Source", "Claim 3 source", 200),
    ],
  },
  {
    type: "complete_the_look",
    label: "Complete the look",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: { heading: "Complete the look", limit: 4, collection: "", buttonLabel: "Add all" },
    fields: [
      text("heading", "Heading", 80),
      num("limit", "Max items (2-6)"),
      text("collection", "Collection handle", 120),
      text("buttonLabel", "Add-all label", 40),
    ],
  },
  {
    type: "wishlist_button",
    label: "Wishlist button",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: { productId: "", addLabel: "Save", savedLabel: "Saved", showCount: false },
    fields: [
      text("productId", "Product id", 120),
      text("addLabel", "Label", 40),
      text("savedLabel", "Saved label", 40),
      bool("showCount", "Show saved count"),
    ],
  },

  /* ------------------------------ Phase 2.7 — Circuit (electronics) ------ */

  {
    type: "spec_highlights",
    label: "Spec highlights",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "At a glance",
      columns: 4,
      t1Label: "Chipset", t1Value: "",
      t2Label: "Memory", t2Value: "",
      t3Label: "Battery", t3Value: "",
      t4Label: "Warranty", t4Value: "",
      t5Label: "", t5Value: "",
      t6Label: "", t6Value: "",
    },
    fields: [
      text("heading", "Heading", 80),
      cols("columns", "Tiles per row (2-6)"),
      text("t1Label", "Tile 1 label", 40), text("t1Value", "Tile 1 value", 60),
      text("t2Label", "Tile 2 label", 40), text("t2Value", "Tile 2 value", 60),
      text("t3Label", "Tile 3 label", 40), text("t3Value", "Tile 3 value", 60),
      text("t4Label", "Tile 4 label", 40), text("t4Value", "Tile 4 value", 60),
      text("t5Label", "Tile 5 label", 40), text("t5Value", "Tile 5 value", 60),
      text("t6Label", "Tile 6 label", 40), text("t6Value", "Tile 6 value", 60),
    ],
  },
  {
    // Reads the shared `compare` channel slot, which already caps at 4 SKUs
    // and survives navigation.
    type: "compare_tray",
    label: "Compare tray",
    group: "commerce",
    slots: ["footer", "main"],
    heading: false,
    defaults: {
      heading: "Compare",
      compareLabel: "Compare now",
      clearLabel: "Clear",
      emptyText: "Add products to compare.",
      compareHref: "/compare",
      limit: 8,
    },
    fields: [
      text("heading", "Heading", 60),
      text("compareLabel", "Compare button", 40),
      text("clearLabel", "Clear button", 40),
      text("emptyText", "Empty message", 120),
      url("compareHref", "Compare page link"),
      num("limit", "Rows to resolve (4-24)"),
    ],
  },
  {
    type: "warranty_panel",
    label: "Warranty panel",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Warranty",
      months: 12,
      coverage: "Manufacturer warranty against defects.",
      official: true,
      officialLabel: "Official import",
      parallelLabel: "Parallel import",
      s1Name: "", s1Address: "",
      s2Name: "", s2Address: "",
      s3Name: "", s3Address: "",
    },
    fields: [
      text("heading", "Heading", 60),
      num("months", "Warranty months (0-120)"),
      area("coverage", "Coverage", 400),
      bool("official", "Official import"),
      text("officialLabel", "Official label", 40),
      text("parallelLabel", "Parallel label", 40),
      text("s1Name", "Centre 1 name", 80), text("s1Address", "Centre 1 address", 160),
      text("s2Name", "Centre 2 name", 80), text("s2Address", "Centre 2 address", 160),
      text("s3Name", "Centre 3 name", 80), text("s3Address", "Centre 3 address", 160),
    ],
  },
  {
    type: "authenticity_badge",
    label: "Authenticity badge",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      label: "Official product",
      note: "Sourced from the authorised distributor.",
      verified: true,
      source: "",
    },
    fields: [
      text("label", "Badge label", 60),
      text("note", "Source note", 160),
      bool("verified", "Verified"),
      url("source", "Verification link"),
    ],
  },
  {
    // Tenures and per-month figures arrive already computed from the server;
    // the widget only selects and displays.
    type: "emi_calculator",
    label: "EMI calculator",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: {
      heading: "EMI plans",
      handle: "",
      note: "Bank EMI available on selected cards.",
      emptyText: "EMI is not available for this product.",
      perMonthLabel: "per month",
    },
    fields: [
      text("heading", "Heading", 60),
      text("handle", "Product handle", 120),
      text("note", "Note", 200),
      text("emptyText", "Empty message", 160),
      text("perMonthLabel", "Per-month label", 40),
    ],
  },
  {
    type: "price_sparkline",
    label: "Price history",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Price history",
      handle: "",
      summary: "",
      emptyText: "No price history yet.",
      days: 90,
    },
    fields: [
      text("heading", "Heading", 60),
      text("handle", "Product handle", 120),
      text("summary", "Text alternative", 200),
      text("emptyText", "Empty message", 160),
      num("days", "Window in days (7-365)"),
    ],
  },
  {
    type: "bundle_builder",
    label: "Bundle builder",
    group: "commerce",
    slots: ["main"],
    heading: false,
    templates: ["product"],
    defaults: {
      heading: "Build your bundle",
      collection: "",
      limit: 4,
      buttonLabel: "Add bundle",
      note: "Bundle total is confirmed in the cart.",
    },
    fields: [
      text("heading", "Heading", 80),
      text("collection", "Collection handle", 120),
      num("limit", "Max add-ons (2-6)"),
      text("buttonLabel", "Button label", 40),
      text("note", "Note", 200),
    ],
  },
  {
    type: "doc_links",
    label: "Tech documents",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Documents",
      d1Label: "User manual", d1Href: "", d1Meta: "PDF",
      d2Label: "", d2Href: "", d2Meta: "",
      d3Label: "", d3Href: "", d3Meta: "",
      d4Label: "", d4Href: "", d4Meta: "",
    },
    fields: [
      text("heading", "Heading", 60),
      text("d1Label", "Doc 1 label", 60), url("d1Href", "Doc 1 link"), text("d1Meta", "Doc 1 type / size", 40),
      text("d2Label", "Doc 2 label", 60), url("d2Href", "Doc 2 link"), text("d2Meta", "Doc 2 type / size", 40),
      text("d3Label", "Doc 3 label", 60), url("d3Href", "Doc 3 link"), text("d3Meta", "Doc 3 type / size", 40),
      text("d4Label", "Doc 4 label", 60), url("d4Href", "Doc 4 link"), text("d4Meta", "Doc 4 type / size", 40),
    ],
  },
  {
    type: "support_strip",
    label: "Support strip",
    group: "content",
    slots: ["main", "footer"],
    heading: false,
    defaults: {
      heading: "Support",
      t1Title: "Hotline", t1Body: "", t1Href: "",
      t2Title: "WhatsApp", t2Body: "", t2Href: "",
      t3Title: "Service centre", t3Body: "", t3Href: "",
      t4Title: "Returns", t4Body: "", t4Href: "",
    },
    fields: [
      text("heading", "Heading", 60),
      text("t1Title", "Tile 1 title", 40), text("t1Body", "Tile 1 body", 120), url("t1Href", "Tile 1 link"),
      text("t2Title", "Tile 2 title", 40), text("t2Body", "Tile 2 body", 120), url("t2Href", "Tile 2 link"),
      text("t3Title", "Tile 3 title", 40), text("t3Body", "Tile 3 body", 120), url("t3Href", "Tile 3 link"),
      text("t4Title", "Tile 4 title", 40), text("t4Body", "Tile 4 body", 120), url("t4Href", "Tile 4 link"),
    ],
  },
  {
    type: "buying_guide",
    label: "Buying guide",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "How to choose",
      body: "",
      l1Label: "", l1Href: "",
      l2Label: "", l2Href: "",
      l3Label: "", l3Href: "",
      l4Label: "", l4Href: "",
      author: "", authorRole: "", reviewedBy: "", reviewedOn: "",
    },
    fields: [
      text("heading", "Heading", 80),
      area("body", "Body", 600),
      text("l1Label", "Link 1 label", 60), url("l1Href", "Link 1"),
      text("l2Label", "Link 2 label", 60), url("l2Href", "Link 2"),
      text("l3Label", "Link 3 label", 60), url("l3Href", "Link 3"),
      text("l4Label", "Link 4 label", 60), url("l4Href", "Link 4"),
      ...AUTHOR_FIELDS,
    ],
  },
  {
    // The estimate is always server-valued: the form collects, it never prices.
    type: "trade_in",
    label: "Trade-in",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Trade in your old device",
      body: "Tell us what you have and we will send a quote.",
      buttonLabel: "Get a quote",
      pendingText: "We will email your quote shortly.",
      consentText: "",
    },
    fields: [
      text("heading", "Heading", 80),
      area("body", "Body", 400),
      text("buttonLabel", "Button label", 40),
      text("pendingText", "Confirmation text", 200),
      text("consentText", "Consent text", 200),
    ],
  },
  /* ------------------------- Phase 2.8 — Rupaboti (beauty) --------------- */
  {
    // Two questions, then real stocked variants. The finder filters, never invents.
    type: "shade_finder",
    label: "Shade finder",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Find your shade",
      undertonePrompt: "What is your undertone?",
      depthPrompt: "How deep is your skin tone?",
      emptyText: "No shades match yet — try a different answer.",
      handle: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("undertonePrompt", "Undertone question", 120),
      text("depthPrompt", "Depth question", 120),
      text("emptyText", "Empty text", 160),
      text("handle", "Product handle", 120),
    ],
  },
  {
    // Ends in a shareable filter URL, never a dead-end panel.
    type: "skin_quiz",
    label: "Skin quiz",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Skin quiz",
      body: "Four questions for a routine that suits you.",
      typePrompt: "Your skin type?",
      concernPrompt: "Main concern?",
      sensitivityPrompt: "Sensitive skin?",
      finishPrompt: "Preferred finish?",
      resultText: "Here is what we suggest.",
      resultLabel: "Shop my routine",
      resultPath: "/search",
    },
    fields: [
      text("heading", "Heading", 80),
      area("body", "Body", 300),
      text("typePrompt", "Skin type question", 120),
      text("concernPrompt", "Concern question", 120),
      text("sensitivityPrompt", "Sensitivity question", 120),
      text("finishPrompt", "Finish question", 120),
      text("resultText", "Result text", 200),
      text("resultLabel", "Result link label", 40),
      url("resultPath", "Result path"),
    ],
  },
  {
    type: "routine_builder",
    label: "Routine builder",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Build your routine",
      amLabel: "Morning",
      pmLabel: "Night",
      swapLabel: "Swap",
      addAllLabel: "Add routine to cart",
      note: "Totals are confirmed at checkout.",
      limit: 4,
      collection: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("amLabel", "Morning label", 40),
      text("pmLabel", "Night label", 40),
      text("swapLabel", "Swap label", 40),
      text("addAllLabel", "Add-all label", 60),
      text("note", "Note", 200),
      num("limit", "Steps (2-6)"),
      text("collection", "Collection handle", 120),
    ],
  },
  {
    type: "ingredient_list",
    label: "Ingredient list",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Key ingredients",
      i1Name: "", i1Amount: "", i1Gloss: "",
      i2Name: "", i2Amount: "", i2Gloss: "",
      i3Name: "", i3Amount: "", i3Gloss: "",
      i4Name: "", i4Amount: "", i4Gloss: "",
      i5Name: "", i5Amount: "", i5Gloss: "",
      i6Name: "", i6Amount: "", i6Gloss: "",
      inci: "",
      inciLabel: "Full ingredients (INCI)",
      handle: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("i1Name", "Ingredient 1", 80), text("i1Amount", "Amount 1", 20), text("i1Gloss", "Gloss 1", 160),
      text("i2Name", "Ingredient 2", 80), text("i2Amount", "Amount 2", 20), text("i2Gloss", "Gloss 2", 160),
      text("i3Name", "Ingredient 3", 80), text("i3Amount", "Amount 3", 20), text("i3Gloss", "Gloss 3", 160),
      text("i4Name", "Ingredient 4", 80), text("i4Amount", "Amount 4", 20), text("i4Gloss", "Gloss 4", 160),
      text("i5Name", "Ingredient 5", 80), text("i5Amount", "Amount 5", 20), text("i5Gloss", "Gloss 5", 160),
      text("i6Name", "Ingredient 6", 80), text("i6Amount", "Amount 6", 20), text("i6Gloss", "Gloss 6", 160),
      area("inci", "Full INCI list", 2000),
      text("inciLabel", "INCI disclosure label", 60),
      text("handle", "Product handle", 120),
    ],
  },
  {
    type: "ingredient_glossary",
    label: "Ingredient glossary",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Ingredient glossary",
      g1Term: "", g1Body: "",
      g2Term: "", g2Body: "",
      g3Term: "", g3Body: "",
      g4Term: "", g4Body: "",
      g5Term: "", g5Body: "",
      g6Term: "", g6Body: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("g1Term", "Term 1", 60), area("g1Body", "Body 1", 400),
      text("g2Term", "Term 2", 60), area("g2Body", "Body 2", 400),
      text("g3Term", "Term 3", 60), area("g3Body", "Body 3", 400),
      text("g4Term", "Term 4", 60), area("g4Body", "Body 4", 400),
      text("g5Term", "Term 5", 60), area("g5Body", "Body 5", 400),
      text("g6Term", "Term 6", 60), area("g6Body", "Body 6", 400),
    ],
  },
  {
    // A claim without a source is marketing; the source field keeps it honest.
    type: "claim_chips",
    label: "Claim chips",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Tested & certified",
      c1Label: "", c1Source: "",
      c2Label: "", c2Source: "",
      c3Label: "", c3Source: "",
      c4Label: "", c4Source: "",
      c5Label: "", c5Source: "",
      c6Label: "", c6Source: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("c1Label", "Claim 1", 60), text("c1Source", "Source 1", 160),
      text("c2Label", "Claim 2", 60), text("c2Source", "Source 2", 160),
      text("c3Label", "Claim 3", 60), text("c3Source", "Source 3", 160),
      text("c4Label", "Claim 4", 60), text("c4Source", "Source 4", 160),
      text("c5Label", "Claim 5", 60), text("c5Source", "Source 5", 160),
      text("c6Label", "Claim 6", 60), text("c6Source", "Source 6", 160),
    ],
  },
  {
    // The disclaimer is mandatory: no disclaimer, no render.
    type: "before_after",
    label: "Before & after",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Real results",
      beforeImage: "",
      beforeAlt: "",
      beforeLabel: "Before",
      afterImage: "",
      afterAlt: "",
      afterLabel: "After",
      disclaimer: "Individual results vary. Images are unretouched.",
    },
    fields: [
      text("heading", "Heading", 80),
      url("beforeImage", "Before image"),
      text("beforeAlt", "Before alt", 160),
      text("beforeLabel", "Before label", 40),
      url("afterImage", "After image"),
      text("afterAlt", "After alt", 160),
      text("afterLabel", "After label", 40),
      area("disclaimer", "Disclaimer (required)", 300),
    ],
  },
  {
    type: "safety_note",
    label: "Safety note",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Patch test first",
      body: "Apply a small amount to the inner arm and wait 24 hours before full use.",
      howTo: "",
      howToLabel: "How to patch test",
    },
    fields: [
      text("heading", "Heading", 80),
      area("body", "Body", 400),
      area("howTo", "Patch test steps", 800),
      text("howToLabel", "Disclosure label", 60),
    ],
  },
  {
    type: "batch_info",
    label: "Batch & expiry",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Batch & expiry",
      mfgLabel: "Manufactured",
      mfgDate: "",
      expiryLabel: "Best before",
      expiryDate: "",
      batchLabel: "Batch",
      batchCode: "",
      paoMonths: 0,
    },
    fields: [
      text("heading", "Heading", 80),
      text("mfgLabel", "Manufactured label", 40), text("mfgDate", "Manufactured date", 40),
      text("expiryLabel", "Expiry label", 40), text("expiryDate", "Expiry date", 40),
      text("batchLabel", "Batch label", 40), text("batchCode", "Batch code", 40),
      num("paoMonths", "Period after opening (months)"),
    ],
  },
  {
    type: "texture_strip",
    label: "Texture strip",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Texture & finish",
      t1Image: "", t1Label: "", t1Alt: "",
      t2Image: "", t2Label: "", t2Alt: "",
      t3Image: "", t3Label: "", t3Alt: "",
      t4Image: "", t4Label: "", t4Alt: "",
    },
    fields: [
      text("heading", "Heading", 80),
      url("t1Image", "Image 1"), text("t1Label", "Label 1", 60), text("t1Alt", "Alt 1", 160),
      url("t2Image", "Image 2"), text("t2Label", "Label 2", 60), text("t2Alt", "Alt 2", 160),
      url("t3Image", "Image 3"), text("t3Label", "Label 3", 60), text("t3Alt", "Alt 3", 160),
      url("t4Image", "Image 4"), text("t4Label", "Label 4", 60), text("t4Alt", "Alt 4", 160),
    ],
  },
  {
    type: "how_to_use",
    label: "How to use",
    group: "content",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "How to use",
      s1Title: "", s1Body: "",
      s2Title: "", s2Body: "",
      s3Title: "", s3Body: "",
      s4Title: "", s4Body: "",
      s5Title: "", s5Body: "",
      author: "", authorRole: "", reviewedBy: "", reviewedOn: "",
    },
    fields: [
      text("heading", "Heading", 80),
      text("s1Title", "Step 1", 80), area("s1Body", "Step 1 body", 300),
      text("s2Title", "Step 2", 80), area("s2Body", "Step 2 body", 300),
      text("s3Title", "Step 3", 80), area("s3Body", "Step 3 body", 300),
      text("s4Title", "Step 4", 80), area("s4Body", "Step 4 body", 300),
      text("s5Title", "Step 5", 80), area("s5Body", "Step 5 body", 300),
      ...AUTHOR_FIELDS,
    ],
  },
  {
    // Cadence only — the refill price is quoted by the server at add time.
    type: "refill_widget",
    label: "Refill & subscribe",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Refill & save",
      body: "Get a refill delivered on your schedule.",
      c1Label: "Every month", c1Value: "30",
      c2Label: "Every 2 months", c2Value: "60",
      c3Label: "Every 3 months", c3Value: "90",
      buttonLabel: "Subscribe",
      handle: "",
    },
    fields: [
      text("heading", "Heading", 80),
      area("body", "Body", 300),
      text("c1Label", "Cadence 1", 40), text("c1Value", "Cadence 1 days", 8),
      text("c2Label", "Cadence 2", 40), text("c2Value", "Cadence 2 days", 8),
      text("c3Label", "Cadence 3", 40), text("c3Value", "Cadence 3 days", 8),
      text("buttonLabel", "Button label", 40),
      text("handle", "Refill product handle", 120),
    ],
  },
  {
    // Counts items only; the set total is priced by the server.
    type: "gift_builder",
    label: "Gift set builder",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Build a gift set",
      size: 3,
      messageLabel: "Message card",
      buttonLabel: "Add gift set",
      note: "Gift box and total are confirmed at checkout.",
      collection: "",
      limit: 8,
    },
    fields: [
      text("heading", "Heading", 80),
      num("size", "Items in set (2-6)"),
      text("messageLabel", "Message field label", 60),
      text("buttonLabel", "Button label", 40),
      text("note", "Note", 200),
      text("collection", "Collection handle", 120),
      num("limit", "Choices shown"),
    ],
  },
  {
    type: "sample_picker",
    label: "Sample picker",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Pick a free sample",
      thresholdText: "Free sample over",
      collection: "",
      limit: 4,
    },
    fields: [
      text("heading", "Heading", 80),
      text("thresholdText", "Threshold text", 120),
      text("collection", "Samples collection handle", 120),
      num("limit", "Samples shown (1-4)"),
    ],
  },
  {
    // Collects a phone number, so consent is explicit and never pre-checked.
    type: "consult_cta",
    label: "Consult CTA",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      heading: "Talk to a beauty advisor",
      body: "Not sure what suits you? We will help.",
      whatsapp: "",
      whatsappLabel: "WhatsApp",
      phone: "",
      callLabel: "Call us",
      fieldLabel: "Your number",
      buttonLabel: "Book a consult",
      pendingText: "We will call you back.",
      consentText: "",
    },
    fields: [
      text("heading", "Heading", 80),
      area("body", "Body", 300),
      text("whatsapp", "WhatsApp number", 24),
      text("whatsappLabel", "WhatsApp label", 40),
      text("phone", "Phone number", 24),
      text("callLabel", "Call label", 40),
      text("fieldLabel", "Field label", 60),
      text("buttonLabel", "Button label", 40),
      text("pendingText", "Confirmation text", 200),
      text("consentText", "Consent text", 200),
    ],
  },
  {
    // Point value is server-computed; the strip only prints it.
    type: "loyalty_strip",
    label: "Loyalty strip",
    group: "commerce",
    slots: ["main"],
    heading: false,
    defaults: {
      label: "Points on this order",
      handle: "",
    },
    fields: [
      text("label", "Label", 80),
      text("handle", "Product handle", 120),
    ],
  },

  /* ------------------------------------- Phase 7 — layout primitive pack.
   * Elementor-grade basics. Without these a merchant can only assemble
   * pre-baked commerce blocks; with them a shop layout can be built from
   * scratch: a link button, an icon, a lead form, a nav menu, the shop logo
   * and an image carousel. All six are slot-agnostic and template-agnostic. */
  {
    type: "button",
    label: "Button",
    group: "content",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: {
      label: "Shop now",
      href: "",
      variant: "primary",
      size: "md",
      fullWidth: false,
      newTab: false,
      icon: "none",
    },
    fields: [
      text("label", "Button label", 60),
      url("href", "Link"),
      {
        key: "variant",
        label: "Style",
        kind: "select",
        panel: "style",
        options: [
          { value: "primary", label: "Primary" },
          { value: "secondary", label: "Secondary" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Ghost" },
          { value: "link", label: "Text link" },
        ],
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        panel: "style",
        responsive: true,
        options: [
          { value: "sm", label: "Small" },
          { value: "md", label: "Medium" },
          { value: "lg", label: "Large" },
        ],
      },
      {
        key: "icon",
        label: "Icon",
        kind: "select",
        panel: "style",
        options: [
          { value: "none", label: "None" },
          { value: "arrow", label: "Arrow" },
          { value: "cart", label: "Cart" },
          { value: "search", label: "Search" },
          { value: "phone", label: "Phone" },
          { value: "check", label: "Check" },
        ],
      },
      bool("fullWidth", "Full width"),
      bool("newTab", "Open in a new tab"),
    ],
  },
  {
    type: "icon",
    label: "Icon",
    group: "content",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: { name: "star", size: 32, label: "", href: "", tone: "default" },
    fields: [
      {
        key: "name",
        label: "Icon",
        kind: "select",
        panel: "content",
        options: [
          { value: "star", label: "Star" },
          { value: "cart", label: "Cart" },
          { value: "truck", label: "Delivery" },
          { value: "shield", label: "Shield" },
          { value: "phone", label: "Phone" },
          { value: "mail", label: "Mail" },
          { value: "clock", label: "Clock" },
          { value: "check", label: "Check" },
          { value: "search", label: "Search" },
          { value: "heart", label: "Heart" },
        ],
      },
      text("label", "Caption", 60),
      url("href", "Link"),
      { key: "size", label: "Size in px (16-96)", kind: "number", panel: "style", responsive: true },
      {
        key: "tone",
        label: "Colour",
        kind: "select",
        panel: "style",
        options: [
          { value: "default", label: "Text" },
          { value: "brand", label: "Brand" },
          { value: "muted", label: "Muted" },
        ],
      },
    ],
  },
  {
    type: "form",
    label: "Contact form",
    group: "engagement",
    slots: ["main", "footer"],
    heading: true,
    defaults: {
      heading: "Send us a message",
      body: "",
      nameLabel: "Your name",
      emailLabel: "Email",
      phoneLabel: "Phone",
      messageLabel: "How can we help?",
      buttonLabel: "Send",
      successText: "Thank you — we will reply shortly.",
      consentText: "We only use your details to answer this message.",
      showPhone: true,
    },
    fields: [
      text("heading", "Heading"),
      area("body", "Intro text", 400),
      text("nameLabel", "Name label", 40),
      text("emailLabel", "Email label", 40),
      text("phoneLabel", "Phone label", 40),
      text("messageLabel", "Message label", 60),
      text("buttonLabel", "Button label", 40),
      text("successText", "Thank-you text", 200),
      text("consentText", "Consent text", 200),
      bool("showPhone", "Ask for a phone number"),
    ],
  },
  {
    type: "nav_menu",
    label: "Menu",
    group: "layout",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: {
      heading: "",
      layout: "row",
      align: "left",
      items: [
        { label: "Home", href: "/" },
        { label: "Shop", href: "" },
        { label: "Contact", href: "/contact" },
      ],
    },
    fields: [
      text("heading", "Heading (optional)", 60),
      {
        key: "items",
        label: "Menu links",
        kind: "array",
        panel: "content",
        itemLabel: "label",
        maxRows: 12,
        fields: [text("label", "Label", 40), url("href", "Link")],
      },
      {
        key: "layout",
        label: "Direction",
        kind: "select",
        panel: "layout",
        responsive: true,
        options: [
          { value: "row", label: "Horizontal" },
          { value: "column", label: "Vertical" },
        ],
      },
      ALIGN,
    ],
  },
  {
    type: "logo",
    label: "Logo",
    group: "layout",
    slots: ["header", "main", "footer"],
    heading: false,
    defaults: { image: "", alt: "", text: "", href: "/", height: 40 },
    fields: [
      { key: "image", label: "Logo image", kind: "image", panel: "content" },
      text("alt", "Alt text", 120),
      text("text", "Wordmark (used when no image)", 40),
      url("href", "Link"),
      { key: "height", label: "Height in px (16-120)", kind: "number", panel: "style", responsive: true },
    ],
  },
  {
    type: "carousel",
    label: "Carousel",
    group: "content",
    slots: ["header", "main", "footer"],
    heading: true,
    defaults: {
      heading: "",
      perView: 3,
      showArrows: true,
      slides: [],
    },
    fields: [
      text("heading", "Heading (optional)"),
      {
        key: "slides",
        label: "Slides",
        kind: "array",
        panel: "content",
        itemLabel: "caption",
        maxRows: 12,
        fields: [
          { key: "image", label: "Image", kind: "image", panel: "content" },
          text("alt", "Alt text", 120),
          text("caption", "Caption", 80),
          url("href", "Link"),
        ],
      },
      cols("perView", "Slides in view (1-4)"),
      bool("showArrows", "Show arrows"),
    ],
  },

  /* ------------------------------------------------ Phase 8 — blog pack */
  {
    // The archive listing itself. On a reader route it renders the live
    // articles supplied by the page; in the studio it renders sample cards so
    // a merchant can lay the template out before a post exists.
    type: "blog_archive",
    label: "Blog archive",
    group: "content",
    slots: ["main"],
    templates: ["blog", "page"],
    heading: false,
    defaults: {
      heading: "",
      layout: "grid",
      columns: 3,
      limit: 9,
      showCover: true,
      showExcerpt: true,
      showMeta: true,
      emptyText: "No articles yet.",
    },
    fields: [
      text("heading", "Heading (optional)"),
      {
        key: "layout",
        label: "Layout",
        kind: "select",
        panel: "layout",
        responsive: true,
        options: [
          { value: "grid", label: "Card grid" },
          { value: "list", label: "Stacked list" },
          { value: "magazine", label: "Magazine (lead + rail)" },
          { value: "minimal", label: "Minimal titles" },
        ],
      },
      cols("columns", "Columns (1-4)"),
      num("limit", "Articles shown (1-24)"),
      bool("showCover", "Show cover image"),
      bool("showExcerpt", "Show excerpt"),
      bool("showMeta", "Show author and date"),
      text("emptyText", "Empty state text", 120),
    ],
  },
  {
    type: "blog_terms",
    label: "Blog topics",
    group: "content",
    slots: ["header", "main", "footer"],
    templates: ["blog", "page"],
    heading: false,
    defaults: { heading: "", style: "pills", showCounts: true },
    fields: [
      text("heading", "Heading (optional)"),
      {
        key: "style",
        label: "Style",
        kind: "select",
        panel: "layout",
        options: [
          { value: "pills", label: "Pills" },
          { value: "list", label: "List" },
        ],
      },
      bool("showCounts", "Show article counts"),
    ],
  },
  {
    type: "blog_pager",
    label: "Blog pagination",
    group: "content",
    slots: ["main", "footer"],
    templates: ["blog", "page"],
    heading: false,
    defaults: { align: "center" },
    fields: [
      {
        key: "align",
        label: "Alignment",
        kind: "select",
        panel: "layout",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Centre" },
          { value: "right", label: "Right" },
        ],
      },
    ],
  },
];

/* ------------------------------------------------- Phase 0.4 — style layer */

/**
 * Universal style props every widget inherits. They are **token-only**: each
 * one is a number (clamped) or a select over a fixed vocabulary, so a merchant
 * can never inject a raw colour, font or arbitrary CSS through the inspector.
 * All of them are responsive, i.e. writable per breakpoint bucket.
 */
export const STYLE_FIELDS: Field[] = [
  { key: "padY", label: "Vertical padding (0-160px)", kind: "number", panel: "style", responsive: true },
  { key: "padX", label: "Horizontal padding (0-96px)", kind: "number", panel: "style", responsive: true },
  {
    key: "bg",
    label: "Background",
    kind: "select",
    panel: "style",
    responsive: true,
    options: [
      { value: "none", label: "None" },
      { value: "surface", label: "Surface" },
      { value: "muted", label: "Muted" },
      { value: "brand", label: "Brand" },
      { value: "accent", label: "Accent" },
    ],
  },
  {
    key: "radius",
    label: "Corner radius",
    kind: "select",
    panel: "style",
    options: [
      { value: "none", label: "None" },
      { value: "sm", label: "Small" },
      { value: "md", label: "Medium" },
      { value: "lg", label: "Large" },
    ],
  },
  {
    key: "border",
    label: "Border",
    kind: "select",
    panel: "style",
    options: [
      { value: "none", label: "None" },
      { value: "hairline", label: "Hairline" },
      { value: "strong", label: "Strong" },
    ],
  },
  {
    key: "shadow",
    label: "Shadow",
    kind: "select",
    panel: "style",
    options: [
      { value: "none", label: "None" },
      { value: "sm", label: "Soft" },
      { value: "md", label: "Raised" },
    ],
  },
  {
    key: "maxW",
    label: "Width",
    kind: "select",
    panel: "style",
    responsive: true,
    options: [
      { value: "container", label: "Container" },
      { value: "narrow", label: "Narrow" },
      { value: "full", label: "Full width" },
    ],
  },
  {
    key: "align",
    label: "Alignment",
    kind: "select",
    panel: "style",
    responsive: true,
    options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Centre" },
      { value: "right", label: "Right" },
    ],
  },
  {
    key: "ratio",
    label: "Aspect ratio",
    kind: "select",
    panel: "style",
    responsive: true,
    options: [
      { value: "auto", label: "Auto" },
      { value: "1-1", label: "1:1" },
      { value: "4-3", label: "4:3" },
      { value: "16-9", label: "16:9" },
    ],
  },
  {
    key: "reveal",
    label: "Reveal on scroll",
    kind: "select",
    panel: "style",
    options: [
      { value: "none", label: "None" },
      { value: "fade", label: "Fade" },
      { value: "rise", label: "Rise" },
    ],
  },
  // Phase 6: every widget declares a column span per breakpoint. 0 = auto,
  // i.e. the widget takes the natural flow width of its slot.
  {
    key: "span",
    label: "Column span (0 = auto, 12 = full)",
    kind: "number",
    panel: "style",
    responsive: true,
  },
];

const STYLE_DEFAULTS: Record<string, PropValue> = {
  padY: 0,
  padX: 0,
  bg: "none",
  radius: "none",
  border: "none",
  shadow: "none",
  maxW: "container",
  align: "left",
  ratio: "auto",
  reveal: "none",
  span: 0,
};


/** Keys owned by the universal style layer. */
export const STYLE_KEYS = STYLE_FIELDS.map((f) => f.key);

/**
 * Every catalogue entry gains the style layer, minus any key it already
 * declares itself (a widget-specific `align` or `maxW` wins, so no widget
 * grows a duplicate control).
 */
function withStyleLayer(entry: CatalogEntry): CatalogEntry {
  const own = new Set(entry.fields.map((f) => f.key));
  const extra = STYLE_FIELDS.filter((f) => !own.has(f.key));
  const defaults = { ...entry.defaults };
  for (const field of extra) defaults[field.key] = STYLE_DEFAULTS[field.key]!;
  return { ...entry, defaults, fields: [...entry.fields, ...extra] };
}

/* ---------------------------------------- Phase 1.1 — bilingual text layer */

/**
 * Which content props are shopper-facing prose and therefore bilingual. Only
 * these gain a `${key}_bn` sibling; machine values (URLs, ISO dates, counts,
 * tokens) stay single-valued on purpose.
 */
export const BITEXT_FIELDS: Partial<Record<SectionType, string[]>> = {
  hero: ["heading", "subheading", "ctaLabel", "s2Heading", "s3Heading"],
  heading: ["text"],
  rich_text: ["heading", "body"],
  image: ["alt", "caption"],
  video: ["title"],
  product_grid: ["heading", "promise"],
  collection_grid: ["heading"],
  banner: ["text"],
  feature_row: ["itemOne", "itemTwo", "itemThree"],
  testimonial: ["quote", "author"],
  faq: ["heading", "q1", "a1", "q2", "a2", "q3", "a3"],
  countdown: ["label"],
  marquee: ["text"],
  newsletter: ["heading", "body", "buttonLabel", "consentText"],
  tabs: ["t1Label", "t1Body", "t2Label", "t2Body", "t3Label", "t3Body"],
  accordion: ["heading", "i1Title", "i1Body", "i2Title", "i2Body", "i3Title", "i3Body"],
  sticky_bar: ["text", "ctaLabel"],
  spec_table: ["caption", "columnLabel", "r1Group", "r1Label", "r1Value", "r2Group", "r2Label", "r2Value", "r3Group", "r3Label", "r3Value", "r4Group", "r4Label", "r4Value", "r5Group", "r5Label", "r5Value", "r6Group", "r6Label", "r6Value"],
  quiz: ["heading", "resultLabel", "q1Label", "q2Label", "q3Label", "consentText"],
  recently_viewed: ["heading"],
  quick_view: ["heading", "buttonLabel"],
  bundle_offer: ["heading", "buttonLabel", "i1Label", "i2Label", "i3Label", "i4Label"],
  announcement_bar: ["m1", "m2", "m3"],
  utility_bar: ["note", "l1Label", "l2Label", "l3Label"],
  trust_bar: ["i1Title", "i1Body", "i2Title", "i2Body", "i3Title", "i3Body", "i4Title", "i4Body"],
  payment_icons: ["heading"],
  notice: ["text"],
  mega_menu: ["label"],
  department_strip: ["heading"],
  footer_sitemap: ["c1Title", "c2Title", "c3Title", "c4Title"],
  search_command: ["placeholder", "buttonLabel"],
  account_cart: ["accountLabel", "cartLabel"],
  // Phase 2.2 merchandising.
  product_rail: ["heading", "promise"],
  deal_card: ["heading", "badgeLabel", "ctaLabel"],
  deal_strip: ["heading", "badgeLabel"],
  sponsored_slot: ["heading"],
  brand_strip: ["heading"],
  brand_rail: ["heading"],
  compare_table: ["caption", "r1Label", "r2Label", "r3Label", "r4Label"],
  rank_list: ["heading"],
  // Phase 2.3 product detail page.
  product_media: ["altText"],
  buy_box: ["label", "note", "promise"],
  variant_picker: ["heading", "axisOneLabel", "axisTwoLabel"],
  delivery_promise: ["heading", "insideLabel", "insideDays", "outsideLabel", "outsideDays", "note"],
  stock_delivery: ["cutOff"],
  rating_summary: ["heading"],
  review_list: ["heading", "emptyText"],
  product_qna: ["heading", "askLabel", "q1", "a1", "q2", "a2", "q3", "a3"],
  seller_card: ["name", "tagline", "policy", "linkLabel"],
  sticky_buy_bar: ["label"],
  // Phase 2.4 collection / search.
  category_header: ["heading", "body", "homeLabel"],
  facet_sidebar: [
    "heading",
    "drawerLabel",
    "clearLabel",
    "categoryLabel",
    "kindLabel",
    "priceLabel",
    "stockLabel",
    "inStockLabel",
  ],
  filter_chips: ["clearLabel", "emptyText"],
  result_toolbar: ["countLabel", "filtersLabel", "sortLabel"],
  pagination: ["moreLabel", "prevLabel", "nextLabel", "pageLabel"],
  empty_state: ["heading", "body", "clearLabel"],
  // Phase 2.5 cart / checkout / account.
  cart_lines: ["heading", "removeLabel", "emptyText"],
  cart_summary: [
    "heading",
    "subtotalLabel",
    "discountLabel",
    "shippingLabel",
    "codLabel",
    "vatLabel",
    "totalLabel",
    "ctaLabel",
    "couponLabel",
    "couponApplyLabel",
    "emptyText",
    "freeShippingLabel",
    "freeShippingSuffix",
    "freeShippingDone",
  ],
  cart_drawer: ["heading", "triggerLabel", "removeLabel", "emptyText", "ctaLabel"],
  checkout_steps: ["heading", "step1", "step2", "step3", "step4"],
  payment_methods: ["heading", "note", "emptyText"],
  order_tracker: ["heading", "step1", "step2", "step3", "step4", "note"],
  free_shipping_bar: ["freeShippingLabel", "freeShippingSuffix", "freeShippingDone"],
  // Phase 2.6 Atelier (apparel).
  editorial_hero: ["eyebrow", "heading", "body", "ctaLabel"],
  lookbook: ["heading", "i1Alt", "i2Alt", "i3Alt", "i4Alt"],
  shoppable_image: ["heading", "altText"],
  split_feature: ["eyebrow", "heading", "body", "ctaLabel", "imageAlt"],
  collection_story: ["eyebrow", "heading", "body", "ctaLabel"],
  ugc_gallery: ["heading", "note"],
  social_strip: ["heading"],
  store_locator: ["heading", "s1Name", "s1Address", "s1Hours", "s2Name", "s2Address", "s2Hours", "s3Name", "s3Address", "s3Hours"],
  size_selector: ["heading", "notifyLabel", "guideLabel"],
  size_guide: ["heading", "openLabel", "c1Label", "c2Label", "c3Label", "note"],
  fit_note: ["note", "modelHeight", "modelSize"],
  back_in_stock: ["heading", "body", "buttonLabel", "consentText"],
  care_panel: ["heading", "composition", "care", "origin"],
  sustain_badge: ["heading", "c1Label", "c1Source", "c2Label", "c2Source", "c3Label", "c3Source"],
  complete_the_look: ["heading", "buttonLabel"],
  wishlist_button: ["addLabel", "savedLabel"],
  // Phase 2.7 Circuit.
  spec_highlights: ["heading", "t1Label", "t1Value", "t2Label", "t2Value", "t3Label", "t3Value", "t4Label", "t4Value", "t5Label", "t5Value", "t6Label", "t6Value"],
  compare_tray: ["heading", "compareLabel", "clearLabel", "emptyText"],
  warranty_panel: ["heading", "coverage", "officialLabel", "parallelLabel", "s1Name", "s1Address", "s2Name", "s2Address", "s3Name", "s3Address"],
  authenticity_badge: ["label", "note"],
  emi_calculator: ["heading", "note", "emptyText", "perMonthLabel"],
  price_sparkline: ["heading", "summary", "emptyText"],
  bundle_builder: ["heading", "buttonLabel", "note"],
  doc_links: ["heading", "d1Label", "d1Meta", "d2Label", "d2Meta", "d3Label", "d3Meta", "d4Label", "d4Meta"],
  support_strip: ["heading", "t1Title", "t1Body", "t2Title", "t2Body", "t3Title", "t3Body", "t4Title", "t4Body"],
  buying_guide: ["heading", "body", "l1Label", "l2Label", "l3Label", "l4Label"],
  trade_in: ["heading", "body", "buttonLabel", "pendingText", "consentText"],
  // Phase 2.8 Rupaboti (beauty).
  shade_finder: ["heading", "undertonePrompt", "depthPrompt", "emptyText"],
  skin_quiz: [
    "heading", "body", "typePrompt", "concernPrompt", "sensitivityPrompt",
    "finishPrompt", "resultText", "resultLabel",
  ],
  routine_builder: ["heading", "amLabel", "pmLabel", "swapLabel", "addAllLabel", "note"],
  ingredient_list: [
    "heading", "inciLabel",
    "i1Gloss", "i2Gloss", "i3Gloss", "i4Gloss", "i5Gloss", "i6Gloss",
  ],
  ingredient_glossary: [
    "heading", "g1Term", "g1Body", "g2Term", "g2Body", "g3Term", "g3Body",
    "g4Term", "g4Body", "g5Term", "g5Body", "g6Term", "g6Body",
  ],
  claim_chips: [
    "heading", "c1Label", "c1Source", "c2Label", "c2Source", "c3Label", "c3Source",
    "c4Label", "c4Source", "c5Label", "c5Source", "c6Label", "c6Source",
  ],
  before_after: ["heading", "beforeAlt", "beforeLabel", "afterAlt", "afterLabel", "disclaimer"],
  safety_note: ["heading", "body", "howTo", "howToLabel"],
  batch_info: ["heading", "mfgLabel", "expiryLabel", "batchLabel"],
  texture_strip: ["heading", "t1Label", "t1Alt", "t2Label", "t2Alt", "t3Label", "t3Alt", "t4Label", "t4Alt"],
  how_to_use: [
    "heading", "s1Title", "s1Body", "s2Title", "s2Body", "s3Title", "s3Body",
    "s4Title", "s4Body", "s5Title", "s5Body",
  ],
  refill_widget: ["heading", "body", "c1Label", "c2Label", "c3Label", "buttonLabel"],
  gift_builder: ["heading", "messageLabel", "buttonLabel", "note"],
  sample_picker: ["heading", "thresholdText"],
  consult_cta: [
    "heading", "body", "whatsappLabel", "callLabel", "fieldLabel",
    "buttonLabel", "pendingText", "consentText",
  ],
  loyalty_strip: ["label"],
  // Phase 7 — layout primitive pack.
  button: ["label"],
  icon: ["label"],
  form: [
    "heading", "body", "nameLabel", "emailLabel", "phoneLabel",
    "messageLabel", "buttonLabel", "successText", "consentText",
  ],
  nav_menu: ["heading"],
  logo: ["alt", "text"],
  carousel: ["heading"],
};

/**
 * Promotes the listed fields to `bitext` and seeds an empty বাংলা sibling in
 * the defaults, so a brand-new node already has both slots and no stored AST
 * needs migrating (a missing `_bn` simply falls back to English at render).
 */
function withBiText(entry: CatalogEntry): CatalogEntry {
  const keys = new Set(BITEXT_FIELDS[entry.type] ?? []);
  if (keys.size === 0) return entry;
  const fields: Field[] = [];
  const defaults = { ...entry.defaults };
  for (const field of entry.fields) {
    if (!keys.has(field.key)) {
      fields.push(field);
      continue;
    }
    fields.push({ ...field, kind: "bitext" });
    // Default copy ships translated where the platform dictionary has it, so a
    // freshly dropped widget is not English-only for বাংলা shoppers.
    const en = entry.defaults[field.key];
    defaults[bnKey(field.key)] = typeof en === "string" ? (PRESET_BN[en] ?? "") : "";
  }
  return { ...entry, defaults, fields };
}

/** Bilingual prop keys declared by a widget type (English side only). */
export function biTextKeysOf(type: SectionType): string[] {
  // Phase 3.3: alt-text siblings are bilingual too, so read the built schema
  // rather than the declaration list.
  const fields = CATALOG.get(type)?.fields;
  if (fields) return fields.filter((field) => field.kind === "bitext").map((field) => field.key);
  return BITEXT_FIELDS[type] ?? [];
}

/**
 * Phase 3.3 — image props.
 *
 * A `url` field that clearly points at a picture becomes an `image` field, and
 * gains two schema siblings so they survive the sanitiser: bilingual alt text
 * and a `sizes` preset for the responsive ladder. Existing stored ASTs need no
 * migration — both siblings default to empty / `full`.
 */
const IMAGE_KEY = /(^|[a-z])(image|img|photo|banner|avatar|logo|cover|thumb|poster)/i;

function looksLikeImage(field: Field): boolean {
  if (field.kind === "image") return true;
  if (field.kind !== "url") return false;
  return IMAGE_KEY.test(field.key) || /image|photo|banner|avatar|logo|cover|thumbnail/i.test(field.label);
}

function withMedia(entry: CatalogEntry): CatalogEntry {
  const fields: Field[] = [];
  const defaults = { ...entry.defaults };
  for (const field of entry.fields) {
    if (!looksLikeImage(field)) {
      fields.push(field);
      continue;
    }
    fields.push({ ...field, kind: "image" });
    const alt = altKey(field.key);
    const sizes = sizesKey(field.key);
    if (!(alt in defaults)) {
      fields.push({ key: alt, label: `${field.label} alt text`, kind: "bitext", max: 200, panel: "content" });
      defaults[alt] = "";
      defaults[bnKey(alt)] = "";
    }
    if (!(sizes in defaults)) {
      fields.push({
        key: sizes,
        label: `${field.label} rendered width`,
        kind: "select",
        panel: "layout",
        options: SIZES_PRESETS.map((preset) => ({ value: preset, label: SIZES_LABEL[preset].en })),
      });
      defaults[sizes] = "full";
    }
  }
  return { ...entry, defaults, fields };
}

/** Image prop keys declared by a widget type. */
export function imageKeysOf(type: SectionType): string[] {
  return (CATALOG.get(type)?.fields ?? []).filter((f) => f.kind === "image").map((f) => f.key);
}

export const SECTION_CATALOG: CatalogEntry[] = BASE_CATALOG.map(withBiText)
  .map(withMedia)
  .map(withStyleLayer);


/* ------------------------------------------- style props → rendered chrome */

const BG_CLASS: Record<string, string> = {
  none: "",
  surface: "bg-card",
  muted: "bg-muted",
  brand: "bg-primary text-primary-foreground",
  accent: "bg-accent text-accent-foreground",
};
const RADIUS_CLASS: Record<string, string> = {
  none: "",
  sm: "rounded-fq-sm",
  md: "rounded-fq-md",
  lg: "rounded-fq-lg",
};
const BORDER_CLASS: Record<string, string> = {
  none: "",
  hairline: "border border-border",
  strong: "border-2 border-border",
};
const SHADOW_CLASS: Record<string, string> = { none: "", sm: "shadow-sm", md: "shadow-md" };
const MAXW_CLASS: Record<string, string> = {
  container: "",
  narrow: "mx-auto max-w-2xl",
  full: "w-full",
};
const ALIGN_CLASS: Record<string, string> = { left: "", center: "text-center", right: "text-right" };
const RATIO_CLASS: Record<string, string> = {
  auto: "",
  "1-1": "aspect-square",
  "4-3": "aspect-[4/3]",
  "16-9": "aspect-video",
};
const REVEAL_CLASS: Record<string, string> = {
  none: "",
  fade: "fq-reveal fq-reveal-fade",
  rise: "fq-reveal fq-reveal-rise",
};

const clamp = (value: PropValue | undefined, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : min;
};

/**
 * Wrapper classes + inline spacing for a node's resolved style props. Pure, so
 * both the storefront renderer and the editor preview share one implementation.
 */
export function sectionStyle(props: Record<string, PropValue>): {
  className: string;
  style: Record<string, string>;
} {
  const pick = (map: Record<string, string>, key: string) => map[String(props[key] ?? "none")] ?? "";
  const className = [
    pick(BG_CLASS, "bg"),
    pick(RADIUS_CLASS, "radius"),
    pick(BORDER_CLASS, "border"),
    pick(SHADOW_CLASS, "shadow"),
    pick(MAXW_CLASS, "maxW"),
    pick(ALIGN_CLASS, "align"),
    pick(RATIO_CLASS, "ratio"),
    pick(REVEAL_CLASS, "reveal"),
    // Phase 6: column span against the platform grid.
    spanClass(props["span"]),
  ]
    .filter(Boolean)
    .join(" ");


  const style: Record<string, string> = {};
  const padY = clamp(props["padY"], 0, 160);
  const padX = clamp(props["padX"], 0, 96);
  if (padY) style["paddingBlock"] = `${padY}px`;
  if (padX) style["paddingInline"] = `${padX}px`;
  return { className, style };
}

const CATALOG = new Map(SECTION_CATALOG.map((entry) => [entry.type, entry]));

export function catalogEntry(type: SectionType) {
  return CATALOG.get(type);
}

export function newSection(type: SectionType): Section {
  const entry = CATALOG.get(type)!;
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    props: { ...entry.defaults },
    ...(entry.container ? { children: [] as Section[] } : {}),
  };
}

/* ------------------------------------------------------------------ tokens */

/** Designed dark counterpart — authored by the merchant, never auto-inverted. */
export type DarkTokens = { brand: string; accent: string; surface: string; ink: string };

export type ThemeTokens = {
  brand: string;
  accent: string;
  surface: string;
  ink: string;
  radius: string;
  fontDisplay: string;
  fontBody: string;
  container: string;
  density: "dense" | "comfortable" | "airy";
  /** Typographic scale ratio applied to display sizes. */
  typeScale: "compact" | "default" | "expressive";
  /** Base spacing unit for section rhythm. */
  spaceUnit: string;
  /** Elevation family. */
  shadow: "none" | "soft" | "lifted";
  /** Entrance motion budget; `none` behaves like prefers-reduced-motion. */
  motion: "none" | "subtle" | "lively";
  /** Numeral system used for money and counters. */
  digits: "latin" | "bengali";
  /** Default storefront language. */
  locale: "en" | "bn";
  /** ৳ or BDT. */
  currencyDisplay: "symbol" | "code";
  /** Theme-level font pairing; sets both faces. `custom` keeps hand-picked ones. */
  fontPairing: FontPairingKey;
  /** Designed dark set. Null means the theme is light-only. */
  dark: DarkTokens | null;
  /** Named global colours and fonts every control can bind to. */
  globals: ThemeGlobals;
};

/** Theme-level font pairings — there are no per-widget font pickers. */
export const FONT_PAIRINGS = {
  "bengali-classic": { display: "Noto Sans Bengali", body: "Noto Sans Bengali" },
  "bengali-modern": { display: "Hind Siliguri", body: "Noto Sans Bengali" },
  "modern-sans": { display: "Inter", body: "Inter" },
  "editorial-mix": { display: "Hind Siliguri", body: "Inter" },
  // Editorial pairings for the Atelier blueprint. Both keep a Bangla-capable
  // body face (or fall back to the Bangla stack declared in styles.css), so a
  // locale switch never lands on a face that cannot render the script.
  "editorial-serif": { display: "Playfair Display", body: "Inter" },
  "editorial-bangla": { display: "Hind Siliguri", body: "Noto Sans Bengali" },
  custom: { display: "Noto Sans Bengali", body: "Noto Sans Bengali" },
} as const;

export type FontPairingKey = keyof typeof FONT_PAIRINGS;

export const DEFAULT_TOKENS: ThemeTokens = {
  brand: "#0F766E",
  accent: "#0D9488",
  surface: "#FFFFFF",
  ink: "#0F172A",
  radius: "8px",
  fontDisplay: "Noto Sans Bengali",
  fontBody: "Noto Sans Bengali",
  container: "1200px",
  density: "comfortable",
  typeScale: "default",
  spaceUnit: "16px",
  shadow: "soft",
  motion: "subtle",
  digits: "latin",
  locale: "en",
  currencyDisplay: "symbol",
  fontPairing: "bengali-classic",
  dark: null,
  globals: DEFAULT_GLOBALS,
};

export const DEFAULT_DARK_TOKENS: DarkTokens = {
  brand: "#2DD4BF",
  accent: "#5EEAD4",
  surface: "#0B1220",
  ink: "#E6EDF5",
};


const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LENGTH = /^\d{1,4}(?:px|rem)$/;
const FONT = /^[\w\s'-]{2,40}$/;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Parses the authored dark set; anything malformed falls back to light-only. */
export function parseDarkTokens(input: unknown): DarkTokens | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const hex = (key: keyof DarkTokens) => {
    const value = raw[key];
    return typeof value === "string" && HEX.test(value) ? value : DEFAULT_DARK_TOKENS[key];
  };
  return { brand: hex("brand"), accent: hex("accent"), surface: hex("surface"), ink: hex("ink") };
}

export function parseTokens(input: unknown): ThemeTokens {
  const raw = (input ?? {}) as Record<string, unknown>;
  const pick = (key: keyof ThemeTokens, test: RegExp) => {
    const value = raw[key];
    return typeof value === "string" && test.test(value) ? value : (DEFAULT_TOKENS[key] as string);
  };
  const density = raw["density"];
  const typeScale = raw["typeScale"];
  return {
    brand: pick("brand", HEX),
    accent: pick("accent", HEX),
    surface: pick("surface", HEX),
    ink: pick("ink", HEX),
    radius: pick("radius", LENGTH),
    fontDisplay: pick("fontDisplay", FONT),
    fontBody: pick("fontBody", FONT),
    container: pick("container", LENGTH),
    density:
      density === "dense" || density === "airy" || density === "comfortable"
        ? density
        : DEFAULT_TOKENS.density,
    typeScale:
      typeScale === "compact" || typeScale === "expressive" || typeScale === "default"
        ? typeScale
        : DEFAULT_TOKENS.typeScale,
    spaceUnit: pick("spaceUnit", LENGTH),
    shadow: oneOf(raw["shadow"], ["none", "soft", "lifted"] as const, DEFAULT_TOKENS.shadow),
    motion: oneOf(raw["motion"], ["none", "subtle", "lively"] as const, DEFAULT_TOKENS.motion),
    digits: oneOf(raw["digits"], ["latin", "bengali"] as const, DEFAULT_TOKENS.digits),
    locale: oneOf(raw["locale"], ["en", "bn"] as const, DEFAULT_TOKENS.locale),
    currencyDisplay: oneOf(
      raw["currencyDisplay"],
      ["symbol", "code"] as const,
      DEFAULT_TOKENS.currencyDisplay,
    ),
    fontPairing: oneOf(
      raw["fontPairing"],
      Object.keys(FONT_PAIRINGS) as FontPairingKey[],
      DEFAULT_TOKENS.fontPairing,
    ),
    dark: parseDarkTokens(raw["dark"]),
    globals: parseGlobals(raw["globals"]),
  };
}

/** Applies a theme-level font pairing to both faces at once. */
export function applyFontPairing(tokens: ThemeTokens, key: FontPairingKey): ThemeTokens {
  if (key === "custom") return { ...tokens, fontPairing: key };
  const pair = FONT_PAIRINGS[key];
  return { ...tokens, fontPairing: key, fontDisplay: pair.display, fontBody: pair.body };
}


/** Relative luminance contrast ratio — surfaced live in the token editor. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const full = hex.length === 4 ? `#${hex.slice(1).split("").map((c) => c + c).join("")}` : hex;
    const channel = (i: number) => {
      const v = parseInt(full.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  if (!HEX.test(a) || !HEX.test(b)) return 0;
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/**
 * Readable ink for a filled surface. Phase 6: a dark theme has a light ink and
 * often a light brand, so "ink or white" left button labels at ~1.9:1. The
 * candidates are the theme's own ink first (brand identity wins when it is
 * legible), then near-white, then near-black; the first that clears AA is
 * used, and if none do the highest-contrast one is.
 */
export function inkOn(background: string, ink: string): string {
  const candidates = [ink, "#FFFFFF", "#0B0B0B"];
  const passing = candidates.find((c) => contrastRatio(background, c) >= 4.5);
  if (passing) return passing;
  return candidates.reduce((best, c) =>
    contrastRatio(background, c) > contrastRatio(background, best) ? c : best,
  );
}

/** Theme tokens as CSS custom properties for the storefront runtime. */
export function tokensToCss(tokens: ThemeTokens): Record<string, string> {
  return {
    // Global styles come first so a token can never shadow a merchant global.
    ...globalsToCss(tokens.globals ?? DEFAULT_GLOBALS),
    "--theme-brand": tokens.brand,
    "--theme-brand-ink": inkOn(tokens.brand, tokens.ink),
    "--theme-accent": tokens.accent,
    "--theme-accent-ink": inkOn(tokens.accent, tokens.ink),
    "--theme-surface": tokens.surface,
    "--theme-ink": tokens.ink,
    // Neutral steps are derived from the theme's own pair so a custom theme
    // never has to define them, and never clashes with the platform palette.
    "--theme-muted": `color-mix(in srgb, ${tokens.ink} 7%, ${tokens.surface})`,
    "--theme-muted-ink": `color-mix(in srgb, ${tokens.ink} 65%, ${tokens.surface})`,
    "--theme-border": `color-mix(in srgb, ${tokens.ink} 16%, ${tokens.surface})`,
    "--theme-radius": tokens.radius,
    "--theme-container": tokens.container,
    "--theme-font-display": `"${tokens.fontDisplay}", system-ui, sans-serif`,
    "--theme-font-body": `"${tokens.fontBody}", system-ui, sans-serif`,
    "--theme-gap": tokens.density === "dense" ? "0.75rem" : tokens.density === "airy" ? "2.5rem" : "1.5rem",
    "--theme-space": tokens.spaceUnit,
    "--theme-type-scale":
      tokens.typeScale === "compact" ? "1.15" : tokens.typeScale === "expressive" ? "1.4" : "1.25",
    "--theme-shadow-sm":
      tokens.shadow === "none"
        ? "none"
        : tokens.shadow === "lifted"
          ? "0 2px 6px rgb(0 0 0 / 0.12)"
          : "0 1px 2px rgb(0 0 0 / 0.06)",
    "--theme-shadow-md":
      tokens.shadow === "none"
        ? "none"
        : tokens.shadow === "lifted"
          ? "0 10px 24px rgb(0 0 0 / 0.16)"
          : "0 2px 8px rgb(0 0 0 / 0.08)",
    "--theme-shadow-lg":
      tokens.shadow === "none"
        ? "none"
        : tokens.shadow === "lifted"
          ? "0 24px 56px rgb(0 0 0 / 0.22)"
          : "0 8px 24px rgb(0 0 0 / 0.12)",
    "--theme-motion-duration":
      tokens.motion === "none" ? "0ms" : tokens.motion === "lively" ? "620ms" : "420ms",
    "--theme-motion-rise": tokens.motion === "none" ? "0px" : tokens.motion === "lively" ? "20px" : "12px",
    "--theme-digits": tokens.digits,
    "--fq-digits": tokens.digits,
    // Phase 2.1 — বাংলা optical size bump, exposed as a theme token so a
    // display face with a taller x-height can dial it back.
    "--fq-bn-scale": tokens.locale === "bn" ? "1.06" : "1.04",
    "--theme-locale": tokens.locale,
    ...(tokens.dark
      ? {
          "--theme-dark-brand": tokens.dark.brand,
          "--theme-dark-brand-ink": inkOn(tokens.dark.brand, tokens.dark.ink),
          "--theme-dark-accent": tokens.dark.accent,
          "--theme-dark-accent-ink": inkOn(tokens.dark.accent, tokens.dark.ink),
          "--theme-dark-surface": tokens.dark.surface,
          "--theme-dark-ink": tokens.dark.ink,
          "--theme-dark-muted": `color-mix(in srgb, ${tokens.dark.ink} 12%, ${tokens.dark.surface})`,
          "--theme-dark-muted-ink": `color-mix(in srgb, ${tokens.dark.ink} 70%, ${tokens.dark.surface})`,
          "--theme-dark-border": `color-mix(in srgb, ${tokens.dark.ink} 22%, ${tokens.dark.surface})`,
        }
      : {}),
  };
}


/* --------------------------------------------------------------- sanitising */

/**
 * Sandbox capability list for merchant-authored theme content:
 * - text / textarea / the `html` widget: plain text only. Tags are removed,
 *   residual angle brackets are neutralised, control characters dropped. No
 *   markup, no scripts, no inline event handlers can survive parsing, and the
 *   renderer prints the value as a text node (never `dangerouslySetInnerHTML`).
 * - url fields: `https:`, `http:`, site-relative, `#`, `mailto:`, `tel:` only.
 *   `javascript:`, `data:`, `vbscript:` and protocol-relative `//host` are
 *   rejected to empty.
 * - embed fields (iframes): must be https and on EMBED_HOSTS; every other host
 *   is rejected, so no arbitrary remote frame can be mounted.
 * Every rejection is counted so the sanitiser is observable, not silent.
 */
let sanitiserRejects = 0;

/** Drain the rejection counter for metrics. Server callers only. */
export function takeSanitiserRejects(): number {
  const n = sanitiserRejects;
  sanitiserRejects = 0;
  return n;
}

/** Widget copy is merchant-authored: strip markup so theme code can never run. */
export function sanitiseText(value: string, max: number): string {
  const cleaned = value
    .replace(/<\s*(script|style)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  if (cleaned !== value) sanitiserRejects += 1;
  return cleaned.slice(0, max);
}

const SAFE_HREF = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i;

/** Hosts allowed inside a theme iframe. Nothing else may be framed. */
export const EMBED_HOSTS = [
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "youtube.com",
  "player.vimeo.com",
] as const;

/** Returns the URL when it is an allowed https embed, otherwise "". */
export function safeEmbedUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") throw new Error("scheme");
    if (!(EMBED_HOSTS as readonly string[]).includes(parsed.hostname)) throw new Error("host");
    return parsed.toString().slice(0, 500);
  } catch {
    sanitiserRejects += 1;
    return "";
  }
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Clamps a numeric prop into the field's declared bounds. */
function clampNumber(field: Field, n: number): number {
  const min = field.min ?? Number.NEGATIVE_INFINITY;
  const max = typeof field.max === "number" ? field.max : Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Phase 3.2: one repeatable row, coerced through the array's row schema. */
function coerceRow(schema: Field[], value: unknown): PropRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const row: PropRow = {};
  for (const sub of schema) {
    if (sub.kind === "array" || sub.kind === "group") continue;
    const coerced = coerceProp(sub, source[sub.key]);
    if (coerced === null || Array.isArray(coerced)) continue;
    row[sub.key] = coerced;
    if (sub.kind === "bitext") {
      const bn = coerceProp({ ...sub, key: bnKey(sub.key) }, source[bnKey(sub.key)]);
      row[bnKey(sub.key)] = bn === null || Array.isArray(bn) ? "" : bn;
    }
  }
  return row;
}

function coerceProp(field: Field, value: unknown): PropValue | null {
  if (field.kind === "array") {
    if (!Array.isArray(value)) return null;
    const schema = field.fields ?? [];
    const cap = Math.min(field.maxRows ?? MAX_ARRAY_ROWS, MAX_ARRAY_ROWS);
    const rows: PropRow[] = [];
    for (const entry of value) {
      if (rows.length >= cap) break;
      const row = coerceRow(schema, entry);
      if (row) rows.push(row);
    }
    return rows;
  }
  if (field.kind === "number" || field.kind === "range" || field.kind === "unit") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return field.kind === "number" && field.min === undefined && field.max === undefined
      ? Math.trunc(n)
      : clampNumber(field, n);
  }
  if (field.kind === "boolean") return value === true || value === "true";
  if (typeof value !== "string") return null;
  if (field.kind === "embed") return safeEmbedUrl(value);
  if (field.kind === "url" || field.kind === "image") {
    const trimmed = value.trim().slice(0, field.max ?? 500);
    if (trimmed === "") return "";
    if (SAFE_HREF.test(trimmed)) return trimmed;
    sanitiserRejects += 1;
    return "";
  }
  if (field.kind === "color") {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    if (HEX_COLOR.test(trimmed)) return trimmed.toLowerCase();
    sanitiserRejects += 1;
    return "";
  }
  if (field.kind === "taxonomy") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "") return "";
    if (!field.source || isTaxonomyValue(field.source, trimmed)) return trimmed;
    return "";
  }
  if (field.kind === "select") {
    const allowed = field.options?.some((o) => o.value === value);
    return allowed ? value : null;
  }
  if (field.kind === "html") {
    // Phase 4: markup survives the parser because it never touches the host
    // document — it is rendered inside a sandboxed iframe. Only the two things
    // that would leak out of that frame are removed here.
    const trimmed = value.slice(0, field.max ?? 8000);
    const safe = trimmed
      .replace(/<\s*script[\s\S]*?(?:<\/\s*script\s*>|$)/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    if (safe !== trimmed) sanitiserRejects += 1;
    return safe;
  }
  return sanitiseText(value, field.max ?? 200);

}

/** Flattens `group` fields so nested schemas still store flat props. */
export function flattenFields(fields: Field[]): Field[] {
  const out: Field[] = [];
  for (const field of fields) {
    if (field.kind === "group") out.push(...flattenFields(field.fields ?? []));
    else out.push(field);
  }
  return out;
}

/** Phase 3.2: shape guard for stored visibility rules. */
export function parseVisibilityRules(value: unknown): VisibilityRule[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: VisibilityRule[] = [];
  for (const raw of value.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const rule = raw as Record<string, unknown>;
    const kind = rule["kind"];
    if (typeof kind !== "string" || !(kind in VISIBILITY_OPS)) continue;
    const ops = VISIBILITY_OPS[kind as VisibilityKind];
    const op = typeof rule["op"] === "string" ? (rule["op"] as string) : "";
    if (!ops.includes(op)) continue;
    const value_ = rule["value"];
    if (typeof value_ === "number" && Number.isFinite(value_)) out.push({ kind: kind as VisibilityKind, op, value: Math.trunc(value_) });
    else if (typeof value_ === "string") out.push({ kind: kind as VisibilityKind, op, value: value_.slice(0, 80) });
  }
  return out.length ? out : undefined;
}

function parseAb(value: unknown): Section["ab"] {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const experiment = typeof raw["experiment"] === "string" ? raw["experiment"].slice(0, 64) : "";
  const variant = typeof raw["variant"] === "string" ? raw["variant"].slice(0, 64) : "";
  if (!experiment || !variant) return undefined;
  return { experiment, variant };
}

/** Walk state for one template parse: node budget shared across the whole tree. */
type ParseCtx = {
  slot: Slot;
  depth: number;
  budget: { left: number };
  /** Cycle guard: the ancestor objects currently on the parse stack. */
  stack: Set<object>;
  /** Every id already emitted for this template — ids must be unique. */
  ids: Set<string>;
};

function parseSection(node: unknown, ctx: ParseCtx): Section | null {
  if (ctx.budget.left <= 0) return null;
  if (!node || typeof node !== "object") return null;
  // A payload can be a graph (shared or self-referencing objects). Nesting the
  // same object inside itself would recurse forever, so it is dropped.
  if (ctx.stack.has(node as object)) return null;
  const raw = node as Partial<Section> & { props?: unknown; children?: unknown };
  if (typeof raw.id !== "string" || raw.id.length > 64) return null;
  // Duplicate ids break selection, data keying and reorder, so later copies get
  // a fresh suffixed id rather than shadowing the first node.
  let id = raw.id;
  if (ctx.ids.has(id)) {
    let n = 2;
    while (ctx.ids.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`.slice(0, 64);
  }
  ctx.ids.add(id);
  const entry = typeof raw.type === "string" ? CATALOG.get(raw.type as SectionType) : undefined;
  if (!entry) {
    // Unknown widget: keep the node so the page renders a placeholder, never a crash.
    if (typeof raw.type !== "string") return null;
    ctx.budget.left -= 1;
    return { id, type: "html", props: {}, invalid: `unknown_widget:${raw.type.slice(0, 40)}` };
  }
  // Slot legality is checked against the slot this subtree lives in, at every depth.
  if (!entry.slots.includes(ctx.slot)) {
    ctx.budget.left -= 1;
    return { id, type: "html", props: {}, invalid: `illegal_slot:${entry.type}` };
  }
  ctx.budget.left -= 1;


  const source = (raw.props && typeof raw.props === "object" ? raw.props : {}) as Record<string, unknown>;
  const props: Record<string, PropValue> = {};
  // Phase 3.2: `group` fields are presentation-only, so their sub-fields are
  // flattened here and keep storing flat props.
  const fields = flattenFields(entry.fields);
  for (const field of fields) {
    const coerced = coerceProp(field, source[field.key]);
    props[field.key] =
      coerced === null ? (entry.defaults[field.key] ?? (field.kind === "array" ? [] : "")) : coerced;
    // Phase 1.1: the বাংলা sibling rides along, sanitised by the same rules.
    if (field.kind === "bitext") {
      const key = bnKey(field.key);
      const bnValue = coerceProp({ ...field, key }, source[key]);
      // Fall back to the widget's translated default only when the English side
      // is also the default; a blanked-out English prop stays blank on both.
      const usedDefault = coerced === null;
      props[key] = bnValue === null ? (usedDefault ? (entry.defaults[key] ?? "") : "") : bnValue;
    }
  }

  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter((b): b is Breakpoint => (BREAKPOINTS as readonly string[]).includes(b as string))
    : undefined;

  // Per-breakpoint overrides are parsed through the same coercion as base props,
  // and only responsive-capable fields are accepted.
  let bp: Section["bp"];
  const rawBp = (raw as { bp?: unknown }).bp;
  if (rawBp && typeof rawBp === "object") {
    for (const device of BREAKPOINTS) {
      const layer = (rawBp as Record<string, unknown>)[device];
      if (!layer || typeof layer !== "object") continue;
      const out: Record<string, PropValue> = {};
      for (const field of fields) {
        if (!field.responsive) continue;
        const value = (layer as Record<string, unknown>)[field.key];
        if (value === undefined) continue;
        const coerced = coerceProp(field, value);
        if (coerced !== null) out[field.key] = coerced;
      }
      if (Object.keys(out).length) {
        bp = bp ?? {};
        bp[device] = out;
      }
    }
  }

  const section: Section = { id, type: entry.type, props };
  if (hidden && hidden.length) section.hidden = hidden;
  if (bp) section.bp = bp;
  // Phase 3.2: conditional visibility + A/B slot travel with the node.
  const when = parseVisibilityRules((raw as { when?: unknown }).when);
  if (when) section.when = when;
  const ab = parseAb((raw as { ab?: unknown }).ab);
  if (ab) section.ab = ab;

  // AST v3: only container entries accept children, and only above the depth cap.
  if (entry.container) {
    const kids = Array.isArray(raw.children) ? raw.children : [];
    if (ctx.depth + 1 < MAX_TREE_DEPTH) {
      const parsed: Section[] = [];
      const stack = new Set(ctx.stack).add(node as object);
      for (const kid of kids) {
        if (ctx.budget.left <= 0) break;
        const child = parseSection(kid, { ...ctx, depth: ctx.depth + 1, stack });
        if (child) parsed.push(child);
      }
      section.children = parsed;
    } else {
      // Too deep to nest further: keep the container, drop the subtree, tell the editor.
      section.children = [];
      if (kids.length) section.invalid = "max_depth";
    }
  }
  return section;
}

/** Depth-first walk of a slot's tree, parents before children. */
export function walkSections(sections: Section[], visit: (section: Section, depth: number) => void, depth = 0): void {
  for (const section of sections) {
    visit(section, depth);
    if (section.children?.length) walkSections(section.children, visit, depth + 1);
  }
}

/** Every node of a slot's tree as a flat list. */
export function flattenSections(sections: Section[]): Section[] {
  const out: Section[] = [];
  walkSections(sections, (section) => out.push(section));
  return out;
}

/** Every node of a whole template as a flat list. */
export function flattenAst(ast: ThemeAst): Section[] {
  return [...flattenSections(ast.header), ...flattenSections(ast.main), ...flattenSections(ast.footer)];
}


/**
 * Effective props for a device.
 *
 * Base props are the desktop-down default, and each narrower layer overrides
 * only the keys it declares — cascading, so a value set on tablet is inherited
 * by mobile unless mobile declares its own. This is the same cascade the
 * inspector reports through `inheritanceOf` and the same one
 * `compileResponsiveCss` emits, so what the merchant sees, what the storefront
 * renders and what the gate measures cannot disagree.
 */
export function resolveProps(section: Section, device?: Breakpoint): Record<string, PropValue> {
  if (!device || !section.bp) return section.props;
  const layers: Breakpoint[] = device === "mobile" ? ["tablet", "mobile"] : device === "tablet" ? ["tablet"] : [];
  let out: Record<string, PropValue> | null = null;
  for (const layer of layers) {
    const bag = section.bp[layer];
    if (!bag) continue;
    out = { ...(out ?? section.props), ...bag };
  }
  return out ?? section.props;
}


/** True when the widget needs data this template cannot provide. */
export function isContextMismatch(type: SectionType, template?: TemplateKey): boolean {
  if (!template) return false;
  const entry = CATALOG.get(type);
  if (!entry?.templates) return false;
  return !entry.templates.includes(template);
}


const MAX_SECTIONS_PER_SLOT = 60;

/** Hard payload ceilings enforced before anything is parsed or stored. */
export const AST_LIMITS = {
  maxSectionsPerSlot: MAX_SECTIONS_PER_SLOT,
  /** Serialised templates + tokens, in characters. */
  maxPayloadChars: 512_000,
  /** Deepest object/array nesting accepted anywhere in a payload. */
  maxDepth: 48,
  /** AST v3: deepest widget nesting, and the whole-template node ceiling. */
  maxTreeDepth: MAX_TREE_DEPTH,
  maxNodesPerTemplate: MAX_NODES_PER_TEMPLATE,
} as const;

function depthOf(value: unknown, depth = 0): number {
  if (depth > AST_LIMITS.maxDepth || value === null || typeof value !== "object") return depth;
  let deepest = depth;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepest = Math.max(deepest, depthOf(child, depth + 1));
    if (deepest > AST_LIMITS.maxDepth) return deepest;
  }
  return deepest;
}

/**
 * Structural gate for untrusted builder payloads: oversized documents and
 * deeply nested trees are rejected before parsing, so a hostile document can
 * never turn into CPU time or storage.
 */
export function assertPayloadWithinLimits(value: unknown): void {
  let json: string;
  try {
    json = JSON.stringify(value) ?? "";
  } catch {
    throw new Error("builder.payload_invalid");
  }
  if (json.length > AST_LIMITS.maxPayloadChars) throw new Error("builder.payload_too_large");
  if (depthOf(value) > AST_LIMITS.maxDepth) throw new Error("builder.payload_too_deep");
}

export function parseAst(input: unknown): ThemeAst {
  const raw = upgradeAstV2ToV3(input) as Partial<Record<Slot, unknown>>;
  // One node budget for the whole template, shared by all three slots.
  const budget = { left: MAX_NODES_PER_TEMPLATE };
  // Ids are unique per template, so the set is shared across the three slots.
  const ids = new Set<string>();
  const slot = (value: unknown, name: Slot): Section[] => {
    if (!Array.isArray(value)) return [];
    const out: Section[] = [];
    for (const node of value.slice(0, MAX_SECTIONS_PER_SLOT)) {
      if (budget.left <= 0) break;
      const parsed = parseSection(node, { slot: name, depth: 0, budget, stack: new Set(), ids });
      if (parsed) out.push(parsed);
    }
    return out;
  };
  return {
    header: slot(raw.header, "header"),
    main: slot(raw.main, "main"),
    footer: slot(raw.footer, "footer"),
  };
}


/**
 * AST v2 → v3 upgrader. Pure: it never mutates the input and always returns a
 * slot-shaped plain object that `parseAst` can consume.
 *
 * v2 documents differ in three ways:
 *  - a flat `sections` array instead of header/main/footer slots,
 *  - containers that stored their subtree under `items` / `sections`,
 *  - no `children` key at all (every node was a leaf).
 * A v3 document passes through unchanged (idempotent).
 */
export function upgradeAstV2ToV3(input: unknown): Record<string, unknown> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const upgradeNode = (node: unknown, stack: Set<object> = new Set()): unknown => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return node;
    // Cycle guard: a self-referencing payload must not recurse forever.
    if (stack.has(node as object)) return undefined;
    const source = node as Record<string, unknown>;
    const kidsRaw = source["children"] ?? source["items"] ?? source["sections"];
    const out: Record<string, unknown> = { ...source };
    delete out["items"];
    delete out["sections"];
    if (Array.isArray(kidsRaw)) {
      const next = new Set(stack).add(node as object);
      out["children"] = kidsRaw.map((kid) => upgradeNode(kid, next)).filter((kid) => kid !== undefined);
    }
    return out;
  };
  const slotOf = (value: unknown): unknown[] =>
    Array.isArray(value) ? value.map((node) => upgradeNode(node)).filter((node) => node !== undefined) : [];
  if (Array.isArray(raw["sections"]) && !raw["main"] && !raw["header"] && !raw["footer"]) {
    // Flat v1/v2 document: everything belonged to the page body.
    return { header: [], main: slotOf(raw["sections"]), footer: [] };
  }
  return { header: slotOf(raw["header"]), main: slotOf(raw["main"]), footer: slotOf(raw["footer"]) };
}

export function parseTemplates(input: unknown): ThemeTemplates {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out: ThemeTemplates = {};
  // Only the known template keys are read; anything else in the payload is
  // dropped rather than carried into storage or the renderer.
  for (const key of TEMPLATE_KEYS) {
    if (raw[key] !== undefined) out[key] = parseAst(raw[key]);
  }
  if (!out.index) out.index = parseAst(raw["ast"] ?? EMPTY_AST);
  return out;
}

export function templateOf(templates: ThemeTemplates, key: TemplateKey): ThemeAst {
  return templates[key] ?? EMPTY_AST;
}

/** Stable content hash used for autosave dedupe and version idempotency. */
export function astDigest(templates: ThemeTemplates, tokens: ThemeTokens): string {
  const json = JSON.stringify({ templates, tokens });
  let h1 = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    h1 ^= json.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0");
}

/** Editor-time lint: accessibility and completeness problems, before publish. */
export type AstIssue = { level: "error" | "warn"; sectionId: string | null; message: string };

/**
 * True when a heading-capable widget was authored with an explicitly blank
 * heading in every language — it renders no title, so it claims no <h1>.
 */
function blankHeading(section: Section): boolean {
  if (!("heading" in section.props)) return false;
  const value = section.props["heading"];
  if (typeof value === "string") return value.trim() === "";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const bag = value as unknown as Record<string, unknown>;
    const parts = ["en", "bn"].map((k) => (typeof bag[k] === "string" ? (bag[k] as string).trim() : ""));
    return parts.every((part) => part === "");
  }
  return false;
}

export function lintTemplate(ast: ThemeAst, template?: TemplateKey): AstIssue[] {
  const issues: AstIssue[] = [];
  const all = flattenAst(ast);
  // Phase 0.1: tree-shape lint. The walker sees parents before children, so
  // nesting, orphan and empty-container problems are caught at any depth.
  const seenIds = new Set<string>();
  for (const slot of SLOTS) {
    walkSections(ast[slot] ?? [], (section) => {
      if (seenIds.has(section.id)) {
        issues.push({ level: "error", sectionId: section.id, message: "Duplicate node id in this template." });
      }
      seenIds.add(section.id);
      const entry = CATALOG.get(section.type);
      const isContainer = Boolean(entry?.container);
      if (!isContainer && section.children?.length) {
        issues.push({
          level: "error",
          sectionId: section.id,
          message: `${entry?.label ?? section.type} cannot hold nested widgets.`,
        });
      }
      if (isContainer && !(section.children?.length ?? 0)) {
        issues.push({ level: "warn", sectionId: section.id, message: "Empty container — add a widget or remove it." });
      }
      if (entry && !entry.slots.includes(slot)) {
        issues.push({
          level: "error",
          sectionId: section.id,
          message: `${entry.label} is not allowed in the ${slot} slot.`,
        });
      }
    });
  }
  const headings = all.filter((s) => !s.invalid && CATALOG.get(s.type)?.heading);
  // Phase 5: the h1 claimant is declared, not inferred. On `ROUTE_H1_TEMPLATES`
  // the route data supplies the heading when no widget claims it, so silence is
  // legal there; everywhere else a template with no claimant has no <h1> at all.
  // More than one claimant stays an error on every template (below).
  if (headings.length === 0 && !routeSuppliesH1(template)) {
    issues.push({ level: "warn", sectionId: null, message: "No primary heading on this template." });
  }
  const required: Partial<Record<TemplateKey, { type: SectionType; message: string }[]>> = {
    product: [
      { type: "price_block", message: "Product template has no price block." },
      { type: "add_to_cart", message: "Product template has no add-to-cart widget." },
    ],
    page: [{ type: "page_content", message: "Page template has no page content widget." }],
    cart: [{ type: "cart_summary", message: "Cart template has no order summary." }],
  };
  for (const rule of required[template!] ?? []) {
    if (!all.some((s) => s.type === rule.type)) {
      issues.push({ level: "warn", sectionId: null, message: rule.message });
    }
  }
  // Phase 7.2: schema is emitted by widgets, so it is validated here — an
  // invalid graph blocks publish instead of silently losing the rich result.
  const emitted = new Map<string, string>();
  for (const section of all) {
    const node = sectionJsonLd(section, { storeName: "Store", url: null });
    if (!node) continue;
    for (const message of jsonLdIssues(node)) {
      issues.push({ level: "error", sectionId: section.id, message: `Structured data — ${message}` });
    }
    const type = String(node["@type"] ?? "");
    // Phase 5: page-level singletons. Two of any of these on one URL is a
    // validation error, not twice the coverage.
    if (JSONLD_SINGLETONS.has(type)) {
      const first = emitted.get(type);
      if (first) {
        issues.push({
          level: "error",
          sectionId: section.id,
          message: `Template emits a second ${type} — only one per page is valid.`,
        });
      } else {
        emitted.set(type, section.id);
      }
    }
  }

  // Phase 7.1: exactly one <h1>, claimed by exactly one widget, and no skipped
  // heading levels — answer engines and screen readers both read the outline.
  const headingLevels: number[] = [];
  const claimants: string[] = [];
  for (const section of all) {
    const entry = CATALOG.get(section.type);
    if (!entry) continue;
    if (section.type === "heading") {
      headingLevels.push(String(section.props["level"] ?? "h2") === "h3" ? 3 : 2);
      continue;
    }
    if (entry.heading) {
      // A claimant whose heading text is deliberately blank renders no title,
      // so it cannot be the page <h1>. This is how a commerce template carries
      // several heading-capable widgets (lines, summary, payment) while still
      // declaring exactly one primary heading.
      if (blankHeading(section)) continue;
      claimants.push(section.id);
      headingLevels.push(1);
    }
  }
  if (claimants.length > 1) {
    for (const id of claimants.slice(1)) {
      issues.push({
        level: "error",
        sectionId: id,
        message: "More than one widget claims the page <h1> — only one may be the primary heading.",
      });
    }
  }
  // "no h1" is already reported above as a route-aware hint, so only the
  // level-skip findings from the shared validator are added here.
  for (const message of headingIssues(headingLevels)) {
    if (/no <h1>|<h1> headings/.test(message)) continue;
    issues.push({ level: "error", sectionId: null, message });
  }

  // Phase 7.4: answer-first blocks must be crawlable text in the document,
  // guides must be attributed, and বাংলা props must actually be বাংলা.
  for (const issue of [
    ...answerBlockIssues(SLOTS.flatMap((slot) => ast[slot] ?? [])),
    ...authorIssues(all),
    ...localeParityIssues(all),
    // Phase 9: content guardrails (scrim, disclaimer, consent, money math).
    ...guardrailIssues(all),
  ]) {
    issues.push(issue);
  }

  for (const section of all) {
    if (section.invalid) {
      issues.push({ level: "error", sectionId: section.id, message: `Unsupported widget (${section.invalid}).` });
      continue;
    }
    if (isContextMismatch(section.type, template)) {
      issues.push({
        level: "error",
        sectionId: section.id,
        message: `${CATALOG.get(section.type)?.label} needs data this template does not provide.`,
      });
    }
    // Phase 0.4: tokens only. A raw colour anywhere in a node's props (base or
    // any breakpoint layer) is a publish-blocking error, never silently kept.
    const layers = [section.props, ...Object.values(section.bp ?? {})];
    const hasRawColour = layers.some((layer) =>
      Object.values(layer ?? {}).some(
        (value) => typeof value === "string" && /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/.test(value),
      ),
    );
    if (hasRawColour) {
      issues.push({
        level: "error",
        sectionId: section.id,
        message: "Raw colour value — use a theme token instead.",
      });
    }
    // Phase 6: fixed widths clip বাংলা (15–30% longer than English) and break
    // the 320px floor, so any hard pixel width in a prop blocks publish.
    if (layers.some((layer) => Object.values(layer ?? {}).some((value) => hasFixedWidth(value)))) {
      issues.push({
        level: "error",
        sectionId: section.id,
        message: "Fixed pixel width — let the widget size itself so বাংলা copy is not clipped.",
      });
    }
    // Phase 6: uppercase is meaningless in Bangla and mangles conjuncts.
    const wantsUppercase = layers.some((layer) =>
      Object.values(layer ?? {}).some(
        (value) => typeof value === "string" && /\buppercase\b|text-transform\s*:\s*uppercase/i.test(value),
      ),
    );
    const hasBangla = Object.entries(section.props).some(
      ([key, value]) => key.endsWith("_bn") && typeof value === "string" && isUppercaseHostile(value),
    );
    if (wantsUppercase && hasBangla) {
      issues.push({
        level: "error",
        sectionId: section.id,
        message: "Uppercase styling on বাংলা copy — remove the transform.",
      });
    }


    if (section.type === "image" && !String(section.props["alt"] ?? "").trim()) {
      issues.push({ level: "error", sectionId: section.id, message: "Image is missing alt text." });
    }
    if (section.type === "video" && !String(section.props["title"] ?? "").trim()) {
      issues.push({ level: "error", sectionId: section.id, message: "Video is missing an accessible title." });
    }
    if (section.type === "countdown" && Number.isNaN(Date.parse(String(section.props["endsAt"] ?? "")))) {
      issues.push({ level: "warn", sectionId: section.id, message: "Countdown has no valid end time." });
    }
    // Phase 1.1: translation coverage. বাংলা-only copy is blocking (an English
    // page would render বাংলা); missing বাংলা is a warning (it falls back).
    for (const key of biTextKeysOf(section.type)) {
      const state = biTextState(readBiText(section.props, key));
      const label = CATALOG.get(section.type)?.fields.find((f) => f.key === key)?.label ?? key;
      if (state === "empty") continue;
      if (!String(section.props[key] ?? "").trim()) {
        issues.push({
          level: "error",
          sectionId: section.id,
          message: `${label}: English copy is missing.`,
        });
      } else if (state === "fallback") {
        issues.push({
          level: "warn",
          sectionId: section.id,
          message: `${label}: no বাংলা translation — English will be shown.`,
        });
      }
    }
  }

  return issues;
}
