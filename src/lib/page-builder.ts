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

export interface Widget {
  kind: WidgetType;
  [k: string]: unknown;
}

export interface Column {
  id: string;
  width: number;
  widgets: Widget[];
}

export interface Section {
  id: string;
  columns: Column[];
}

export interface BuilderDoc {
  sections: Section[];
}

export interface ProductCard {
  productId: string;
  title?: string;
  price?: number;
  image?: string;
}

export interface ProductData {
  id: string;
  title: string;
  price: number;
  image?: string;
}

// ── helpers ──────────────────────────────────────────────────────────

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newColumn(width = 1): Column {
  return { id: uid(), width, widgets: [] };
}

export function newSection(): Section {
  return { id: uid(), columns: [newColumn()] };
}

export function newWidget(kind: WidgetType = "text"): Widget {
  switch (kind) {
    case "heading":
      return { kind: "heading", text: "Heading" };
    case "image":
      return { kind: "image", src: "", alt: "" };
    case "button":
      return { kind: "button", label: "Button", href: "#" };
    case "divider":
      return { kind: "divider" };
    case "spacer":
      return { kind: "spacer", height: 24 };
    case "html":
      return { kind: "html", code: "" };
    case "product_card":
      return { kind: "product_card", productId: "" };
    default:
      return { kind: "text", html: "" };
  }
}

// ── constants ────────────────────────────────────────────────────────

export const starterDoc: BuilderDoc = { sections: [] };
export const emptyDoc: BuilderDoc = { sections: [] };

export const COLUMN_PRESETS: { label: string; widths: number[] }[] = [
  { label: "Full", widths: [1] },
  { label: "Half", widths: [1, 1] },
  { label: "Thirds", widths: [1, 1, 1] },
  { label: "Sidebar", widths: [1, 2] },
  { label: "Sidebar R", widths: [2, 1] },
];

export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 375,
};

export const WIDGET_LABEL: Record<string, string> = {
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  list: "List",
  quote: "Quote",
  divider: "Divider",
  spacer: "Spacer",
  html: "HTML",
  product_card: "Product Card",
};

// ── product widgets ──────────────────────────────────────────────────

export const productWidgets: Record<string, ProductCard> = {};

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
    default:
      return `<!-- widget:${w.kind} -->`;
  }
}

export function renderBuilderHtml(doc: BuilderDoc): string {
  if (!doc?.sections?.length) return "";
  return doc.sections
    .map(
      (sec) =>
        `<section data-id="${sec.id}" class="pb-section">${sec.columns
          .map(
            (col) =>
              `<div class="pb-col" style="flex:${col.width}">${col.widgets.map(renderWidget).join("")}</div>`
          )
          .join("")}</section>`
    )
    .join("\n");
}
