/* eslint-disable @typescript-eslint/no-unused-vars */
// Stub — full implementation was not committed to git by upstream
// Covers every named export imported across the codebase.

export type WidgetType =
  | "heading"
  | "text"
  | "image"
  | "button"
  | "list"
  | "quote"
  | "divider"
  | "spacer"
  | "html"
  | "product_card"
  | string;

export type Device = "desktop" | "tablet" | "mobile";

export type WidgetSettings = Record<string, any>;

export interface Widget {
  id: string;
  type: string;
  kind?: WidgetType;
  settings: WidgetSettings;
  [k: string]: unknown;
}

export interface Column {
  id: string;
  span: number;
  width?: number;
  padding?: number;
  background?: string;
  widgets: Widget[];
}

export interface Section {
  id: string;
  columns: Column[];
  background?: string;
  paddingY?: number;
  paddingX?: number;
  gap?: number;
  width?: string;
  align?: string;
}

export interface BuilderDoc {
  sections: Section[];
}

export interface ProductCard {
  productId?: string;
  id?: string;
  title?: string;
  slug?: string;
  image?: string;
  imageUrl?: string | null;
  price?: number;
  priceMinor?: number | null;
  currency?: string;
  href?: string;
}

export type ProductData = Record<string, ProductCard[]>;

// ── helpers ──────────────────────────────────────────────────────────

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newColumn(span = 12): Column {
  return { id: uid(), span, width: span, widgets: [] };
}

export function newSection(spans?: number[]): Section {
  const list = spans && spans.length > 0 ? spans : [12];
  return { id: uid(), columns: list.map((span) => newColumn(span)) };
}

function widgetDefaults(kind: WidgetType): WidgetSettings {
  switch (kind) {
    case "heading":
      return { text: "Heading" };
    case "image":
      return { src: "", alt: "" };
    case "button":
      return { label: "Button", href: "#" };
    case "divider":
      return {};
    case "spacer":
      return { height: 24 };
    case "html":
      return { code: "" };
    case "product_card":
      return { productId: "" };
    default:
      return {};
  }
}

export function newWidget(kind: WidgetType = "text"): Widget {
  return {
    id: uid(),
    type: kind,
    kind,
    settings: widgetDefaults(kind),
    ...(kind === "heading"
      ? { text: "Heading" }
      : kind === "image"
        ? { src: "", alt: "" }
        : kind === "button"
          ? { label: "Button", href: "#" }
          : kind === "divider"
            ? {}
            : kind === "spacer"
              ? { height: 24 }
              : kind === "html"
                ? { code: "" }
                : kind === "product_card"
                  ? { productId: "" }
                  : { html: "" }),
  };
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

function _emptyDoc(): BuilderDoc {
  return { sections: [] };
}
export const emptyDoc: BuilderDoc & (() => BuilderDoc) = Object.assign(
  _emptyDoc,
  { sections: [] as BuilderDoc["sections"] },
);

export const COLUMN_PRESETS: {
  key: string;
  label: string;
  spans: number[];
  widths: number[];
}[] = [
  { key: "full", label: "Full", spans: [12], widths: [1] },
  { key: "half", label: "Half", spans: [6, 6], widths: [1, 1] },
  { key: "thirds", label: "Thirds", spans: [4, 4, 4], widths: [1, 1, 1] },
  { key: "sidebar", label: "Sidebar", spans: [4, 8], widths: [1, 2] },
  { key: "sidebar-r", label: "Sidebar R", spans: [8, 4], widths: [2, 1] },
];

export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 375,
};

export const WIDGET_LABEL: Record<string, { en: string; bn: string }> = {
  heading: { en: "Heading", bn: "শিরোনাম" },
  text: { en: "Text", bn: "টেক্সট" },
  image: { en: "Image", bn: "ছবি" },
  button: { en: "Button", bn: "বাটন" },
  list: { en: "List", bn: "তালিকা" },
  quote: { en: "Quote", bn: "উদ্ধৃতি" },
  divider: { en: "Divider", bn: "বিভাজক" },
  spacer: { en: "Spacer", bn: "ফাঁক" },
  html: { en: "HTML", bn: "এইচটিএমএল" },
  video: { en: "Video", bn: "ভিডিও" },
  products: { en: "Products", bn: "প্রোডাক্ট" },
  product_card: { en: "Product Card", bn: "প্রোডাক্ট কার্ড" },
};

// ── product widgets ──────────────────────────────────────────────────

function _productWidgets(doc: BuilderDoc): Widget[] {
  const out: Widget[] = [];
  for (const section of doc.sections ?? []) {
    for (const column of section.columns ?? []) {
      for (const widget of column.widgets ?? []) {
        const t = widget.type ?? widget.kind;
        if (t === "products" || t === "product_card") out.push(widget);
      }
    }
  }
  return out;
}

export function productWidgets(doc: BuilderDoc): Widget[] {
  return _productWidgets(doc);
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

function renderWidget(w: Widget): string {
  switch (w.kind) {
    case "heading":
      return `<h${(w as any).level ?? 2}>${(w as any).text ?? ""}</h${(w as any).level ?? 2}>`;
    case "text":
      return `<div>${(w as any).html ?? ""}</div>`;
    case "image":
      return `<img src="${(w as any).src ?? ""}" alt="${(w as any).alt ?? ""}" loading="lazy" />`;
    case "button":
      return `<a class="btn" href="${(w as any).href ?? "#"}">${(w as any).label ?? "Button"}</a>`;
    case "divider":
      return `<hr />`;
    case "spacer":
      return `<div style="height:${(w as any).height ?? 24}px"></div>`;
    case "html":
      return (w as any).code ?? "";
    case "product_card":
      return `<div class="product-card" data-product-id="${(w as any).productId ?? ""}"></div>`;
    case "plugin": {
      // Mount point, not a render: the key + settings ride as data so the
      // client island (or a future hydrator) can resolve the exact block.
      const key = String((w as any).pluginKey ?? "");
      const settings = (w as any).settings ?? {};
      const encoded = JSON.stringify(settings)
        .replace(/</g, "\\u003c")
        .replace(/'/g, "&#39;");
      return `<div class="plugin-mount" data-plugin-widget="${key}" data-plugin-settings='${encoded}'></div>`;
    }
    default:
      return `<!-- widget:${w.kind} -->`;
  }
}

export function renderBuilderHtml(
  doc: BuilderDoc,
  _products?: Record<string, ProductCard[]>,
): string {
  if (!doc?.sections?.length) return "";
  return doc.sections
    .map(
      (sec) =>
        `<section data-id="${sec.id}" class="pb-section">${sec.columns
          .map(
            (col) =>
              `<div class="pb-col" style="flex:${col.width ?? col.span}">${col.widgets.map(renderWidget).join("")}</div>`,
          )
          .join("")}</section>`,
    )
    .join("\n");
}
