/**
 * Phase 14 — templates library.
 *
 * Blocks (a single container you drop into a page), Pages (a whole document)
 * and My templates (saved locally, exportable as JSON). Categories match the
 * left list in the Elementor library modal.
 */
import { newWidgetNode } from "./catalog";
import {
  emptyStudioDoc,
  newContainer,
  parseStudioDoc,
  uid,
  type StudioDoc,
  type StudioNode,
} from "./model";

export const TEMPLATE_CATEGORIES = [
  "hero",
  "features",
  "pricing",
  "testimonials",
  "faq",
  "cta",
  "team",
  "stats",
  "subscribe",
  "header",
  "footer",
  "404",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type TemplateKind = "block" | "page" | "mine";

export type StudioTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  category: TemplateCategory;
  /** Blocks carry one container; pages carry a whole root. */
  nodes: StudioNode[];
  favourite?: boolean;
  savedAt?: number;
};

function heading(text: string, level = 2, size = 36): StudioNode {
  const node = newWidgetNode("heading");
  node.settings = { ...node.settings, text, level, fontSize: size, textAlign: "center" };
  return node;
}

function paragraph(text: string): StudioNode {
  const node = newWidgetNode("text");
  node.settings = { ...node.settings, text, textAlign: "center" };
  return node;
}

function button(label: string, href = "/products"): StudioNode {
  const node = newWidgetNode("button");
  node.settings = { ...node.settings, label, href, textAlign: "center" };
  return node;
}

function iconBox(title: string, text: string): StudioNode {
  const node = newWidgetNode("icon-box");
  node.settings = { ...node.settings, title, text };
  return node;
}

function row(children: StudioNode[]): StudioNode {
  return newContainer({ layout: "flex", direction: "row", gap: 24, wrap: "wrap", contentWidth: "boxed" }, children);
}

function column(children: StudioNode[], basis?: number): StudioNode {
  return newContainer({ layout: "flex", direction: "column", gap: 12, contentWidth: "full", basis }, children);
}

export function builtInTemplates(): StudioTemplate[] {
  const hero = newContainer({ layout: "flex", direction: "column", gap: 16, contentWidth: "boxed" }, [
    heading("Everything your shop needs, in one place", 1, 48),
    paragraph("Launch, sell and deliver without stitching five tools together."),
    button("Start free"),
  ]);

  const features = row([
    column([iconBox("Fast delivery", "Same-day dispatch inside Dhaka.")], 33),
    column([iconBox("Safe payments", "bKash, Nagad, card and cash on delivery.")], 33),
    column([iconBox("Real support", "Bangla-speaking humans, seven days a week.")], 33),
  ]);

  const pricing = row([
    column([heading("Starter", 3, 24), paragraph("৳0 / month"), button("Choose", "/pricing")], 33),
    column([heading("Growth", 3, 24), paragraph("৳1,500 / month"), button("Choose", "/pricing")], 33),
    column([heading("Scale", 3, 24), paragraph("৳4,900 / month"), button("Choose", "/pricing")], 33),
  ]);

  const testimonialNode = newWidgetNode("testimonial");
  const testimonials = row([column([testimonialNode], 100)]);

  const faqNode = newWidgetNode("accordion");
  const faq = newContainer({ layout: "flex", direction: "column", gap: 12 }, [heading("Questions", 2, 32), faqNode]);

  const cta = newContainer({ layout: "flex", direction: "column", gap: 16 }, [
    heading("Ready when you are", 2, 36),
    button("Open your store", "/signup"),
  ]);

  const statsRow = row(
    ["Orders shipped", "Active stores", "Districts covered"].map((title) => {
      const counter = newWidgetNode("counter");
      counter.settings = { ...counter.settings, title };
      return column([counter], 33);
    }),
  );

  const subscribe = newContainer({ layout: "flex", direction: "column", gap: 12 }, [
    heading("Get the weekly merchant note", 2, 28),
    paragraph("One email, every Sunday. No noise."),
    button("Subscribe", "/newsletter"),
  ]);

  const teamRow = row(
    ["Operations", "Support", "Engineering"].map((title) => column([iconBox(title, "Meet the people behind it.")], 33)),
  );

  const notFound = newContainer({ layout: "flex", direction: "column", gap: 12 }, [
    heading("404 — page not found", 1, 44),
    paragraph("The page moved or never existed."),
    button("Back to shop", "/"),
  ]);

  const blocks: StudioTemplate[] = [
    { id: "b-hero", name: "Centred hero", kind: "block", category: "hero", nodes: [hero] },
    { id: "b-features", name: "Three benefits", kind: "block", category: "features", nodes: [features] },
    { id: "b-pricing", name: "Three plans", kind: "block", category: "pricing", nodes: [pricing] },
    { id: "b-testimonials", name: "Customer quote", kind: "block", category: "testimonials", nodes: [testimonials] },
    { id: "b-faq", name: "FAQ accordion", kind: "block", category: "faq", nodes: [faq] },
    { id: "b-cta", name: "Closing call to action", kind: "block", category: "cta", nodes: [cta] },
    { id: "b-stats", name: "Three counters", kind: "block", category: "stats", nodes: [statsRow] },
    { id: "b-subscribe", name: "Newsletter", kind: "block", category: "subscribe", nodes: [subscribe] },
    { id: "b-team", name: "Team columns", kind: "block", category: "team", nodes: [teamRow] },
    { id: "b-404", name: "404 block", kind: "block", category: "404", nodes: [notFound] },
  ];

  const pages: StudioTemplate[] = [
    { id: "p-landing", name: "Product landing", kind: "page", category: "hero", nodes: [hero, features, pricing, cta] },
    { id: "p-about", name: "About us", kind: "page", category: "team", nodes: [hero, teamRow, statsRow, cta] },
    { id: "p-faq", name: "Help centre", kind: "page", category: "faq", nodes: [heading("Help centre", 1, 44), faq, cta] },
  ];

  return [...blocks, ...pages];
}

export function filterTemplates(
  templates: StudioTemplate[],
  options: { kind?: TemplateKind; category?: TemplateCategory | "all"; query?: string; favouritesOnly?: boolean } = {},
): StudioTemplate[] {
  const query = (options.query ?? "").trim().toLowerCase();
  return templates.filter((template) => {
    if (options.kind && template.kind !== options.kind) return false;
    if (options.category && options.category !== "all" && template.category !== options.category) return false;
    if (options.favouritesOnly && !template.favourite) return false;
    if (query && !template.name.toLowerCase().includes(query) && !template.category.includes(query)) return false;
    return true;
  });
}

/** Clone the template's nodes with fresh ids so repeat inserts never collide. */
export function instantiate(template: StudioTemplate): StudioNode[] {
  const reid = (node: StudioNode): StudioNode => ({
    ...structuredClone(node),
    id: uid(),
    children: node.children?.map(reid),
  });
  return template.nodes.map(reid);
}

export function saveAsTemplate(name: string, nodes: StudioNode[], category: TemplateCategory = "hero"): StudioTemplate {
  return {
    id: `mine-${uid()}`,
    name: name.trim() || "Untitled template",
    kind: "mine",
    category,
    nodes: structuredClone(nodes),
    savedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */

export function exportDocJson(doc: StudioDoc): string {
  return JSON.stringify({ kind: "fq-studio-doc", version: 2, doc }, null, 2);
}

export function importDocJson(raw: string): StudioDoc | null {
  try {
    const parsed = JSON.parse(raw) as { doc?: unknown; root?: unknown };
    const candidate = parsed.doc ?? parsed;
    return parseStudioDoc(candidate);
  } catch {
    return null;
  }
}

export function exportTemplateJson(template: StudioTemplate): string {
  return JSON.stringify({ kind: "fq-studio-template", version: 2, template }, null, 2);
}

export function importTemplateJson(raw: string): StudioTemplate | null {
  try {
    const parsed = JSON.parse(raw) as { template?: StudioTemplate };
    const template = parsed.template ?? (parsed as unknown as StudioTemplate);
    if (!template || !Array.isArray(template.nodes)) return null;
    return { ...template, id: template.id || `mine-${uid()}`, kind: "mine" };
  } catch {
    return null;
  }
}

export function docFromTemplate(template: StudioTemplate, title?: string): StudioDoc {
  const doc = emptyStudioDoc(title ?? template.name);
  return { ...doc, root: instantiate(template) };
}

const STORE_KEY = "fq.studio.templates.v1";

export function loadMyTemplates(storage?: Storage): StudioTemplate[] {
  const store = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!store) return [];
  try {
    const raw = store.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StudioTemplate[]) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => Array.isArray(t?.nodes)) : [];
  } catch {
    return [];
  }
}

export function persistMyTemplates(templates: StudioTemplate[], storage?: Storage): void {
  const store = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!store) return;
  try {
    store.setItem(STORE_KEY, JSON.stringify(templates.filter((t) => t.kind === "mine")));
  } catch {
    /* quota or private mode — templates stay in memory for this session */
  }
}
