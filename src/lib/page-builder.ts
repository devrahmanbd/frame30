// Stub — full implementation was not committed to git by upstream.
// The type block below models the consumers' actual contract (PageBuilder /
// PageCanvas nested {type, settings} docs) while renderWidget still serves the
// legacy flat {kind, ...top-level props} docs. Helpers keep today's runtime
// behavior; only the types are new.

export type WidgetType =
  | "heading"
  | "text"
  | "image"
  | "button"
  | "list"
  | "quote"
  | "divider"
  | "spacer"
  | "video"
  | "html"
  | "products"
  | "product_card"
  | "whatsapp_button"
  | "plugin"
  | string;

export type Device = "desktop" | "tablet" | "mobile";

export interface WidgetSettings {
  text?: string;
  html?: string;
  href?: string;
  url?: string;
  src?: string;
  alt?: string;
  author?: string;
  category?: string;
  color?: string;
  heading?: string;
  height?: number;
  items?: string[];
  label?: string;
  level?: number;
  limit?: number;
  marginBottom?: number;
  marginTop?: number;
  perRow?: number;
  radius?: number;
  showPrice?: boolean;
  size?: number;
  variant?: string;
  weight?: number | "bold" | "normal" | "lighter" | "bolder";
  align?:
    "left" | "center" | "right" | "justify" | "start" | "end" | "match-parent";
  productId?: string;
  phone_number?: string;
  code?: string;
  pluginKey?: string;
  [k: string]: unknown;
}

export interface Widget {
  id: string;
  type: WidgetType;
  settings: WidgetSettings;
  /** Legacy flat docs carry the widget kind at the top level. */
  kind?: WidgetType;
  /** Plugin mount key for flat `plugin` widgets. */
  pluginKey?: string;
  [k: string]: unknown;
}

export interface Column {
  id: string;
  /** 12-column grid span (1–12). */
  span: number;
  widgets: Widget[];
  /** Legacy flex weight used by renderBuilderHtml (1 = full). */
  width?: number;
  padding?: number;
  background?: string;
}

export interface Section {
  id: string;
  columns: Column[];
  width?: "boxed" | "full";
  paddingY?: number;
  paddingX?: number;
  gap?: number;
  align?: string;
  background?: string;
}

export interface BuilderDoc {
  sections: Section[];
}

export interface ProductCard {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  priceMinor: number | null;
  currency: string;
  href: string;
}

export type ProductData = Record<string, ProductCard[]>;

// ── helpers ──────────────────────────────────────────────────────────

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newColumn(span = 12): Column {
  return { id: uid(), span, widgets: [] };
}

export function newSection(spans?: number[]): Section {
  const columns = (spans && spans.length ? spans : [12]).map((span) =>
    newColumn(span),
  );
  return { id: uid(), columns };
}

export function newWidget(kind: WidgetType = "text"): Widget {
  const base = { id: uid(), type: kind };
  switch (kind) {
    case "heading":
      return { ...base, settings: { text: "Heading", level: 2 } };
    case "image":
      return { ...base, settings: {} };
    case "button":
      return { ...base, settings: { label: "Button", href: "#" } };
    case "list":
      return { ...base, settings: { items: [] } };
    case "quote":
      return { ...base, settings: { text: "" } };
    case "divider":
      return { ...base, settings: {} };
    case "spacer":
      return { ...base, settings: { height: 24 } };
    case "video":
      return { ...base, settings: {} };
    case "html":
      return { ...base, settings: { html: "" } };
    case "products":
      return { ...base, settings: { limit: 4, perRow: 4 } };
    case "product_card":
      return { ...base, settings: {} };
    default:
      return { ...base, settings: { text: "" } };
  }
}

// ── constants ────────────────────────────────────────────────────────

export const starterDoc: any = (title?: string) => ({
  sections: [
    {
      id: "1",
      width: "full",
      paddingY: 40,
      paddingX: 16,
      columns: [
        {
          id: "2",
          span: 12,
          widgets: [
            {
              type: "heading",
              settings: {
                text: title || "New page",
                align: "center",
                size: 40,
              },
            },
            { type: "text", settings: { text: "Some sample text" } },
            { type: "image", settings: { src: "foo" } },
            { type: "button", settings: { label: "Click" } },
            { type: "spacer", settings: { height: 24 } },
            { type: "divider", settings: {} },
          ],
        },
      ],
    },
  ],
});
Object.assign(starterDoc, { sections: [] });
export const emptyDoc = (): BuilderDoc => ({ sections: [] });

export const COLUMN_PRESETS: { key: string; label: string; spans: number[] }[] =
  [
    { key: "full", label: "Full", spans: [12] },
    { key: "half", label: "Half", spans: [6, 6] },
    { key: "thirds", label: "Thirds", spans: [4, 4, 4] },
    { key: "sidebar", label: "Sidebar", spans: [4, 8] },
    { key: "sidebar-r", label: "Sidebar R", spans: [8, 4] },
  ];

export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 375,
};

export const WIDGET_LABEL: Record<string, { en: string; bn: string }> = {
  heading: { en: "Heading", bn: "শিরোনাম" },
  text: { en: "Text", bn: "লেখা" },
  image: { en: "Image", bn: "ছবি" },
  button: { en: "Button", bn: "বোতাম" },
  list: { en: "List", bn: "তালিকা" },
  quote: { en: "Quote", bn: "উদ্ধৃতি" },
  divider: { en: "Divider", bn: "বিভাজক" },
  spacer: { en: "Spacer", bn: "স্পেসার" },
  video: { en: "Video", bn: "ভিডিও" },
  html: { en: "HTML", bn: "HTML" },
  products: { en: "Products", bn: "পণ্য" },
  product_card: { en: "Product Card", bn: "পণ্য কার্ড" },
  whatsapp_button: { en: "WhatsApp", bn: "হোয়াটসঅ্যাপ" },
  plugin: { en: "Plugin", bn: "প্লাগইন" },
  quick_view: { en: "Quick View", bn: "কুইক ভিউ" },
  add_to_cart: { en: "Add to cart", bn: "কার্টে যোগ করুন" },
};

// ── product widgets ──────────────────────────────────────────────────

/** Collects every `products` widget in a document, in render order. */
export function productWidgets(doc: BuilderDoc): Widget[] {
  const out: Widget[] = [];
  for (const sec of doc?.sections ?? []) {
    for (const col of sec?.columns ?? []) {
      for (const w of col?.widgets ?? []) {
        if ((w.kind ?? w.type) === "products") out.push(w);
      }
    }
  }
  return out;
}

// ── type guards & parsers ───────────────────────────────────────────

export function isBuilderBody(body: unknown): body is BuilderDoc {
  return (
    !!body &&
    typeof body === "object" &&
    "sections" in body &&
    Array.isArray((body as BuilderDoc).sections)
  );
}

export function parseBuilderBody(raw: string | null | undefined): BuilderDoc {
  if (!raw) return starterDoc;
  try {
    const parsed = JSON.parse(raw);
    return isBuilderBody(parsed) ? parsed : starterDoc;
  } catch {
    return starterDoc;
  }
}

export function serializeBuilderBody(doc: BuilderDoc): string {
  return JSON.stringify(doc);
}

// ── rendering ────────────────────────────────────────────────────────

/** Minimal attribute/text escaper for merchant-sourced strings. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProducts(w: Widget, products: ProductData): string {
  const cards = products[w.id] ?? [];
  if (!cards.length) return `<!-- widget:products -->`;
  const items = cards
    .map((p) => {
      const price =
        p.priceMinor != null
          ? `<span class="pb-product-price">${(p.priceMinor / 100).toFixed(2)} ${esc(p.currency)}</span>`
          : "";
      return `<a class="pb-product" href="${esc(p.href)}"><img src="${esc(p.imageUrl ?? "")}" alt="" loading="lazy" /><span class="pb-product-title">${esc(p.title)}</span>${price}</a>`;
    })
    .join("");
  return `<div class="pb-products">${items}</div>`;
}

function renderWidget(w: Widget, products: ProductData): string {
  // Nested docs keep props in settings; legacy flat docs keep them top-level.
  const kind = w.kind ?? w.type;
  const s = (w.settings ?? w) as WidgetSettings;
  switch (kind) {
    case "heading": {
      const level = s.level ?? 2;
      return `<h${level}>${s.text ?? ""}</h${level}>`;
    }
    case "text":
      return `<div>${s.html ?? s.text ?? ""}</div>`;
    case "image":
      return `<img src="${s.src ?? s.url ?? ""}" alt="${s.alt ?? ""}" loading="lazy" />`;
    case "button":
      return `<a class="btn" href="${s.href ?? "#"}">${s.label ?? "Button"}</a>`;
    case "divider":
      return `<hr />`;
    case "spacer":
      return `<div style="height:${s.height ?? 24}px"></div>`;
    case "html":
      return String(s.code ?? s.html ?? "");
    case "products":
      return renderProducts(w, products);
    case "product_card":
      return `<div class="product-card" data-product-id="${String(s.productId ?? "")}"></div>`;
    case "plugin": {
      // Mount point, not a render: the key + settings ride as data so the
      // client island (or a future hydrator) can resolve the exact block.
      const key = String(w.pluginKey ?? s.pluginKey ?? "");
      const settings = w.settings ?? {};
      const encoded = JSON.stringify(settings)
        .replace(/</g, "\\u003c")
        .replace(/'/g, "&#39;");
      return `<div class="plugin-mount" data-plugin-widget="${key}" data-plugin-settings='${encoded}'></div>`;
    }
    default:
      return `<!-- widget:${kind} -->`;
  }
}

export function renderBuilderHtml(
  doc: BuilderDoc,
  products: ProductData = {},
): string {
  if (!doc?.sections?.length) return "";
  return doc.sections
    .map(
      (sec) =>
        `<section data-id="${sec.id}" class="pb-section">${sec.columns
          .map(
            (col) =>
              `<div class="pb-col" style="flex:${col.width ?? (col.span ? col.span / 12 : 1)}">${col.widgets.map((w) => renderWidget(w, products)).join("")}</div>`,
          )
          .join("")}</section>`,
    )
    .join("\n");
}
