/**
 * Phase 14 — widget catalogue.
 *
 * Mirrors free Elementor's element panel: collapsible categories, a search box
 * that matches label *and* keywords, and locked cards for elements that need a
 * connected storefront. Every entry knows its own defaults so "drag in and it
 * already looks right" holds.
 */
import type { NodeSettings, StudioNode } from "./model";
import { uid } from "./model";
import { catalogEntry, type SectionType } from "../builder-ast";

export type WidgetCategory =
  "layout" | "basic" | "general" | "media" | "commerce" | "advanced";

export const CATEGORY_ORDER: WidgetCategory[] = [
  "layout",
  "basic",
  "general",
  "media",
  "commerce",
  "advanced",
];

export const CATEGORY_LABEL: Record<WidgetCategory, string> = {
  layout: "Layout",
  basic: "Basic",
  general: "General",
  media: "Media",
  commerce: "Commerce",
  advanced: "Advanced",
};

export type WidgetDef = {
  key: string;
  label: string;
  category: WidgetCategory;
  /** lucide-react icon name, resolved by the panel. */
  icon: string;
  keywords: string[];
  /** Needs a connected storefront; card renders greyed with a lock. */
  locked?: boolean;
  container?: boolean;
  defaults: NodeSettings;
};

const text = (value: string) => ({ text: value });

/* ------------------------------------------------- P7 key aliases ----
 *
 * Elementor / Woo-flavoured element names resolve onto the canonical
 * SECTION_CATALOG keys. Aliases never merge widget identity: each foreign
 * name keeps its own WIDGETS entry with hand-authored defaults (see the
 * `products` compat cards and the `grid` / `text-editor` primitives
 * below). Loaders and seeders follow an incoming `el` through
 * `resolveStudioKey` so a foreign-named node still reaches the canonical
 * schema. `cart` / `menu-cart` stay unmapped on purpose: a Woo cart page
 * (lines + summary) and a mini-cart drawer share no single canonical
 * target.
 */
export const STUDIO_KEY_ALIASES: Record<string, string> = {
  "text-editor": "rich_text",
  grid: "columns",
  products: "product_grid",
  "product-categories": "collection_grid",
  "add-to-cart": "add_to_cart",
  checkout: "checkout_steps",
  reviews: "review_list",
};

/** Follow STUDIO_KEY_ALIASES; canonical and unknown keys pass through. */
export function resolveStudioKey(key: string): string {
  return STUDIO_KEY_ALIASES[key] ?? key;
}

/* ------------------------------------- P7 generated-defaults gate ----
 *
 * SECTION_CATALOG (`builder-ast`) is the single source for shared-widget
 * defaults: every entry below whose key is a catalog type (minus the
 * intentional divergences in STUDIO_OWNED_DEFAULTS) declares
 * `defaults: catalogDefaults("<key>")` instead of a hand mirror. The
 * "P7 generated-defaults equality" suite pins the verbatim match, so a
 * newly shared key fails loudly until it is generated (or documented
 * here). `icon` / `keywords` / `locked` / `container` stay studio-side:
 * presentation concerns, not defaults facts.
 */
export const STUDIO_OWNED_DEFAULTS: Record<string, string> = {
  container:
    "studio flexbox layout model (layout/direction/contentWidth/padding) vs BASE style layer",
  divider: "Elementor primitive: studio renderer/controls own the schema",
  heading: "Elementor primitive: studio renderer/controls own the schema",
  image: "Elementor primitive: studio renderer/controls own the schema",
  video: "Elementor primitive: studio renderer/controls own the schema",
  testimonial:
    "Elementor primitive: studio text/author/role vs BASE quote/author",
  spacer: "Elementor primitive: studio height vs BASE size",
  html: "Elementor primitive: studio html vs BASE body/markup",
  tabs: "Elementor primitive: studio items rows vs BASE tNLabel/tNBody",
  accordion: "Elementor primitive: studio items rows vs BASE iNTitle/iNBody",
  button:
    "studio default href /products + textAlign; BASE href is empty without textAlign",
  icon: "Elementor primitive: studio renderer/controls own the schema",
  carousel: "Elementor primitive: studio items/gap vs BASE slides/showArrows",
  footer_sitemap:
    "repeater-migration `items` seeded on load; BASE carries scalars only",
  search_command:
    "search-lane closed prop set (bilingual copy inline, no catalog _bn/style props)",
  heritage_story: "studio ctaUrl vs BASE ctaHref (+ BASE-only content keys)",
  editorial_banner: "studio ctaUrl vs BASE ctaHref (+ BASE-only content keys)",
  orders_list: "studio carries _bn twins the BASE entry lacks",
  profile_card: "studio carries _bn twins the BASE entry lacks",
};

/** Verbatim single-source defaults for one catalog-shared widget. */
function catalogDefaults(type: SectionType): NodeSettings {
  const entry = catalogEntry(type);
  if (!entry)
    throw new Error(`studio catalog: no SECTION_CATALOG entry for ${type}`);
  return structuredClone(entry.defaults) as NodeSettings;
}

export const WIDGETS: WidgetDef[] = [
  {
    key: "container",
    label: "Container",
    category: "layout",
    icon: "Square",
    keywords: ["flex", "section", "div", "wrapper"],
    container: true,
    defaults: {
      layout: "flex",
      direction: "column",
      gap: 20,
      contentWidth: "boxed",
      paddingY: 40,
      paddingX: 16,
    },
  },
  {
    key: "grid",
    label: "Grid",
    category: "layout",
    icon: "LayoutGrid",
    keywords: ["columns", "rows", "layout"],
    container: true,
    defaults: {
      layout: "grid",
      columns: 3,
      gap: 20,
      contentWidth: "boxed",
      paddingY: 40,
      paddingX: 16,
    },
  },
  {
    key: "heading",
    label: "Heading",
    category: "basic",
    icon: "Heading",
    keywords: ["title", "h1", "h2", "headline"],
    defaults: {
      text: "Add your heading text",
      level: 2,
      fontSize: 32,
      fontWeight: 700,
      textAlign: "left",
    },
  },
  {
    key: "text",
    label: "Text",
    category: "basic",
    icon: "Type",
    keywords: ["paragraph", "copy", "body"],
    defaults: {
      text: "Write something your customers need to know.",
      fontSize: 16,
      textAlign: "left",
    },
  },
  {
    key: "text-editor",
    label: "Text editor",
    category: "basic",
    icon: "AlignLeft",
    keywords: ["rich", "wysiwyg", "paragraph"],
    defaults: {
      text: "Rich text block. Use the toolbar to format.",
      fontSize: 16,
    },
  },
  {
    key: "image",
    label: "Image",
    category: "basic",
    icon: "Image",
    keywords: ["photo", "picture", "media"],
    defaults: { url: "", alt: "", radius: 12, textAlign: "center", width: 100 },
  },
  {
    key: "video",
    label: "Video",
    category: "media",
    icon: "Video",
    keywords: ["youtube", "vimeo", "embed", "player"],
    defaults: { url: "", title: "Video", ratio: "16:9" },
  },
  {
    key: "button",
    label: "Button",
    category: "basic",
    icon: "MousePointerClick",
    keywords: ["cta", "link", "action"],
    defaults: {
      label: "Shop now",
      href: "/products",
      variant: "primary",
      size: "md",
      textAlign: "left",
    },
  },
  {
    key: "whatsapp_button",
    label: "WhatsApp Button",
    category: "general",
    icon: "Phone",
    keywords: ["whatsapp", "chat", "contact", "support", "message", "call"],
    defaults: catalogDefaults("whatsapp_button"),
  },
  {
    key: "divider",
    label: "Divider",
    category: "basic",
    icon: "Minus",
    keywords: ["hr", "line", "separator"],
    defaults: { style: "solid", weight: 1, width: 100, textAlign: "center" },
  },
  {
    key: "spacer",
    label: "Spacer",
    category: "basic",
    icon: "MoveVertical",
    keywords: ["gap", "space", "margin"],
    defaults: { height: 40 },
  },
  {
    key: "map",
    label: "Google Maps",
    category: "media",
    icon: "MapPin",
    keywords: ["location", "address", "map"],
    defaults: { query: "Dhaka, Bangladesh", zoom: 12, height: 320 },
  },
  {
    key: "icon",
    label: "Icon",
    category: "general",
    icon: "Star",
    keywords: ["symbol", "glyph"],
    defaults: { icon: "Star", size: 40, textAlign: "center", color: "" },
  },
  {
    key: "tabs",
    label: "Tabs",
    category: "general",
    icon: "PanelTop",
    keywords: ["tabbed", "panels"],
    defaults: {
      items: [
        { title: "Tab one", content: "Content for the first tab." },
        { title: "Tab two", content: "Content for the second tab." },
      ],
    },
  },
  {
    key: "accordion",
    label: "Accordion",
    category: "general",
    icon: "Rows3",
    keywords: ["faq", "collapse", "expand"],
    defaults: {
      items: [
        {
          title: "How long is delivery?",
          content: "Inside Dhaka 24–48 hours.",
        },
        { title: "Can I return an item?", content: "Yes, within 7 days." },
      ],
    },
  },
  {
    key: "toggle",
    label: "Toggle",
    category: "general",
    icon: "ChevronsUpDown",
    keywords: ["collapse", "show", "hide"],
    defaults: {
      items: [{ title: "Read more", content: "Extra detail lives here." }],
    },
  },
  {
    key: "image-box",
    label: "Image box",
    category: "general",
    icon: "GalleryVerticalEnd",
    keywords: ["card", "feature", "picture"],
    defaults: {
      url: "",
      title: "Feature title",
      text: "One line about this feature.",
      textAlign: "center",
    },
  },
  {
    key: "icon-box",
    label: "Icon box",
    category: "general",
    icon: "BadgeCheck",
    keywords: ["feature", "benefit", "usp"],
    defaults: {
      icon: "BadgeCheck",
      title: "Free delivery",
      text: "On every order over ৳2,000.",
      textAlign: "center",
    },
  },
  {
    key: "carousel",
    label: "Image carousel",
    category: "media",
    icon: "GalleryHorizontal",
    keywords: ["slider", "gallery", "swipe"],
    defaults: { items: [], perView: 3, gap: 16 },
  },
  {
    key: "gallery",
    label: "Basic gallery",
    category: "media",
    icon: "Images",
    keywords: ["grid", "photos"],
    defaults: { items: [], columns: 3, gap: 12 },
  },
  {
    key: "icon-list",
    label: "Icon list",
    category: "general",
    icon: "List",
    keywords: ["bullets", "checklist", "features"],
    defaults: {
      icon: "Check",
      items: [
        { text: "Cash on delivery" },
        { text: "Free returns" },
        { text: "48h dispatch" },
      ],
    },
  },
  {
    key: "counter",
    label: "Counter",
    category: "general",
    icon: "Hash",
    keywords: ["number", "stat", "metric"],
    defaults: {
      start: 0,
      end: 1200,
      prefix: "",
      suffix: "+",
      title: "Happy customers",
      textAlign: "center",
    },
  },
  {
    key: "progress",
    label: "Progress bar",
    category: "general",
    icon: "Gauge",
    keywords: ["bar", "percent", "skill"],
    defaults: { title: "Order fulfilment", percent: 82, showPercent: true },
  },
  {
    key: "testimonial",
    label: "Testimonial",
    category: "general",
    icon: "Quote",
    keywords: ["review", "quote", "customer"],
    defaults: {
      text: "This store made ordering effortless.",
      author: "Nusrat A.",
      role: "Verified buyer",
      textAlign: "left",
    },
  },
  {
    key: "social",
    label: "Social icons",
    category: "general",
    icon: "Share2",
    keywords: ["facebook", "instagram", "links"],
    defaults: {
      items: [
        { network: "facebook", href: "https://facebook.com" },
        { network: "instagram", href: "https://instagram.com" },
      ],
      textAlign: "left",
    },
  },
  {
    key: "alert",
    label: "Alert",
    category: "general",
    icon: "TriangleAlert",
    keywords: ["notice", "warning", "info"],
    defaults: {
      tone: "info",
      title: "Heads up",
      text: "Delivery may take an extra day during Eid.",
    },
  },
  {
    key: "html",
    label: "HTML",
    category: "advanced",
    icon: "Code",
    keywords: ["embed", "custom", "script"],
    defaults: { html: "<p>Custom markup</p>" },
  },
  {
    key: "app-block",
    label: "App block",
    category: "advanced",
    icon: "Blocks",
    keywords: ["shortcode", "plugin", "widget"],
    defaults: { pluginKey: "", height: 320 },
  },
  {
    key: "anchor",
    label: "Menu anchor",
    category: "advanced",
    icon: "Anchor",
    keywords: ["jump", "scroll", "id"],
    defaults: { anchorId: "section" },
  },
  {
    key: "read-more",
    label: "Read more",
    category: "advanced",
    icon: "TextCursorInput",
    keywords: ["excerpt", "cut", "teaser"],
    defaults: {},
  },
  {
    key: "rating",
    label: "Rating",
    category: "general",
    icon: "Star",
    keywords: ["stars", "score", "review"],
    defaults: { value: 4.5, max: 5, textAlign: "left" },
  },
  {
    key: "text-path",
    label: "Text path",
    category: "advanced",
    icon: "Spline",
    keywords: ["curve", "circle", "svg"],
    defaults: { text: "Handmade in Bangladesh", path: "circle", size: 200 },
  },
  ...(
    [
      ["products", "Products", "ShoppingBag", ["catalogue", "grid", "shop"]],
      [
        "product-categories",
        "Product categories",
        "Tags",
        ["collections", "taxonomy"],
      ],
      ["add-to-cart", "Add to cart", "ShoppingCart", ["buy", "purchase"]],
      ["cart", "Cart", "ShoppingCart", ["basket", "bag"]],
      ["checkout", "Checkout", "CreditCard", ["pay", "order"]],
      ["menu-cart", "Menu cart", "ShoppingBasket", ["mini cart", "header"]],
      ["reviews", "Reviews", "MessageSquareQuote", ["ratings", "feedback"]],
    ] as const
  ).map(([key, label, icon, keywords]) => ({
    key,
    label,
    category: "commerce" as WidgetCategory,
    icon,
    keywords: [...keywords],
    locked: false,
    defaults: { source: "auto", limit: 8, columns: 4 } as NodeSettings,
  })),
  // Ported from the theme engine so page builders get the same storefront
  // vocabulary (flat scalar props mirror the theme defaults exactly).
  {
    key: "faq",
    label: "FAQ",
    category: "general",
    icon: "CircleHelp",
    keywords: ["faq", "questions", "answers", "accordion", "help"],
    defaults: catalogDefaults("faq"),
  },
  {
    key: "marquee",
    label: "Marquee",
    category: "general",
    icon: "Megaphone",
    keywords: ["marquee", "ticker", "scrolling", "announcement"],
    defaults: catalogDefaults("marquee"),
  },
  {
    key: "countdown",
    label: "Countdown",
    category: "general",
    icon: "Timer",
    keywords: ["countdown", "timer", "offer", "deal", "urgency"],
    defaults: catalogDefaults("countdown"),
  },
  {
    key: "banner",
    label: "Banner",
    category: "general",
    icon: "Flag",
    keywords: ["banner", "announcement", "notice", "message"],
    defaults: catalogDefaults("banner"),
  },
  {
    key: "trust_bar",
    label: "Trust bar",
    category: "general",
    icon: "ShieldCheck",
    keywords: ["trust", "badges", "delivery", "returns", "payment"],
    defaults: catalogDefaults("trust_bar"),
  },
  {
    key: "announcement_bar",
    label: "Announcement bar",
    category: "general",
    icon: "BadgeCheck",
    keywords: ["announcement", "rotating", "messages", "header", "promo"],
    defaults: catalogDefaults("announcement_bar"),
  },
  // Heritage + hero batch: flat scalar props mirror the theme defaults, so
  // what merchants author in the theme studio renders identically here.
  {
    key: "heritage_story",
    label: "Heritage story",
    category: "general",
    icon: "Landmark",
    keywords: ["heritage", "story", "craft", "artisan", "about"],
    defaults: {
      image: "",
      headline: "",
      body: "",
      ctaLabel: "",
      ctaUrl: "",
      layout: "image-left",
    },
  },
  {
    key: "editorial_banner",
    label: "Editorial banner",
    category: "general",
    icon: "Newspaper",
    keywords: ["editorial", "banner", "feature", "wide", "cta"],
    defaults: {
      image: "",
      headline: "",
      subhead: "",
      ctaLabel: "",
      ctaUrl: "",
    },
  },
  {
    key: "editorial_hero",
    label: "Editorial hero",
    category: "general",
    icon: "Sparkles",
    keywords: ["hero", "editorial", "season", "collection", "split"],
    defaults: catalogDefaults("editorial_hero"),
  },
  {
    key: "lookbook",
    label: "Lookbook",
    category: "general",
    icon: "Images",
    keywords: ["lookbook", "gallery", "editorial", "fashion", "offset"],
    defaults: catalogDefaults("lookbook"),
  },
  {
    key: "hero",
    label: "Hero",
    category: "general",
    icon: "PanelTop",
    keywords: ["hero", "slides", "welcome", "cta", "banner"],
    defaults: catalogDefaults("hero"),
  },
  {
    key: "textile_showcase",
    label: "Textile showcase",
    category: "general",
    icon: "Shirt",
    keywords: ["textile", "showcase", "fabric", "products", "craft"],
    defaults: catalogDefaults("textile_showcase"),
  },
  {
    key: "department_grid",
    label: "Department grid",
    category: "general",
    icon: "LayoutGrid",
    keywords: ["departments", "categories", "grid", "shop"],
    defaults: catalogDefaults("department_grid"),
  },
  {
    key: "story_trunk",
    label: "Story trunk",
    category: "general",
    icon: "History",
    keywords: ["story", "timeline", "trunk", "history", "years"],
    defaults: catalogDefaults("story_trunk"),
  },
  {
    key: "marquee_strip",
    label: "Marquee strip",
    category: "general",
    icon: "MoveHorizontal",
    keywords: ["marquee", "strip", "ticker", "scrolling"],
    defaults: catalogDefaults("marquee_strip"),
  },
  {
    key: "hero_carousel",
    label: "Hero carousel",
    category: "general",
    icon: "GalleryHorizontal",
    keywords: ["hero", "carousel", "slides", "slider"],
    defaults: catalogDefaults("hero_carousel"),
  },
  {
    key: "testimonial_carousel",
    label: "Testimonial carousel",
    category: "general",
    icon: "MessagesSquare",
    keywords: ["testimonials", "reviews", "carousel", "quotes"],
    defaults: catalogDefaults("testimonial_carousel"),
  },
  {
    key: "feature_row",
    label: "Feature row",
    category: "general",
    icon: "LayoutList",
    keywords: ["features", "benefits", "three", "strip"],
    defaults: catalogDefaults("feature_row"),
  },
  {
    key: "utility_bar",
    label: "Utility bar",
    category: "general",
    icon: "SlidersHorizontal",
    keywords: ["utility", "topbar", "links", "language", "header"],
    defaults: catalogDefaults("utility_bar"),
  },
  {
    key: "footer_sitemap",
    label: "Footer sitemap",
    category: "general",
    icon: "FolderTree",
    keywords: ["footer", "sitemap", "links", "columns"],
    defaults: {
      c1Title: "Shop",
      c1Links: "New in|/, Best sellers|/",
      c2Title: "Help",
      c2Links: "Contact|/, Shipping|/",
      c3Title: "About",
      c3Links: "",
      c4Title: "",
      c4Links: "",
      items: [],
      // De-brand brand zones (builder-ast footer_sitemap fields): empty so a
      // freshly dropped footer renders generic chrome until authored.
      statementHeading: "",
      statementBody: "",
      storyHref: "",
      storyLabel: "",
      newsletterHeading: "",
      newsletterButton: "",
      newsletterConsent: "",
      brandName: "",
      paymentsMarks: "",
      paymentsHeading: "",
      pages: "",
    },
  },
  {
    key: "doc_links",
    label: "Tech documents",
    category: "general",
    icon: "FileText",
    keywords: ["docs", "manual", "pdf", "downloads", "spec"],
    defaults: catalogDefaults("doc_links"),
  },
  {
    key: "claim_chips",
    label: "Claim chips",
    category: "general",
    icon: "Award",
    keywords: ["claims", "certified", "badges", "proof", "chips"],
    defaults: catalogDefaults("claim_chips"),
  },
  {
    key: "texture_strip",
    label: "Texture strip",
    category: "general",
    icon: "Palette",
    keywords: ["texture", "finish", "swatches", "shades", "gallery"],
    defaults: catalogDefaults("texture_strip"),
  },
  {
    key: "split_feature",
    label: "Split feature",
    category: "general",
    icon: "Columns2",
    keywords: ["split", "feature", "image", "text", "two-column"],
    defaults: catalogDefaults("split_feature"),
  },
  {
    key: "notice",
    label: "Notice",
    category: "general",
    icon: "Bell",
    keywords: ["notice", "message", "dismissible", "tone", "banner"],
    defaults: catalogDefaults("notice"),
  },
  {
    key: "empty_state",
    label: "Empty state",
    category: "general",
    icon: "PackageOpen",
    keywords: ["empty", "no results", "filters", "clear", "search"],
    defaults: catalogDefaults("empty_state"),
  },
  {
    key: "breadcrumb",
    label: "Breadcrumb",
    category: "general",
    icon: "ChevronsRight",
    keywords: ["breadcrumb", "trail", "navigation", "home", "path"],
    defaults: catalogDefaults("breadcrumb"),
  },
  {
    key: "brand_strip",
    label: "Brand strip",
    category: "general",
    icon: "Store",
    keywords: ["brands", "strip", "logos", "taxonomy"],
    defaults: catalogDefaults("brand_strip"),
  },
  {
    key: "subbrand_bar",
    label: "Sub-brand bar",
    category: "general",
    icon: "Layers",
    keywords: ["subbrand", "brands", "family", "header", "tagline"],
    defaults: catalogDefaults("subbrand_bar"),
  },
  {
    key: "support_strip",
    label: "Support strip",
    category: "general",
    icon: "LifeBuoy",
    keywords: ["support", "help", "hotline", "contact", "service"],
    defaults: catalogDefaults("support_strip"),
  },
  {
    key: "social_strip",
    label: "Social strip",
    category: "general",
    icon: "AtSign",
    keywords: ["social", "instagram", "gallery", "feed", "photos"],
    defaults: catalogDefaults("social_strip"),
  },
  {
    key: "logo",
    label: "Logo",
    category: "general",
    icon: "Badge",
    keywords: ["logo", "brand", "wordmark", "header", "image"],
    defaults: catalogDefaults("logo"),
  },
  {
    key: "how_to_use",
    label: "How to use",
    category: "general",
    icon: "ListOrdered",
    keywords: ["how to", "steps", "instructions", "usage", "guide"],
    defaults: catalogDefaults("how_to_use"),
  },
  {
    key: "buying_guide",
    label: "Buying guide",
    category: "general",
    icon: "BookOpen",
    keywords: ["buying", "guide", "how to choose", "advice", "links"],
    defaults: catalogDefaults("buying_guide"),
  },
  {
    key: "care_panel",
    label: "Material & care",
    category: "general",
    icon: "Shirt",
    keywords: ["care", "material", "composition", "fabric", "origin"],
    defaults: catalogDefaults("care_panel"),
  },
  {
    key: "safety_note",
    label: "Safety note",
    category: "general",
    icon: "ShieldAlert",
    keywords: ["safety", "patch test", "warning", "caution", "beauty"],
    defaults: catalogDefaults("safety_note"),
  },
  {
    key: "fit_note",
    label: "Fit note",
    category: "general",
    icon: "Ruler",
    keywords: ["fit", "size", "true to size", "model", "apparel"],
    defaults: catalogDefaults("fit_note"),
  },
  {
    key: "authenticity_badge",
    label: "Authenticity badge",
    category: "general",
    icon: "BadgeCheck",
    keywords: ["authentic", "official", "verified", "genuine"],
    defaults: catalogDefaults("authenticity_badge"),
  },
  {
    key: "sustain_badge",
    label: "Sustainability claims",
    category: "general",
    icon: "Leaf",
    keywords: ["sustainability", "eco", "claims", "green"],
    defaults: catalogDefaults("sustain_badge"),
  },
  {
    key: "discount_badge",
    label: "Discount badge",
    category: "general",
    icon: "Percent",
    keywords: ["discount", "sale", "saving", "off", "deal"],
    defaults: catalogDefaults("discount_badge"),
  },
  {
    key: "batch_info",
    label: "Batch & expiry",
    category: "general",
    icon: "Package",
    keywords: ["batch", "expiry", "manufactured", "mfg", "pao"],
    defaults: catalogDefaults("batch_info"),
  },
  {
    key: "delivery_promise",
    label: "Delivery promise",
    category: "general",
    icon: "Truck",
    keywords: ["delivery", "shipping", "promise", "dhaka", "dispatch"],
    defaults: catalogDefaults("delivery_promise"),
  },
  {
    key: "free_shipping_bar",
    label: "Free shipping progress",
    category: "general",
    icon: "Truck",
    keywords: ["free", "shipping", "progress", "cart", "threshold"],
    defaults: catalogDefaults("free_shipping_bar"),
  },
  {
    key: "stock_delivery",
    label: "Stock and dispatch",
    category: "general",
    icon: "Boxes",
    keywords: ["stock", "inventory", "dispatch", "cut-off", "availability"],
    defaults: catalogDefaults("stock_delivery"),
  },
  {
    key: "rank_list",
    label: "Rank list",
    category: "general",
    icon: "Trophy",
    keywords: ["rank", "bestsellers", "top", "list", "numbered"],
    defaults: catalogDefaults("rank_list"),
  },
  {
    key: "seller_card",
    label: "Seller card",
    category: "general",
    icon: "Store",
    keywords: ["seller", "vendor", "store", "merchant"],
    defaults: catalogDefaults("seller_card"),
  },
  {
    key: "category_header",
    label: "Category header",
    category: "general",
    icon: "Folder",
    keywords: ["category", "collection", "header", "banner", "breadcrumb"],
    defaults: catalogDefaults("category_header"),
  },
  {
    key: "collection_story",
    label: "Collection story",
    category: "general",
    icon: "BookOpen",
    keywords: ["collection", "story", "editorial", "about", "banner"],
    defaults: catalogDefaults("collection_story"),
  },
  {
    key: "brand_rail",
    label: "Brand rail",
    category: "general",
    icon: "Tags",
    keywords: ["brand", "rail", "logos", "shop"],
    defaults: catalogDefaults("brand_rail"),
  },
  {
    key: "concern_rail",
    label: "Concern rail",
    category: "general",
    icon: "Sparkles",
    keywords: ["concern", "acne", "skin", "rail", "shop"],
    defaults: catalogDefaults("concern_rail"),
  },
  {
    key: "back_in_stock",
    label: "Back in stock",
    category: "general",
    icon: "Bell",
    keywords: ["back", "stock", "notify", "restock", "email"],
    defaults: catalogDefaults("back_in_stock"),
  },
  {
    key: "price_block",
    label: "Price block",
    category: "general",
    icon: "Tag",
    keywords: ["price", "compare", "product", "cost"],
    defaults: catalogDefaults("price_block"),
  },
  {
    key: "price_sparkline",
    label: "Price history",
    category: "general",
    icon: "TrendingDown",
    keywords: ["price", "history", "sparkline", "chart", "trend"],
    defaults: catalogDefaults("price_sparkline"),
  },
  {
    key: "deal_card",
    label: "Deal card",
    category: "general",
    icon: "BadgePercent",
    keywords: ["deal", "offer", "sale", "promo", "ends"],
    defaults: catalogDefaults("deal_card"),
  },
  {
    key: "deal_strip",
    label: "Deal strip",
    category: "general",
    icon: "Zap",
    keywords: ["deal", "strip", "sale", "savings", "rail"],
    defaults: catalogDefaults("deal_strip"),
  },
  {
    key: "sponsored_slot",
    label: "Sponsored slot",
    category: "general",
    icon: "Megaphone",
    keywords: ["sponsored", "featured", "promoted", "ads"],
    defaults: catalogDefaults("sponsored_slot"),
  },
  {
    key: "subbrand_spotlight",
    label: "Sub-brand spotlight",
    category: "general",
    icon: "Layers",
    keywords: ["sub-brand", "spotlight", "taaga", "house", "brands"],
    defaults: catalogDefaults("subbrand_spotlight"),
  },
  {
    key: "size_guide",
    label: "Size guide",
    category: "general",
    icon: "Ruler",
    keywords: ["size", "guide", "measurements", "fit", "chart"],
    defaults: catalogDefaults("size_guide"),
  },
  {
    key: "routine_builder",
    label: "Routine builder",
    category: "general",
    icon: "CalendarCheck",
    keywords: ["routine", "skincare", "morning", "night", "regimen"],
    defaults: catalogDefaults("routine_builder"),
  },
  {
    key: "sample_picker",
    label: "Sample picker",
    category: "general",
    icon: "Gift",
    keywords: ["sample", "free", "trial", "picker"],
    defaults: catalogDefaults("sample_picker"),
  },
  {
    key: "shade_finder",
    label: "Shade finder",
    category: "general",
    icon: "Palette",
    keywords: ["shade", "foundation", "undertone", "match", "finder"],
    defaults: catalogDefaults("shade_finder"),
  },
  {
    key: "skin_quiz",
    label: "Skin quiz",
    category: "general",
    icon: "ClipboardList",
    keywords: ["skin", "quiz", "concern", "routine", "finder"],
    defaults: catalogDefaults("skin_quiz"),
  },
  {
    key: "quiz",
    label: "Quiz / finder",
    category: "general",
    icon: "CircleHelp",
    keywords: ["quiz", "finder", "flow", "questions", "filter"],
    defaults: catalogDefaults("quiz"),
  },
  {
    key: "consult_cta",
    label: "Consult CTA",
    category: "general",
    icon: "PhoneCall",
    keywords: ["consult", "advisor", "whatsapp", "call", "beauty"],
    defaults: catalogDefaults("consult_cta"),
  },
  {
    key: "gift_builder",
    label: "Gift set builder",
    category: "general",
    icon: "Gift",
    keywords: ["gift", "set", "builder", "box", "bundle"],
    defaults: catalogDefaults("gift_builder"),
  },
  {
    key: "bundle_builder",
    label: "Bundle builder",
    category: "general",
    icon: "PackagePlus",
    keywords: ["bundle", "builder", "combo", "add-ons", "pack"],
    defaults: catalogDefaults("bundle_builder"),
  },
  {
    key: "shoppable_image",
    label: "Shoppable image",
    category: "general",
    icon: "ImagePlus",
    keywords: ["shoppable", "hotspot", "pins", "shop the look"],
    defaults: catalogDefaults("shoppable_image"),
  },
  {
    key: "compare_table",
    label: "Compare table",
    category: "general",
    icon: "Table",
    keywords: ["compare", "table", "versus", "products"],
    defaults: catalogDefaults("compare_table"),
  },
  {
    key: "spec_table",
    label: "Spec table",
    category: "general",
    icon: "Table",
    keywords: ["spec", "specs", "table", "technical", "details"],
    defaults: catalogDefaults("spec_table"),
  },
  {
    key: "spec_highlights",
    label: "Spec highlights",
    category: "general",
    icon: "Zap",
    keywords: ["spec", "highlights", "at a glance", "tiles"],
    defaults: catalogDefaults("spec_highlights"),
  },
  {
    key: "ingredient_glossary",
    label: "Ingredient glossary",
    category: "general",
    icon: "BookOpen",
    keywords: ["ingredient", "glossary", "terms", "dictionary"],
    defaults: catalogDefaults("ingredient_glossary"),
  },
  {
    key: "ingredient_list",
    label: "Ingredient list",
    category: "general",
    icon: "FlaskConical",
    keywords: ["ingredient", "inci", "actives", "formula"],
    defaults: catalogDefaults("ingredient_list"),
  },
  {
    key: "ingredient_rail",
    label: "Ingredient rail",
    category: "general",
    icon: "Tags",
    keywords: ["ingredient", "rail", "shop by", "chips"],
    defaults: catalogDefaults("ingredient_rail"),
  },
  {
    key: "payment_methods",
    label: "Payment methods",
    category: "general",
    icon: "CreditCard",
    keywords: ["payment", "methods", "checkout", "bkash", "cod"],
    defaults: catalogDefaults("payment_methods"),
  },
  {
    key: "payment_icons",
    label: "Payment icons",
    category: "general",
    icon: "Wallet",
    keywords: ["payment", "icons", "marks", "accept", "footer"],
    defaults: catalogDefaults("payment_icons"),
  },
  {
    key: "emi_calculator",
    label: "EMI calculator",
    category: "general",
    icon: "Calculator",
    keywords: ["emi", "instalment", "calculator", "plans", "bank"],
    defaults: catalogDefaults("emi_calculator"),
  },
  {
    key: "order_tracker",
    label: "Order tracker",
    category: "general",
    icon: "Truck",
    keywords: ["order", "tracker", "status", "tracking", "delivery"],
    defaults: catalogDefaults("order_tracker"),
  },
  {
    key: "product_grid",
    label: "Product grid",
    category: "commerce",
    icon: "LayoutGrid",
    keywords: ["products", "grid", "catalogue", "shop"],
    defaults: catalogDefaults("product_grid"),
  },
  {
    key: "product_rail",
    label: "Product rail",
    category: "commerce",
    icon: "GalleryHorizontal",
    keywords: ["products", "rail", "carousel", "trending"],
    defaults: catalogDefaults("product_rail"),
  },
  {
    key: "product_media",
    label: "Product media",
    category: "commerce",
    icon: "Image",
    keywords: ["product", "gallery", "images", "zoom"],
    defaults: catalogDefaults("product_media"),
  },
  {
    key: "product_meta",
    label: "Product details",
    category: "commerce",
    icon: "Info",
    keywords: ["product", "details", "meta", "specs"],
    defaults: catalogDefaults("product_meta"),
  },
  {
    key: "product_qna",
    label: "Questions and answers",
    category: "commerce",
    icon: "MessageSquareQuote",
    keywords: ["qna", "questions", "answers", "product"],
    defaults: catalogDefaults("product_qna"),
  },
  {
    key: "collection_grid",
    label: "Collection grid",
    category: "commerce",
    icon: "Tags",
    keywords: ["collections", "categories", "grid"],
    defaults: catalogDefaults("collection_grid"),
  },
  {
    key: "account_cart",
    label: "Account and cart",
    category: "commerce",
    icon: "User",
    keywords: ["account", "cart", "header", "login"],
    defaults: catalogDefaults("account_cart"),
  },
  {
    key: "cart_drawer",
    label: "Cart drawer",
    category: "commerce",
    icon: "ShoppingBag",
    keywords: ["cart", "drawer", "minicart", "slideover"],
    defaults: catalogDefaults("cart_drawer"),
  },
  {
    key: "cart_lines",
    label: "Cart lines",
    category: "commerce",
    icon: "List",
    keywords: ["cart", "lines", "items"],
    defaults: catalogDefaults("cart_lines"),
  },
  {
    key: "cart_summary",
    label: "Cart summary",
    category: "commerce",
    icon: "Receipt",
    keywords: ["cart", "summary", "total", "checkout"],
    defaults: catalogDefaults("cart_summary"),
  },
  {
    key: "checkout_steps",
    label: "Checkout steps",
    category: "commerce",
    icon: "ListOrdered",
    keywords: ["checkout", "steps", "progress"],
    defaults: catalogDefaults("checkout_steps"),
  },
  {
    key: "search_command",
    label: "Search",
    category: "commerce",
    icon: "Search",
    keywords: ["search", "command", "typeahead", "suggestions"],
    // P7 studio-owned (see STUDIO_OWNED_DEFAULTS): the search lane pins a
    // closed prop set, so these stay hand-authored, not catalog-generated.
    defaults: {
      placeholder: "Search products",
      buttonLabel: "Search",
      limit: 6,
      voiceEnabled: false,
      query: "",
    },
  },
  {
    key: "facet_sidebar",
    label: "Facet sidebar",
    category: "commerce",
    icon: "SlidersHorizontal",
    keywords: ["filters", "facets", "sidebar", "refine"],
    defaults: catalogDefaults("facet_sidebar"),
  },
  {
    key: "pagination",
    label: "Pagination",
    category: "commerce",
    icon: "MoreHorizontal",
    keywords: ["pagination", "pages", "load more"],
    defaults: catalogDefaults("pagination"),
  },
  {
    key: "result_toolbar",
    label: "Result toolbar",
    category: "commerce",
    icon: "ArrowUpDown",
    keywords: ["toolbar", "sort", "count", "results"],
    defaults: catalogDefaults("result_toolbar"),
  },
  {
    key: "blog_archive",
    label: "Blog archive",
    category: "general",
    icon: "Newspaper",
    keywords: ["blog", "archive", "articles", "posts"],
    defaults: catalogDefaults("blog_archive"),
  },
  {
    key: "blog_pager",
    label: "Blog pagination",
    category: "general",
    icon: "MoreHorizontal",
    keywords: ["blog", "pagination", "pages"],
    defaults: catalogDefaults("blog_pager"),
  },
  {
    key: "blog_terms",
    label: "Blog topics",
    category: "general",
    icon: "Tags",
    keywords: ["blog", "topics", "tags", "categories"],
    defaults: catalogDefaults("blog_terms"),
  },
  {
    key: "review_list",
    label: "Review list",
    category: "commerce",
    icon: "Star",
    keywords: ["reviews", "ratings", "feedback"],
    defaults: catalogDefaults("review_list"),
  },
  {
    key: "rating_summary",
    label: "Rating summary",
    category: "commerce",
    icon: "BarChart3",
    keywords: ["rating", "summary", "histogram", "stars"],
    defaults: catalogDefaults("rating_summary"),
  },
  {
    key: "recently_viewed",
    label: "Recently viewed",
    category: "commerce",
    icon: "History",
    keywords: ["recently", "viewed", "history"],
    defaults: catalogDefaults("recently_viewed"),
  },
  {
    key: "wishlist_button",
    label: "Wishlist button",
    category: "commerce",
    icon: "Heart",
    keywords: ["wishlist", "save", "favourite"],
    defaults: catalogDefaults("wishlist_button"),
  },
  {
    key: "compare_tray",
    label: "Compare tray",
    category: "commerce",
    icon: "ArrowLeftRight",
    keywords: ["compare", "tray", "versus"],
    defaults: catalogDefaults("compare_tray"),
  },
  {
    key: "bundle_offer",
    label: "Bundle offer",
    category: "commerce",
    icon: "Gift",
    keywords: ["bundle", "offer", "kit", "total"],
    defaults: catalogDefaults("bundle_offer"),
  },
  {
    key: "add_to_cart",
    label: "Add to cart",
    category: "commerce",
    icon: "ShoppingCart",
    keywords: ["add", "cart", "buy", "purchase", "quantity"],
    defaults: catalogDefaults("add_to_cart"),
  },
  {
    key: "rewards_club",
    label: "Rewards club",
    category: "commerce",
    icon: "Trophy",
    keywords: ["rewards", "loyalty", "points", "tiers", "membership"],
    defaults: catalogDefaults("rewards_club"),
  },
  {
    key: "wedding_shop",
    label: "Wedding shop",
    category: "commerce",
    icon: "Heart",
    keywords: ["wedding", "bridal", "groom", "gifting", "collections"],
    defaults: catalogDefaults("wedding_shop"),
  },
  {
    key: "gift_finder",
    label: "Gift finder",
    category: "commerce",
    icon: "Compass",
    keywords: ["gift", "finder", "occasion", "search", "gifts"],
    defaults: catalogDefaults("gift_finder"),
  },
  {
    key: "rich_text",
    label: "Text block",
    category: "general",
    icon: "FileText",
    keywords: ["text", "paragraph", "copy", "prose", "body"],
    defaults: catalogDefaults("rich_text"),
  },
  {
    key: "form",
    label: "Contact form",
    category: "general",
    icon: "ClipboardList",
    keywords: ["contact", "form", "message", "email", "support"],
    defaults: catalogDefaults("form"),
  },
  {
    key: "nav_menu",
    label: "Menu",
    category: "general",
    icon: "List",
    keywords: ["menu", "nav", "navigation", "links", "header"],
    // Widget→menu binding (Content › Menus). Empty = manual `items`.
    defaults: catalogDefaults("nav_menu"),
  },
  {
    key: "newsletter",
    label: "Newsletter signup",
    category: "general",
    icon: "Mail",
    keywords: ["newsletter", "email", "subscribe", "signup", "footer"],
    defaults: catalogDefaults("newsletter"),
  },
  {
    key: "sticky_bar",
    label: "Sticky bar",
    category: "general",
    icon: "Megaphone",
    keywords: ["sticky", "bar", "announcement", "promo", "cta"],
    defaults: catalogDefaults("sticky_bar"),
  },
  {
    key: "mega_menu",
    label: "Mega menu",
    category: "general",
    icon: "Menu",
    keywords: ["mega", "menu", "navigation", "taxonomy", "header"],
    defaults: catalogDefaults("mega_menu"),
  },
  {
    key: "buy_box",
    label: "Buy box",
    category: "commerce",
    icon: "CreditCard",
    keywords: ["buy", "price", "cart", "product", "purchase"],
    defaults: catalogDefaults("buy_box"),
  },
  {
    key: "variant_picker",
    label: "Variant picker",
    category: "commerce",
    icon: "Palette",
    keywords: ["variant", "option", "size", "colour", "picker", "chip"],
    defaults: catalogDefaults("variant_picker"),
  },
  {
    key: "sticky_buy_bar",
    label: "Sticky buy bar",
    category: "commerce",
    icon: "Zap",
    keywords: ["sticky", "buy", "cart", "quick", "product", "dock"],
    defaults: catalogDefaults("sticky_buy_bar"),
  },
  {
    key: "filter_chips",
    label: "Active filter chips",
    category: "commerce",
    icon: "Filter",
    keywords: ["filter", "chips", "facets", "active", "clear", "collection"],
    defaults: catalogDefaults("filter_chips"),
  },
  {
    key: "size_selector",
    label: "Size selector",
    category: "commerce",
    icon: "Ruler",
    keywords: ["size", "variant", "apparel", "guide", "fit"],
    defaults: catalogDefaults("size_selector"),
  },
  {
    key: "complete_the_look",
    label: "Complete the look",
    category: "commerce",
    icon: "Shirt",
    keywords: ["complete", "look", "bundle", "outfit", "add-all", "product"],
    defaults: catalogDefaults("complete_the_look"),
  },
  {
    key: "circle_categories",
    label: "Circle categories",
    category: "commerce",
    icon: "Store",
    keywords: ["circle", "categories", "collections", "shop by", "round"],
    defaults: catalogDefaults("circle_categories"),
  },
  {
    key: "store_locator",
    label: "Store locator",
    category: "general",
    icon: "MapPin",
    keywords: ["store", "locator", "branches", "address", "hours", "visit"],
    defaults: catalogDefaults("store_locator"),
  },
  {
    key: "ugc_gallery",
    label: "Customer gallery",
    category: "media",
    icon: "Images",
    keywords: ["ugc", "customer", "gallery", "worn", "photos", "community"],
    defaults: catalogDefaults("ugc_gallery"),
  },
  {
    key: "trade_in",
    label: "Trade-in",
    category: "general",
    icon: "ArrowLeftRight",
    keywords: ["trade", "exchange", "old device", "quote", "lead", "form"],
    defaults: catalogDefaults("trade_in"),
  },
  {
    key: "combo_card",
    label: "Combo card",
    category: "general",
    icon: "PackagePlus",
    keywords: ["combo", "pack", "bundle", "kit", "offer", "set"],
    defaults: catalogDefaults("combo_card"),
  },
  {
    key: "loyalty_strip",
    label: "Loyalty strip",
    category: "general",
    icon: "Star",
    keywords: ["loyalty", "points", "rewards", "order", "strip"],
    defaults: catalogDefaults("loyalty_strip"),
  },
  {
    key: "warranty_panel",
    label: "Warranty panel",
    category: "general",
    icon: "ShieldCheck",
    keywords: [
      "warranty",
      "guarantee",
      "service",
      "centre",
      "official",
      "import",
    ],
    defaults: catalogDefaults("warranty_panel"),
  },
  {
    key: "before_after",
    label: "Before & after",
    category: "media",
    icon: "Columns2",
    keywords: ["before", "after", "results", "comparison", "proof", "images"],
    defaults: catalogDefaults("before_after"),
  },
  {
    key: "refill_widget",
    label: "Refill & subscribe",
    category: "commerce",
    icon: "Package",
    keywords: [
      "refill",
      "subscribe",
      "cadence",
      "schedule",
      "repeat",
      "delivery",
    ],
    defaults: catalogDefaults("refill_widget"),
  },
  {
    key: "quick_view",
    label: "Quick view",
    category: "commerce",
    icon: "Search",
    keywords: ["quick", "view", "preview", "overlay", "products", "modal"],
    defaults: catalogDefaults("quick_view"),
  },
  {
    key: "department_strip",
    label: "Department strip",
    category: "general",
    icon: "Tags",
    keywords: [
      "department",
      "strip",
      "chips",
      "categories",
      "rail",
      "taxonomy",
    ],
    defaults: catalogDefaults("department_strip"),
  },
  {
    key: "columns",
    label: "Columns",
    category: "layout",
    icon: "GalleryHorizontal",
    keywords: ["columns", "split", "layout", "section"],
    container: true,
    defaults: catalogDefaults("columns"),
  },
  // Twin-parity contract (REPORT-THEMES §7 item 2): every BASE_CATALOG
  // entry in `builder-ast` (SECTION_CATALOG) must resolve here in
  // WIDGET_BY_KEY so it stays editable in the studio. Defaults mirror the
  // BASE defaults 1:1 — including the `skin` default for skinnable types
  // (first-option convention, see DEFAULT_WIDGET_SKIN) and an empty `_bn`
  // twin for every BITEXT_FIELDS key. Intentional exclusions only:
  // `page_content` (context slot, zero fields) and `plugin_block` (covered
  // by the `app-block` twin). Pinned by `catalog.test.ts` "studio twin
  // parity".
  // Account-template twins: context-gated `orders_list` / `profile_card`
  // (BASE group "commerce", templates ["account"]). Bitext kinds mirror the
  // BASE `bitext` fields; neither type is skinnable, so no `skin` key.
  {
    key: "orders_list",
    label: "Order history",
    category: "commerce",
    icon: "Receipt",
    keywords: ["orders", "history", "account", "purchases", "shopper"],
    defaults: {
      heading: "Your orders",
      heading_bn: "",
      emptyText: "No orders yet.",
      emptyText_bn: "",
    },
  },
  {
    key: "profile_card",
    label: "Shopper profile",
    category: "commerce",
    icon: "User",
    keywords: ["profile", "account", "shopper", "customer", "details"],
    defaults: {
      heading: "Your profile",
      heading_bn: "",
    },
  },
  // Songoskriti heritage gap pack: defaults mirror builder-ast 1:1, with
  // empty বাংলা twins for every theme-authored string.
  {
    key: "finder_row",
    label: "Occasion finder",
    category: "general",
    icon: "Compass",
    keywords: ["occasion", "finder", "eid", "wedding", "gifting", "chips"],
    defaults: catalogDefaults("finder_row"),
  },
  {
    key: "craft_story",
    label: "Craft story",
    category: "general",
    icon: "BookOpen",
    keywords: ["craft", "story", "artisan", "loom", "heritage", "about"],
    defaults: catalogDefaults("craft_story"),
  },
  {
    key: "testimonials",
    label: "Testimonials",
    category: "general",
    icon: "MessagesSquare",
    keywords: ["testimonials", "reviews", "quotes", "carousel", "customers"],
    defaults: catalogDefaults("testimonials"),
  },
  {
    key: "trust_footer",
    label: "Trust footer",
    category: "general",
    icon: "ShieldCheck",
    keywords: ["trust", "badges", "delivery", "returns", "payment", "footer"],
    defaults: catalogDefaults("trust_footer"),
  },
  {
    key: "trust_marquee",
    label: "Trust marquee",
    category: "general",
    icon: "BadgeCheck",
    keywords: [
      "trust",
      "marquee",
      "badges",
      "cod",
      "dispatch",
      "helpline",
      "ticker",
    ],
    defaults: catalogDefaults("trust_marquee"),
  },
  {
    key: "price_buckets",
    label: "Price buckets",
    category: "commerce",
    icon: "Wallet",
    keywords: ["price", "budget", "buckets", "under", "bdt", "tiles"],
    defaults: catalogDefaults("price_buckets"),
  },
  {
    key: "occasion_matrix",
    label: "Occasion matrix",
    category: "general",
    icon: "LayoutGrid",
    keywords: [
      "occasion",
      "matrix",
      "eid",
      "wedding",
      "gifting",
      "collections",
      "grid",
    ],
    defaults: catalogDefaults("occasion_matrix"),
  },
  {
    key: "urgency_rail",
    label: "Urgency rail",
    category: "commerce",
    icon: "Zap",
    keywords: [
      "urgency",
      "rail",
      "sale",
      "discount",
      "stock",
      "bestsellers",
      "products",
    ],
    defaults: catalogDefaults("urgency_rail"),
  },
  {
    key: "rating_stars",
    label: "Rating stars",
    category: "general",
    icon: "Star",
    keywords: ["rating", "stars", "reviews", "aggregate"],
    defaults: catalogDefaults("rating_stars"),
  },
  // Phase 2B — studio twin for the `global_ref` pointer type (builder-ast
  // GLOBAL_REF_ENTRY). Palette decision: VISIBLE in Advanced, mirroring the
  // `app-block` pointer-twin precedent — searchable via "global/shared", but
  // the primary insert path stays the Globals tab/link flow in the builder.
  // The header/footer slot lint (`illegal_slot` in main) remains the guard
  // against misplaced drops. Defaults mirror the BASE content schema 1:1
  // (`ref` only — a pointer carries no bitext/media keys and is not
  // skinnable, so no `skin` or `_bn` keys); style-layer keys stay excluded
  // per the twin-parity contract above.
  {
    key: "global_ref",
    label: "Global block",
    category: "advanced",
    icon: "Layers",
    keywords: [
      "global",
      "shared",
      "synced",
      "reference",
      "block",
      "header",
      "footer",
    ],
    defaults: catalogDefaults("global_ref"),
  },
];

export const WIDGET_BY_KEY: Record<string, WidgetDef> = WIDGETS.reduce<
  Record<string, WidgetDef>
>((acc, widget) => {
  acc[widget.key] = widget;
  return acc;
}, {});

export function widgetLabel(key: string): string {
  return WIDGET_BY_KEY[key]?.label ?? key;
}

export function widgetIcon(key: string): string {
  return WIDGET_BY_KEY[key]?.icon ?? "Square";
}

/** Search across label and keywords; empty query returns everything. */
export function searchWidgets(
  query: string,
  widgets: WidgetDef[] = WIDGETS,
): WidgetDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return widgets;
  return widgets.filter(
    (widget) =>
      widget.label.toLowerCase().includes(q) ||
      widget.key.includes(q) ||
      widget.keywords.some((keyword) => keyword.includes(q)),
  );
}

export function groupWidgets(
  widgets: WidgetDef[],
): { category: WidgetCategory; items: WidgetDef[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: widgets.filter((widget) => widget.category === category),
  })).filter((group) => group.items.length > 0);
}

export function newWidgetNode(key: string): StudioNode {
  const def = WIDGET_BY_KEY[key];
  const node: StudioNode = {
    id: uid(),
    el: key,
    settings: def ? structuredClone(def.defaults) : text("New element"),
  };
  if (def?.container) node.children = [];
  return node;
}
