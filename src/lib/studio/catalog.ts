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

export type WidgetCategory =
  | "layout"
  | "basic"
  | "general"
  | "media"
  | "commerce"
  | "advanced";

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

export const WIDGETS: WidgetDef[] = [
  {
    key: "container",
    label: "Container",
    category: "layout",
    icon: "Square",
    keywords: ["flex", "section", "div", "wrapper"],
    container: true,
    defaults: { layout: "flex", direction: "column", gap: 20, contentWidth: "boxed", paddingY: 40, paddingX: 16 },
  },
  {
    key: "grid",
    label: "Grid",
    category: "layout",
    icon: "LayoutGrid",
    keywords: ["columns", "rows", "layout"],
    container: true,
    defaults: { layout: "grid", columns: 3, gap: 20, contentWidth: "boxed", paddingY: 40, paddingX: 16 },
  },
  {
    key: "heading",
    label: "Heading",
    category: "basic",
    icon: "Heading",
    keywords: ["title", "h1", "h2", "headline"],
    defaults: { text: "Add your heading text", level: 2, fontSize: 32, fontWeight: 700, textAlign: "left" },
  },
  {
    key: "text",
    label: "Text",
    category: "basic",
    icon: "Type",
    keywords: ["paragraph", "copy", "body"],
    defaults: { text: "Write something your customers need to know.", fontSize: 16, textAlign: "left" },
  },
  {
    key: "text-editor",
    label: "Text editor",
    category: "basic",
    icon: "AlignLeft",
    keywords: ["rich", "wysiwyg", "paragraph"],
    defaults: { text: "Rich text block. Use the toolbar to format.", fontSize: 16 },
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
    defaults: { label: "Shop now", href: "/products", variant: "primary", size: "md", textAlign: "left" },
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
        { title: "How long is delivery?", content: "Inside Dhaka 24–48 hours." },
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
    defaults: { items: [{ title: "Read more", content: "Extra detail lives here." }] },
  },
  {
    key: "image-box",
    label: "Image box",
    category: "general",
    icon: "GalleryVerticalEnd",
    keywords: ["card", "feature", "picture"],
    defaults: { url: "", title: "Feature title", text: "One line about this feature.", textAlign: "center" },
  },
  {
    key: "icon-box",
    label: "Icon box",
    category: "general",
    icon: "BadgeCheck",
    keywords: ["feature", "benefit", "usp"],
    defaults: { icon: "BadgeCheck", title: "Free delivery", text: "On every order over ৳2,000.", textAlign: "center" },
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
      items: [{ text: "Cash on delivery" }, { text: "Free returns" }, { text: "48h dispatch" }],
    },
  },
  {
    key: "counter",
    label: "Counter",
    category: "general",
    icon: "Hash",
    keywords: ["number", "stat", "metric"],
    defaults: { start: 0, end: 1200, prefix: "", suffix: "+", title: "Happy customers", textAlign: "center" },
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
    defaults: { text: "This store made ordering effortless.", author: "Nusrat A.", role: "Verified buyer", textAlign: "left" },
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
    defaults: { tone: "info", title: "Heads up", text: "Delivery may take an extra day during Eid." },
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
    defaults: { block: "", params: "" },
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
      ["product-categories", "Product categories", "Tags", ["collections", "taxonomy"]],
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
];

export const WIDGET_BY_KEY: Record<string, WidgetDef> = WIDGETS.reduce<Record<string, WidgetDef>>(
  (acc, widget) => {
    acc[widget.key] = widget;
    return acc;
  },
  {},
);

export function widgetLabel(key: string): string {
  return WIDGET_BY_KEY[key]?.label ?? key;
}

export function widgetIcon(key: string): string {
  return WIDGET_BY_KEY[key]?.icon ?? "Square";
}

/** Search across label and keywords; empty query returns everything. */
export function searchWidgets(query: string, widgets: WidgetDef[] = WIDGETS): WidgetDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return widgets;
  return widgets.filter(
    (widget) =>
      widget.label.toLowerCase().includes(q) ||
      widget.key.includes(q) ||
      widget.keywords.some((keyword) => keyword.includes(q)),
  );
}

export function groupWidgets(widgets: WidgetDef[]): { category: WidgetCategory; items: WidgetDef[] }[] {
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
