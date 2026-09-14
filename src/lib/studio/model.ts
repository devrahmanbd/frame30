/**
 * Phase 14 — Studio document model.
 *
 * One recursive node type covers containers and widgets, which is what makes
 * Elementor's Flexbox/Grid nesting possible. Documents are stored inside the
 * existing `body` text column behind an HTML comment marker, followed by a
 * rendered HTML fallback so any consumer that does not know about the Studio
 * still shows readable content.
 *
 * v1 (`fq-builder:v1`, section → column → widget) upgrades losslessly into v2
 * containers, so pages written by the older builder keep opening.
 */
import type { ContainerSettings } from "./containers";
import type { DeviceKey, Maybe } from "./responsive";
import { resolveResponsive } from "./responsive";
import type { BuilderDoc, Widget as V1Widget } from "@/lib/page-builder";
import { parseBuilderBody } from "@/lib/page-builder";

export type SettingValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SettingValue[]
  | { [key: string]: SettingValue };

export type NodeSettings = Record<string, SettingValue>;

export type StudioNode = {
  id: string;
  /** Element id: `container`, `grid`, or a widget key from the catalogue. */
  el: string;
  settings: NodeSettings;
  children?: StudioNode[];
  /** Navigator rename. */
  name?: string;
  /** Navigator eye toggle — hidden in the editor only. */
  collapsed?: boolean;
  /** Responsive visibility: devices the node is hidden on. */
  hiddenOn?: DeviceKey[];
};

export type PageLayout = "default" | "canvas" | "full" | "theme" | "no-title";

export type PageSettings = {
  title: string;
  status: "draft" | "published" | "private";
  featuredImage?: string;
  order?: number;
  allowComments?: boolean;
  hideTitle?: boolean;
  layout: PageLayout;
  bodyBackground?: string;
  bodyMargin?: number;
  bodyPadding?: number;
  customCss?: string;
};

/** A reusable global class managed from the Class Manager. */
export type StudioClass = { id: string; name: string };

export type StudioDoc = {
  version: 2;
  root: StudioNode[];
  page: PageSettings;
  /** Active responsive breakpoints for this document. */
  breakpoints?: DeviceKey[];
  /** Global classes available to every element. */
  classes?: StudioClass[];
};


export const STUDIO_VERSION = 2 as const;

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function defaultPageSettings(title = "New page"): PageSettings {
  return {
    title,
    status: "draft",
    layout: "default",
    allowComments: false,
    hideTitle: false,
  };
}

export function emptyStudioDoc(title = "New page"): StudioDoc {
  return { version: STUDIO_VERSION, root: [], page: defaultPageSettings(title) };
}

export function newContainer(settings: ContainerSettings = {}, children: StudioNode[] = []): StudioNode {
  return {
    id: uid(),
    el: "container",
    settings: { layout: "flex", direction: "column", gap: 20, contentWidth: "boxed", ...settings } as NodeSettings,
    children,
  };
}

export function newGrid(columns = 3, children: StudioNode[] = []): StudioNode {
  return {
    id: uid(),
    el: "grid",
    settings: { layout: "grid", columns, gap: 20, contentWidth: "boxed" } as NodeSettings,
    children,
  };
}

export function isContainerNode(node: StudioNode): boolean {
  return node.el === "container" || node.el === "grid";
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

const OPEN = "<!--fq-studio:v2";
const CLOSE = "fq-studio:end-->";

export function isStudioBody(body: string | null | undefined): boolean {
  return Boolean(body && body.includes(OPEN));
}

function sanitiseNode(input: unknown, depth = 0): StudioNode | null {
  if (!input || typeof input !== "object" || depth > 12) return null;
  const raw = input as Partial<StudioNode>;
  if (typeof raw.el !== "string" || !raw.el) return null;
  const node: StudioNode = {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    el: raw.el,
    settings: raw.settings && typeof raw.settings === "object" ? (raw.settings as NodeSettings) : {},
  };
  if (typeof raw.name === "string") node.name = raw.name;
  if (raw.collapsed === true) node.collapsed = true;
  if (Array.isArray(raw.hiddenOn)) node.hiddenOn = raw.hiddenOn as DeviceKey[];
  if (Array.isArray(raw.children)) {
    const children = raw.children
      .map((child) => sanitiseNode(child, depth + 1))
      .filter((child): child is StudioNode => child !== null);
    if (children.length > 0 || raw.el === "container" || raw.el === "grid") node.children = children;
  }
  return node;
}

export function parseStudioDoc(input: unknown): StudioDoc | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<StudioDoc>;
  if (!Array.isArray(raw.root)) return null;
  const root = raw.root
    .map((node) => sanitiseNode(node))
    .filter((node): node is StudioNode => node !== null);
  return {
    version: STUDIO_VERSION,
    root,
    page: { ...defaultPageSettings(), ...(raw.page ?? {}) },
    breakpoints: Array.isArray(raw.breakpoints) ? (raw.breakpoints as DeviceKey[]) : undefined,
    classes: Array.isArray(raw.classes)
      ? (raw.classes as StudioClass[]).filter(
          (item) => item && typeof item.id === "string" && typeof item.name === "string",
        )
      : undefined,

  };
}

export function parseStudioBody(body: string | null | undefined): StudioDoc | null {
  if (!body) return null;
  const start = body.indexOf(OPEN);
  if (start < 0) return null;
  const end = body.indexOf(CLOSE, start);
  if (end < 0) return null;
  const json = body.slice(start + OPEN.length, end).replace(/-->\s*$/, "").trim();
  try {
    return parseStudioDoc(JSON.parse(json));
  } catch {
    return null;
  }
}

export function serializeStudioBody(doc: StudioDoc): string {
  return `${OPEN}\n${JSON.stringify(doc)}\n${CLOSE}\n\n${renderStudioHtml(doc)}`;
}

/**
 * Read whatever the body holds: a Studio v2 document, an upgraded v1
 * page-builder document, or nothing.
 */
export function readStudioBody(body: string | null | undefined, title?: string): StudioDoc | null {
  const v2 = parseStudioBody(body);
  if (v2) return v2;
  const v1 = parseBuilderBody(body);
  if (v1) return upgradeV1(v1, title);
  return null;
}

/* ------------------------------------------------------------------ */
/* v1 → v2 upgrade                                                     */
/* ------------------------------------------------------------------ */

function upgradeWidget(widget: V1Widget): StudioNode {
  const s = widget.settings;
  const settings: NodeSettings = { ...(s as unknown as NodeSettings) };
  if (s.align) settings.textAlign = s.align;
  if (s.size) settings.fontSize = s.size;
  if (s.weight) settings.fontWeight = s.weight;
  if (s.color) settings.textColor = s.color;
  return { id: widget.id || uid(), el: widget.type, settings };
}

export function upgradeV1(doc: BuilderDoc, title?: string): StudioDoc {
  const root = doc.sections.map((section) => {
    const columns = section.columns.map((column) =>
      newContainer(
        {
          layout: "flex",
          direction: "column",
          gap: 12,
          contentWidth: "full",
          basis: Math.round((column.span / 12) * 100),
        },
        column.widgets.map(upgradeWidget),
      ),
    );
    const wrapper = newContainer(
      {
        layout: "flex",
        direction: "row",
        gap: section.gap ?? 24,
        wrap: "wrap",
        contentWidth: section.width === "full" ? "full" : "boxed",
      },
      columns,
    );
    wrapper.settings.paddingY = section.paddingY ?? 40;
    wrapper.settings.paddingX = section.paddingX ?? 16;
    if (section.background) wrapper.settings.background = section.background;
    return wrapper;
  });
  return { version: STUDIO_VERSION, root, page: defaultPageSettings(title ?? "Page") };
}

/* ------------------------------------------------------------------ */
/* HTML projection (storefront fallback + export)                      */
/* ------------------------------------------------------------------ */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function safeHref(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return "#";
  if (/^(https?:|mailto:|tel:|\/)/i.test(v)) return escapeHtml(v);
  return "#";
}

function str(value: SettingValue, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function num(value: SettingValue, fallback: number): number {
  const resolved = resolveResponsive(value as Maybe<number>);
  return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : fallback;
}

function widgetHtml(node: StudioNode): string {
  const s = node.settings;
  const align = s.textAlign ? `text-align:${str(s.textAlign)};` : "";
  switch (node.el) {
    case "heading": {
      const level = Math.min(6, Math.max(1, num(s.level, 2)));
      return `<h${level} style="${align}font-size:${num(s.fontSize, 32)}px;font-weight:${num(s.fontWeight, 700)}">${escapeHtml(str(s.text, "Heading"))}</h${level}>`;
    }
    case "text":
      return `<p style="${align}font-size:${num(s.fontSize, 16)}px">${escapeHtml(str(s.text))}</p>`;
    case "text-editor":
      return `<div style="${align}">${escapeHtml(str(s.text))}</div>`;
    case "image":
      return str(s.url)
        ? `<figure style="${align}"><img src="${safeHref(s.url)}" alt="${escapeHtml(str(s.alt))}" loading="lazy" style="max-width:100%;border-radius:${num(s.radius, 12)}px" /></figure>`
        : "";
    case "button":
      return `<p style="${align}"><a href="${safeHref(s.href)}" class="fq-btn fq-btn-${str(s.variant, "primary")}">${escapeHtml(str(s.label, "Button"))}</a></p>`;
    case "divider":
      return `<hr style="border:0;border-top:1px solid rgba(0,0,0,.12)" />`;
    case "spacer":
      return `<div style="height:${num(s.height, 32)}px"></div>`;
    case "icon-list":
    case "list": {
      const items = Array.isArray(s.items) ? s.items : [];
      return `<ul style="${align}">${items.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : str((item as NodeSettings)?.text))}</li>`).join("")}</ul>`;
    }
    case "testimonial":
    case "quote":
      return `<blockquote style="${align}">${escapeHtml(str(s.text))}${s.author ? `<footer>— ${escapeHtml(str(s.author))}</footer>` : ""}</blockquote>`;
    case "video":
      return str(s.url)
        ? `<div><iframe src="${safeHref(s.url)}" title="${escapeHtml(str(s.title, "video"))}" loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px"></iframe></div>`
        : "";
    case "html":
      return str(s.html);
    case "alert":
      return `<div role="note"><strong>${escapeHtml(str(s.title, "Notice"))}</strong> ${escapeHtml(str(s.text))}</div>`;
    case "image-box":
    case "icon-box":
      return `<div style="${align}"><h3>${escapeHtml(str(s.title, "Title"))}</h3><p>${escapeHtml(str(s.text))}</p></div>`;
    case "counter":
      return `<p style="${align}"><strong>${escapeHtml(str(s.prefix))}${num(s.end, 100)}${escapeHtml(str(s.suffix))}</strong> ${escapeHtml(str(s.title))}</p>`;
    case "progress":
      return `<div><span>${escapeHtml(str(s.title))}</span><progress value="${num(s.percent, 50)}" max="100"></progress></div>`;
    case "accordion":
    case "toggle":
    case "tabs": {
      const items = Array.isArray(s.items) ? (s.items as NodeSettings[]) : [];
      return items
        .map(
          (item) =>
            `<details><summary>${escapeHtml(str(item?.title, "Item"))}</summary><div>${escapeHtml(str(item?.content))}</div></details>`,
        )
        .join("");
    }
    default:
      return s.text ? `<p style="${align}">${escapeHtml(str(s.text))}</p>` : "";
  }
}

function nodeHtml(node: StudioNode): string {
  if (node.el === "container" || node.el === "grid") {
    const s = node.settings;
    const layout = str(s.layout, node.el === "grid" ? "grid" : "flex");
    const inner =
      layout === "grid"
        ? `display:grid;grid-template-columns:repeat(${num(s.columns, 3)},minmax(0,1fr))`
        : `display:flex;flex-direction:${str(s.direction, "column")};flex-wrap:${str(s.wrap, "nowrap")}`;
    const width = str(s.contentWidth, "boxed") === "full" ? "none" : `${num(s.maxWidth, 1140)}px`;
    const outer = [
      s.background ? `background:${str(s.background)}` : "",
      `padding:${num(s.paddingY, 24)}px ${num(s.paddingX, 16)}px`,
    ]
      .filter(Boolean)
      .join(";");
    const children = (node.children ?? []).map(nodeHtml).join("");
    return `<section style="${outer}"><div style="${inner};gap:${num(s.gap, 20)}px;max-width:${width};margin:0 auto">${children}</div></section>`;
  }
  return widgetHtml(node);
}

export function renderStudioHtml(doc: StudioDoc): string {
  return doc.root.map(nodeHtml).join("\n");
}

/** Plain-text projection, used for excerpts and search indexing. */
export function studioPlainText(doc: StudioDoc): string {
  const out: string[] = [];
  const walk = (nodes: StudioNode[]) => {
    for (const node of nodes) {
      const s = node.settings;
      for (const key of ["text", "title", "label", "author"]) {
        const value = s[key];
        if (typeof value === "string" && value.trim()) out.push(value.trim());
      }
      if (Array.isArray(s.items)) {
        for (const item of s.items) {
          if (typeof item === "string") out.push(item);
          else if (item && typeof item === "object") {
            const row = item as NodeSettings;
            if (typeof row.text === "string") out.push(row.text);
            if (typeof row.title === "string") out.push(row.title);
          }
        }
      }
      if (node.children) walk(node.children);
    }
  };
  walk(doc.root);
  return out.join("\n");
}

export function countNodes(nodes: StudioNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children ?? []), 0);
}
