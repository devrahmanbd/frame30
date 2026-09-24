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
  /**
   * Slot this top-level section belongs to. Only meaningful on root-level
   * nodes; nested children ignore it. Absent = `"main"`, so every document
   * written before slots keeps rendering exactly as before.
   */
  slot?: StudioSlot;
};

/** Header / main / footer slots — mirrors `SLOTS` in `builder-ast`. */
export const STUDIO_SLOTS = ["header", "main", "footer"] as const;
export type StudioSlot = (typeof STUDIO_SLOTS)[number];

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
  /** Main slot. Every pre-slot document lives here in full. */
  root: StudioNode[];
  /**
   * Page-level header/footer overrides. Absent/empty = no override.
   * At render time the theme studio's chrome wins when it has content
   * (see `resolveStudioSlots`); otherwise these apply.
   */
  header?: StudioNode[];
  footer?: StudioNode[];
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
  return {
    version: STUDIO_VERSION,
    root: [],
    page: defaultPageSettings(title),
  };
}

export function newContainer(
  settings: ContainerSettings = {},
  children: StudioNode[] = [],
): StudioNode {
  return {
    id: uid(),
    el: "container",
    settings: {
      layout: "flex",
      direction: "column",
      gap: 20,
      contentWidth: "boxed",
      ...settings,
    } as NodeSettings,
    children,
  };
}

export function newGrid(columns = 3, children: StudioNode[] = []): StudioNode {
  return {
    id: uid(),
    el: "grid",
    settings: {
      layout: "grid",
      columns,
      gap: 20,
      contentWidth: "boxed",
    } as NodeSettings,
    children,
  };
}

export function isContainerNode(node: StudioNode): boolean {
  return node.el === "container" || node.el === "grid" || node.el === "columns";
}

/* ------------------------------------------------------------------ */
/* Slots: header / main / footer                                       */
/* ------------------------------------------------------------------ */

/**
 * Slot awareness for the page studio. `root` stays the canonical main slot
 * so every pre-slot document keeps working; `header`/`footer` are optional
 * page overrides while the theme studio owns the live chrome.
 * Node-level `slot` is honoured when a root node carries one
 * (`ast[slot]` semantics): root nodes tagged `header`/`footer` read as
 * chrome, everything else reads as main.
 */
export function isStudioSlot(value: unknown): value is StudioSlot {
  return (
    value === "header" || value === "main" || value === "footer"
  );
}

/** Unknown / absent slots read as `"main"` — never blank a canvas. */
export function normalizeStudioSlot(value: unknown): StudioSlot {
  return isStudioSlot(value) ? value : "main";
}

/** Slot a node belongs to; absent = `"main"`. */
export function slotOfNode(node: StudioNode): StudioSlot {
  return normalizeStudioSlot(node.slot);
}

/** Tag a node with its slot (top-level sections only). */
export function withSlot(node: StudioNode, slot: StudioSlot): StudioNode {
  return { ...node, slot };
}

export type StudioSlots = {
  header: StudioNode[];
  main: StudioNode[];
  footer: StudioNode[];
};

/**
 * Split a document into its three slots. `header`/`footer` arrays read as
 * chrome regardless of node tags; `root` nodes tagged `header`/`footer`
 * join them, the rest stay main.
 */
export function studioSlots(doc: StudioDoc): StudioSlots {
  const header: StudioNode[] = [...(doc.header ?? [])];
  const footer: StudioNode[] = [...(doc.footer ?? [])];
  const main: StudioNode[] = [];
  for (const node of doc.root) {
    const slot = slotOfNode(node);
    if (slot === "header") header.push(node);
    else if (slot === "footer") footer.push(node);
    else main.push(node);
  }
  return { header, main, footer };
}

/**
 * Build a document from slots. `header`/`footer` are omitted when empty so
 * old snapshots without those keys round-trip byte-identically.
 */
export function studioDocFromSlots(
  slots: Partial<StudioSlots>,
  page: PageSettings,
  extra?: Partial<Omit<StudioDoc, "root" | "page" | "header" | "footer">>,
): StudioDoc {
  const doc: StudioDoc = { version: STUDIO_VERSION, root: [...(slots.main ?? [])], page, ...extra };
  if (slots.header?.length) doc.header = [...slots.header];
  if (slots.footer?.length) doc.footer = [...slots.footer];
  return doc;
}

/**
 * Resolve which chrome a page shows. The theme studio wins whenever it has
 * header/footer content; otherwise the page's own overrides apply.
 */
export function resolveStudioSlots(
  page: StudioDoc,
  theme?: Pick<StudioDoc, "root" | "header" | "footer"> | null,
): StudioSlots {
  const mine = studioSlots(page);
  if (!theme) return mine;
  const themed = studioSlots({
    version: STUDIO_VERSION,
    root: theme.root ?? [],
    header: theme.header,
    footer: theme.footer,
    page: page.page,
  });
  return {
    header: themed.header.length > 0 ? themed.header : mine.header,
    main: mine.main,
    footer: themed.footer.length > 0 ? themed.footer : mine.footer,
  };
}

/* ------------------------------------------------------------------ */
/* Menu binding: widget → menu                                         */
/* ------------------------------------------------------------------ */

/**
 * Minimal widget→menu binding. Navigation widgets (`nav_menu`, `mega_menu`)
 * carry `settings.menuId` (a menu id or handle from Content › Menus).
 * Empty = manual `items` (back-compat). The canvas preview resolves the
 * binding through `resolveMenuItems`; the storefront does the same lookup
 * server-side.
 */
export const MENU_BOUND_WIDGETS = ["nav_menu", "mega_menu"] as const;

export function isMenuBoundWidget(el: string): boolean {
  return (MENU_BOUND_WIDGETS as readonly string[]).includes(el);
}

export type StudioMenuItem = { label: string; href: string };

/**
 * Structural menu shape the preview resolver accepts. Compatible with
 * `NavMenu` (flat `MenuItem[]` with `label`/`url`/`parentId`/`position`)
 * without importing the menus module.
 */
export type StudioMenuSource = {
  id: string;
  handle?: string | null;
  name?: string | null;
  items: readonly {
    label: string;
    url?: string;
    href?: string;
    parentId?: string | null;
    position?: number;
  }[];
};

/** Bound menu id/handle, or null when the widget uses manual items. */
export function menuBindingOf(node: StudioNode): string | null {
  const raw = node.settings.menuId ?? node.settings.menu;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id ? id : null;
}

/** Manual `items` fallback — mirrors the canvas renderer rows. */
export function staticMenuItems(node: StudioNode): StudioMenuItem[] {
  const raw = node.settings.items;
  if (!Array.isArray(raw)) return [];
  const out: StudioMenuItem[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      if (entry.trim()) out.push({ label: entry.trim(), href: "#" });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const label =
      typeof row.label === "string"
        ? row.label
        : typeof row.text === "string"
          ? row.text
          : "";
    if (!label.trim()) continue;
    const href =
      typeof row.href === "string"
        ? row.href
        : typeof row.url === "string"
          ? row.url
          : "#";
    out.push({ label: label.trim(), href: href || "#" });
  }
  return out;
}

/**
 * Resolve a widget's bound menu to preview items. Returns null when unbound
 * or when the bound menu is not among `menus` (caller falls back to
 * `staticMenuItems`); returns the (possibly empty) item list when bound and
 * found. Top-level entries only, in position order.
 */
export function resolveMenuItems(
  node: StudioNode,
  menus: readonly StudioMenuSource[] | null | undefined,
): StudioMenuItem[] | null {
  const binding = menuBindingOf(node);
  if (!binding || !menus) return null;
  const menu = menus.find(
    (candidate) => candidate.id === binding || candidate.handle === binding,
  );
  if (!menu) return null;
  return [...menu.items]
    .filter((item) => !item.parentId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((item) => ({
      label: item.label.trim(),
      href: (item.href ?? item.url ?? "#") || "#",
    }))
    .filter((item) => item.label.length > 0);
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
    settings:
      raw.settings && typeof raw.settings === "object"
        ? (raw.settings as NodeSettings)
        : {},
  };
  if (typeof raw.name === "string") node.name = raw.name;
  if (raw.collapsed === true) node.collapsed = true;
  if (Array.isArray(raw.hiddenOn)) node.hiddenOn = raw.hiddenOn as DeviceKey[];
  if (isStudioSlot(raw.slot)) node.slot = raw.slot;
  if (Array.isArray(raw.children)) {
    const children = raw.children
      .map((child) => sanitiseNode(child, depth + 1))
      .filter((child): child is StudioNode => child !== null);
    if (
      children.length > 0 ||
      raw.el === "container" ||
      raw.el === "grid" ||
      raw.el === "columns"
    )
      node.children = children;
  }
  if (raw.el === "faq" || raw.el === "product_qna") seedQaItems(node);
  if (raw.el === "trust_bar") seedTrustItems(node);
  if (raw.el === "announcement_bar") seedAnnouncementItems(node);
  if (raw.el === "lookbook") seedLookbookItems(node);
  if (raw.el === "hero") seedHeroItems(node);
  if (raw.el === "footer_sitemap") seedFooterSitemapItems(node);
  if (raw.el === "spec_table") seedSpecItems(node);
  return node;
}

/**
 * Tolerant link-list emptiness check mirroring parseLinkList/parseLinks
 * (comma AND newline delimiters, bare labels count). Kept local so model
 * stays free of component imports; canonical parsers live in chrome.tsx
 * and studio/renderers.tsx.
 */
function hasFooterLinks(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  return raw
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => part.split("|")[0]!.trim().length > 0);
}

/**
 * Repeater migration (footer_sitemap): pages saved with scalar cNTitle/
 * cNLinks pairs get `items` seeded on load, storing the RAW links string
 * (first paint stays byte-identical; normalisation happens on author
 * edit). Fully-empty columns are skipped. Never overwrites edits.
 */
function seedFooterSitemapItems(node: StudioNode): void {
  const s = node.settings as Record<string, unknown>;
  if (Array.isArray(s.items) && s.items.length > 0) return;
  const seeded: { title: string; links: string }[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const title = s[`c${i}Title`];
    const links = s[`c${i}Links`];
    const t = typeof title === "string" ? title : "";
    const l = typeof links === "string" ? links : "";
    if (!t && !hasFooterLinks(l)) continue;
    seeded.push({ title: t, links: l });
  }
  if (seeded.length > 0) {
    node.settings = { ...node.settings, items: seeded };
  }
}

/**
 * Repeater migration (spec_table): pages saved with scalar rNGroup/rNLabel/
 * rNValue triples get `items` seeded on load, dropping label-empty rows
 * (mirrors the renderer gate). Never overwrites edits. Section-level keys
 * (caption/columnLabel/grouped/handle) pass through untouched.
 */
function seedSpecItems(node: StudioNode): void {
  const s = node.settings as Record<string, unknown>;
  if (Array.isArray(s.items) && s.items.length > 0) return;
  const seeded: { group: string; label: string; value: string }[] = [];
  for (let i = 1; i <= 6; i += 1) {
    const label = s[`r${i}Label`];
    if (typeof label !== "string" || !label.trim()) continue;
    const group = s[`r${i}Group`];
    const value = s[`r${i}Value`];
    seeded.push({
      group: typeof group === "string" ? group : "",
      label,
      value: typeof value === "string" ? value : "",
    });
  }
  if (seeded.length > 0) {
    node.settings = { ...node.settings, items: seeded };
  }
}

/**
 * Repeater migration (faq, product_qna): pages saved with scalar q1/a1…
 * pairs get `items` seeded on load so the repeater panel and canvas show
 * the same content. Author-edited `items` are never overwritten. Scalars
 * stay in settings for theme/SEO pass-through until the transition
 * completes.
 */
function seedQaItems(node: StudioNode): void {
  const s = node.settings as Record<string, unknown>;
  if (Array.isArray(s.items) && s.items.length > 0) return;
  const seeded: { question: string; answer: string }[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const q = s[`q${i}`];
    const a = s[`a${i}`];
    if (typeof q === "string" && q) {
      seeded.push({
        question: q,
        answer: typeof a === "string" ? a : "",
      });
    }
  }
  if (seeded.length > 0) {
    node.settings = { ...node.settings, items: seeded };
  }
}

/**
 * Repeater migration (announcement_bar): pages saved with scalar m1/m2/m3
 * get `items` seeded on load. Author-edited `items` are never overwritten.
 * Scalars stay for theme pass-through.
 */
function seedAnnouncementItems(node: StudioNode): void {
  const s = node.settings as Record<string, unknown>;
  if (Array.isArray(s.items) && s.items.length > 0) return;
  const seeded: { text: string }[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const m = s[`m${i}`];
    if (typeof m === "string" && m.trim()) seeded.push({ text: m });
  }
  if (seeded.length > 0) {
    node.settings = { ...node.settings, items: seeded };
  }
}

/**
 * Repeater migration (hero): slide 1 is implicit in top-level
 * heading/image/subheading/ctaLabel/ctaHref, slides 2-3 in s2/s3 pairs.
 * Seed mirrors the scalar keep-first filter: slide 1 is always kept when
 * any slide has content, sN slides only when heading/image non-empty.
 * Author-edited `items` are never overwritten.
 */
function seedHeroItems(node: StudioNode): void {
  const s = node.settings as Record<string, unknown>;
  if (Array.isArray(s.items) && s.items.length > 0) return;
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  const slide0 = {
    heading: text(s.heading),
    image: text(s.image),
    subheading: text(s.subheading),
    ctaLabel: text(s.ctaLabel),
    ctaHref: text(s.ctaHref),
  };
  const slideN = (n: 2 | 3): { heading: string; image: string } | null => {
    const heading = text(s[`s${n}Heading`]);
    const image = text(s[`s${n}Image`]);
    return heading || image ? { heading, image } : null;
  };
  const ctaLabel = text(s.ctaLabel);
  const ctaHref = text(s.ctaHref);
  const seeded: Record<string, string>[] = [];
  const s2 = slideN(2);
  const s3 = slideN(3);
  if (slide0.heading || slide0.image || s2 || s3) {
    seeded.push(slide0);
    if (s2) seeded.push({ ...s2, subheading: "", ctaLabel, ctaHref });
    if (s3) seeded.push({ ...s3, subheading: "", ctaLabel, ctaHref });
    node.settings = { ...node.settings, items: seeded };
  }
}

/**
 * Repeater migration (lookbook): pages saved with scalar iNImage/iNAlt/
 * iNHref triples get `items` seeded on load. Author-edited `items` are
 * never overwritten. Scalars stay for theme pass-through.
 */
function seedLookbookItems(node: StudioNode): void {
  const s = node.settings as Record<string, unknown>;
  if (Array.isArray(s.items) && s.items.length > 0) return;
  const seeded: { image: string; alt: string; href: string }[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const image = s[`i${i}Image`];
    if (typeof image === "string" && image) {
      const alt = s[`i${i}Alt`];
      const href = s[`i${i}Href`];
      seeded.push({
        image,
        alt: typeof alt === "string" ? alt : "",
        href: typeof href === "string" ? href : "",
      });
    }
  }
  if (seeded.length > 0) {
    node.settings = { ...node.settings, items: seeded };
  }
}

/**
 * Repeater migration (trust_bar): pages saved with scalar iNIcon/iNTitle/
 * iNBody triples get `items` seeded on load. Author-edited `items` are
 * never overwritten. Scalars stay for theme pass-through.
 */
function seedTrustItems(node: StudioNode): void {
  const s = node.settings as Record<string, unknown>;
  if (Array.isArray(s.items) && s.items.length > 0) return;
  const seeded: { icon: string; title: string; body: string }[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const title = s[`i${i}Title`];
    if (typeof title === "string" && title) {
      const icon = s[`i${i}Icon`];
      const body = s[`i${i}Body`];
      seeded.push({
        icon: typeof icon === "string" ? icon : "",
        title,
        body: typeof body === "string" ? body : "",
      });
    }
  }
  if (seeded.length > 0) {
    node.settings = { ...node.settings, items: seeded };
  }
}

export function parseStudioDoc(input: unknown): StudioDoc | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<StudioDoc>;
  if (!Array.isArray(raw.root)) return null;
  const root = raw.root
    .map((node) => sanitiseNode(node))
    .filter((node): node is StudioNode => node !== null);
  const header = Array.isArray(raw.header)
    ? raw.header
        .map((node) => sanitiseNode(node))
        .filter((node): node is StudioNode => node !== null)
    : undefined;
  const footer = Array.isArray(raw.footer)
    ? raw.footer
        .map((node) => sanitiseNode(node))
        .filter((node): node is StudioNode => node !== null)
    : undefined;
  return {
    version: STUDIO_VERSION,
    root,
    ...(header !== undefined ? { header } : {}),
    ...(footer !== undefined ? { footer } : {}),
    page: { ...defaultPageSettings(), ...(raw.page ?? {}) },
    breakpoints: Array.isArray(raw.breakpoints)
      ? (raw.breakpoints as DeviceKey[])
      : undefined,
    classes: Array.isArray(raw.classes)
      ? (raw.classes as StudioClass[]).filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string",
        )
      : undefined,
  };
}

export function parseStudioBody(
  body: string | null | undefined,
): StudioDoc | null {
  if (!body) return null;
  const start = body.indexOf(OPEN);
  if (start < 0) return null;
  const end = body.indexOf(CLOSE, start);
  if (end < 0) return null;
  const json = body
    .slice(start + OPEN.length, end)
    .replace(/-->\s*$/, "")
    .trim();
  try {
    return parseStudioDoc(JSON.parse(json));
  } catch {
    // Tolerate historically-escaped payloads where brackets were stored as
    // `\[` `\]` (invalid JSON on its own): unescape once and retry rather
    // than blanking authored content into an empty canvas.
    try {
      return parseStudioDoc(
        JSON.parse(json.replace(/\\\[/g, "[").replace(/\\\]/g, "]")),
      );
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------- global-block import -- */

/** Builder breakpoints fan out onto the finer studio device keys. */
const BREAKPOINT_TO_DEVICES: Record<string, DeviceKey[]> = {
  mobile: ["mobile", "mobileLandscape"],
  tablet: ["tablet"],
  desktop: ["desktop", "laptop", "widescreen"],
};

/**
 * Global-block port: convert stored builder sections into studio nodes for
 * detached insertion into a page canvas. Deliberately dependency-free (no
 * catalog import — the renderers show unknown elements as placeholders, so
 * nothing here can crash the canvas). Ids are regenerated so inserts never
 * collide with existing nodes; invalid sections are dropped.
 */
export function sectionsToStudioNodes(input: unknown): StudioNode[] {
  if (!Array.isArray(input)) return [];
  const out: StudioNode[] = [];
  for (const section of input) {
    const node = sectionToStudioNode(section, 0);
    if (node) out.push(node);
  }
  return out;
}

/**
 * Reverse port: studio nodes back into builder sections (e.g. saving page
 * content as a theme global block). Mirrors sectionsToStudioNodes; device
 * visibility folds back onto breakpoints when any mapped device is hidden.
 */
export function studioNodesToSections(
  nodes: StudioNode[],
): { id: string; type: string; props: Record<string, unknown>; children?: unknown[]; hidden?: string[] }[] {
  return nodes.map((node) => {
    const hidden = (node.hiddenOn ?? []).flatMap(
      (device) => DEVICE_TO_BREAKPOINT[device] ?? [],
    );
    return {
      id: node.id,
      type: node.el,
      props: { ...(node.settings as Record<string, unknown>) },
      ...(node.children?.length
        ? { children: studioNodesToSections(node.children) }
        : {}),
      ...(hidden.length > 0 ? { hidden: [...new Set(hidden)] } : {}),
    };
  });
}

const DEVICE_TO_BREAKPOINT: Record<string, string[]> = {
  mobile: ["mobile"],
  mobileLandscape: ["mobile"],
  tablet: ["tablet"],
  desktop: ["desktop"],
  laptop: ["desktop"],
  widescreen: ["desktop"],
};

function sectionToStudioNode(input: unknown, depth: number): StudioNode | null {
  if (!input || typeof input !== "object" || depth > 12) return null;
  const section = input as {
    type?: unknown;
    props?: unknown;
    children?: unknown;
    hidden?: unknown;
    invalid?: unknown;
  };
  if (typeof section.type !== "string" || !section.type) return null;
  if (section.invalid) return null;
  const settings =
    section.props && typeof section.props === "object"
      ? (section.props as NodeSettings)
      : {};
  const node: StudioNode = { id: uid(), el: section.type, settings };
  if (Array.isArray(section.hidden)) {
    const hiddenOn = section.hidden.flatMap((bp) =>
      typeof bp === "string" ? (BREAKPOINT_TO_DEVICES[bp] ?? []) : [],
    );
    if (hiddenOn.length > 0) node.hiddenOn = hiddenOn;
  }
  if (Array.isArray(section.children)) {
    const children: StudioNode[] = [];
    for (const child of section.children) {
      const converted = sectionToStudioNode(child, depth + 1);
      if (converted) children.push(converted);
    }
    if (children.length > 0) node.children = children;
  }
  return node;
}

export function serializeStudioBody(doc: StudioDoc): string {
  return `${OPEN}\n${JSON.stringify(doc)}\n${CLOSE}\n\n${renderStudioHtml(doc)}`;
}

/**
 * Read whatever the body holds: a Studio v2 document, an upgraded v1
 * page-builder document, or nothing.
 */
export function readStudioBody(
  body: string | null | undefined,
  title?: string,
): StudioDoc | null {
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
  return {
    version: STUDIO_VERSION,
    root,
    page: defaultPageSettings(title ?? "Page"),
  };
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
  return typeof resolved === "number" && Number.isFinite(resolved)
    ? resolved
    : fallback;
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
    case "whatsapp_button": {
      const phone = str(s.phone_number).replace(/[^0-9]/g, "");
      if (!phone) return "";
      const greet = str(
        s.greeting_message,
        "Hello! I am interested in your products.",
      );
      const href = `https://wa.me/${phone}?text=${encodeURIComponent(greet)}`;
      const label = escapeHtml(str(s.label, "Chat on WhatsApp"));
      const size = str(s.size, "md");
      const dim = size === "sm" ? 44 : size === "lg" ? 64 : 56;
      const glyph = `<svg width="${dim - 16}" height="${dim - 16}" viewBox="0 0 512 512" fill="none" aria-hidden="true"><path fill="#b3b3b3" d="m143.8 431.2l7.7 4.5c32.2 19.1 69.2 29.2 106.8 29.2h.1c115.7 0 209.8-94.1 209.9-209.8c0-56.1-21.8-108.8-61.4-148.4c-39.3-39.5-92.7-61.7-148.4-61.5c-115.8 0-209.9 94.1-210 209.8c-.1 39.5 11.1 78.2 32.1 111.7l5 7.9L64.4 452zM3.7 512l35.8-130.8C17.5 342.9 5.8 299.5 5.9 255C5.9 115.8 119.2 2.6 258.4 2.6c67.5 0 130.9 26.3 178.6 74s73.9 111.1 73.9 178.6c-.1 139.2-113.3 252.4-252.5 252.4h-.1c-42.3 0-83.8-10.6-120.7-30.7z"></path><path fill="#fff" d="M1.1 509.4L37 378.6C14.8 340.2 3.2 296.7 3.3 252.4C3.3 113.2 116.6 0 255.8 0c67.5 0 130.9 26.3 178.6 74s73.9 111.1 73.9 178.6C508.2 391.8 394.9 505 255.8 505h-.1c-42.3 0-83.8-10.6-120.7-30.7z"></path><path fill="#25D366" d="M255.8 42.6c-115.8 0-209.9 94.1-210 209.8c0 39.5 11.2 78.2 32.2 111.7l5 7.9l-21.2 77.4l79.4-20.8l7.7 4.5c32.2 19.1 69.2 29.2 106.8 29.2h.1c115.7 0 209.8-94.1 209.9-209.8c.2-55.7-21.9-109.1-61.4-148.4c-39.3-39.4-92.8-61.6-148.5-61.5"></path><path fill="#fff" fill-rule="evenodd" d="M192.7 146.9c-4.7-10.5-9.7-10.7-14.2-10.9l-12.1-.1c-4.2 0-11 1.6-16.8 7.9s-22.1 21.6-22.1 52.6s22.6 61 25.8 65.2s43.6 69.9 107.8 95.2c53.3 21 64.1 16.8 75.7 15.8c11.6-1.1 37.3-15.3 42.6-30s5.3-27.4 3.7-30s-5.8-4.2-12.1-7.4s-37.3-18.4-43.1-20.5s-10-3.2-14.2 3.2c-4.2 6.3-16.3 20.5-20 24.7s-7.4 4.7-13.7 1.6c-6.3-3.2-26.6-9.8-50.7-31.3c-18.8-16.7-31.4-37.4-35.1-43.7s-.4-9.7 2.8-12.9c2.8-2.8 6.3-7.4 9.5-11.1s4.2-6.3 6.3-10.5s1.1-7.9-.5-11.1c-1.8-3-14-34.2-19.6-46.7"></path></svg>`;
      if (str(s.style, "bubble") === "bar") {
        const pad = size === "sm" ? "8px 14px" : size === "lg" ? "14px 24px" : "11px 20px";
        const fs = size === "sm" ? 14 : size === "lg" ? 18 : 16;
        return `<p style="${align}"><a href="${href}" target="_blank" rel="noopener" aria-label="${label}" style="display:inline-flex;align-items:center;gap:10px;background:#25D366;color:#fff;border-radius:999px;padding:${pad};font-size:${fs}px;font-weight:600;text-decoration:none">${glyph}<span>${label}</span></a></p>`;
      }
      return `<p style="${align}"><a href="${href}" target="_blank" rel="noopener" aria-label="${label}" style="display:inline-flex;width:${dim}px;height:${dim}px;border-radius:50%;background:transparent;filter:drop-shadow(0 4px 14px rgba(0,0,0,.25))">${glyph}</a></p>`;
    }
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
  if (node.el === "columns") {
    const s = node.settings;
    const n = Math.min(4, Math.max(1, num(s.columns, 2)));
    const maxW = str(s.maxW, "container");
    const width = maxW === "full" ? "none" : maxW === "narrow" ? "768px" : "1140px";
    const bg = str(s.bg, "none");
    const outer = [
      bg === "surface"
        ? "background:var(--card)"
        : bg === "muted"
          ? "background:var(--muted)"
          : "",
      `padding:${num(s.padY, 0)}px 16px`,
    ]
      .filter(Boolean)
      .join(";");
    const children = (node.children ?? []).map(nodeHtml).join("");
    return `<section style="${outer}"><div style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:${num(s.gap, 24)}px;max-width:${width};margin:0 auto">${children}</div></section>`;
  }
  if (node.el === "container" || node.el === "grid") {
    const s = node.settings;
    const layout = str(s.layout, node.el === "grid" ? "grid" : "flex");
    const inner =
      layout === "grid"
        ? `display:grid;grid-template-columns:repeat(${num(s.columns, 3)},minmax(0,1fr))`
        : `display:flex;flex-direction:${str(s.direction, "column")};flex-wrap:${str(s.wrap, "nowrap")}`;
    const width =
      str(s.contentWidth, "boxed") === "full"
        ? "none"
        : `${num(s.maxWidth, 1140)}px`;
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
  const slots = studioSlots(doc);
  return [...slots.header, ...slots.main, ...slots.footer]
    .map(nodeHtml)
    .join("\n");
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
  walk(doc.header ?? []);
  walk(doc.root);
  walk(doc.footer ?? []);
  return out.join("\n");
}

export function countNodes(nodes: StudioNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + 1 + countNodes(node.children ?? []),
    0,
  );
}
