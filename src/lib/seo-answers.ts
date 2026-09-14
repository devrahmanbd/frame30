/**
 * Phase 7.4 — content / AI-answer surfaces.
 *
 * Answer engines quote HTML, not pictures of HTML. This module owns the rules
 * that keep an answerable page answerable:
 *
 *  - answer-first blocks (spec tables, comparisons, glossaries, guides) must be
 *    crawlable text in the document, never trapped inside a sandboxed custom
 *    HTML island and never an image of a table
 *  - a page indexed in `bn` must carry real বাংলা copy, not English wearing a
 *    `_bn` key
 *  - guides carry author / expertise metadata, because a buying guide with no
 *    named author is an unattributed opinion to both readers and engines
 *  - a store can describe its own catalogue to LLM crawlers (`llms.txt`), but
 *    only when the merchant opted in
 *  - store-wide title/description templates interpolate a fixed variable set
 *
 * Pure module: no React, no network, no Supabase. Types only from builder-ast,
 * so this stays importable from both the lint path and the renderer.
 */
import type { Section, SectionType } from "./builder-ast";

export type AnswerIssue = {
  level: "warn" | "error";
  sectionId: string | null;
  message: string;
};

/* ---------------------------- answer-first blocks --------------------------- */

/**
 * Widgets whose whole value is that a crawler can read them. Extending this
 * list opts a widget into the crawlability lint below.
 */
export const ANSWER_FIRST_WIDGETS = [
  "faq",
  "spec_table",
  "compare_table",
  "ingredient_list",
  "ingredient_glossary",
  "buying_guide",
  "how_to_use",
  "size_guide",
  "warranty_panel",
  "product_qna",
] as const satisfies readonly SectionType[];

const ANSWER_SET = new Set<string>(ANSWER_FIRST_WIDGETS);

export function isAnswerFirst(type: SectionType | string): boolean {
  return ANSWER_SET.has(type);
}

/**
 * Prop keys that carry the readable answer, per widget. `#` expands to 1..8.
 * A widget with none of these filled renders chrome around nothing.
 */
const ANSWER_KEYS: Record<string, string[]> = {
  faq: ["q#", "a#"],
  spec_table: ["r#Label", "r#Value"],
  compare_table: ["r#Label"],
  ingredient_list: ["i#Name"],
  ingredient_glossary: ["i#Name", "g#Term"],
  buying_guide: ["body", "heading"],
  how_to_use: ["s#Title", "s#Body"],
  size_guide: ["r#Label", "body", "heading"],
  warranty_panel: ["body", "heading", "t#Body"],
  product_qna: [],
};

/** Widgets that resolve their answer from live data, so empty props are fine. */
const DATA_BACKED = new Set(["product_qna", "spec_table", "compare_table"]);

function expand(keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    if (!key.includes("#")) {
      out.push(key);
      continue;
    }
    for (let i = 1; i <= 8; i += 1) out.push(key.replace("#", String(i)));
  }
  return out;
}

function hasText(props: Record<string, unknown>, keys: string[]): boolean {
  return expand(keys).some((key) => String(props[key] ?? "").trim().length > 0);
}

/**
 * Container types whose children are not part of the indexable document:
 * merchant-authored HTML is sandboxed at render time, so anything inside it is
 * invisible to a crawler even though the merchant can see it in the preview.
 */
export const OPAQUE_CONTAINERS = new Set(["html"]);

/**
 * Phase 5 — client-only containers. Their subtree is mounted by an interaction
 * (opening a quick-view overlay), so it is not part of the document a crawler
 * or answer engine reads. Same verdict as a sandboxed island: error.
 */
export const CLIENT_ONLY_CONTAINERS = new Set(["quick_view"]);

/**
 * Deferred-panel containers. The markup exists but only one panel is exposed,
 * so an answer buried in a non-default tab is discounted rather than invisible:
 * warn, don't block.
 */
export const DEFERRED_CONTAINERS = new Set(["tabs"]);

/** Detects "a picture of a table" — an image standing in for the answer. */
const IMAGE_VALUE = /\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?|#|$)/i;

/**
 * Crawlability of every answer-first block in a tree. Walks children so nesting
 * is visible; `flattenAst` output loses the parent chain the rule needs.
 */
export function answerBlockIssues(nodes: Section[] | null | undefined): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const walk = (list: Section[], opaqueAncestor: string | null, deferredAncestor: string | null) => {
    for (const section of list) {
      if (section.invalid) continue;
      if (isAnswerFirst(section.type)) {
        if (opaqueAncestor) {
          issues.push({
            level: "error",
            sectionId: section.id,
            message:
              opaqueAncestor === "html"
                ? "Answer block renders inside a custom HTML island — move it out so crawlers and answer engines can read it."
                : "Answer block renders inside a client-only container — move it out so crawlers and answer engines can read it.",
          });
        } else if (deferredAncestor) {
          issues.push({
            level: "warn",
            sectionId: section.id,
            message:
              "Answer block sits inside a tab panel — answer engines discount content that is not visible by default.",
          });
        }
        const keys = ANSWER_KEYS[section.type] ?? [];
        if (keys.length && !hasText(section.props, keys) && !DATA_BACKED.has(section.type)) {
          issues.push({
            level: "error",
            sectionId: section.id,
            message: "Answer block has no readable text — an empty block earns no answer.",
          });
        }
        const imageOnly =
          !hasText(section.props, keys) &&
          Object.values(section.props).some((v) => typeof v === "string" && IMAGE_VALUE.test(v));
        if (imageOnly) {
          issues.push({
            level: "error",
            sectionId: section.id,
            message: "Answer block is an image — spec and comparison content must be real HTML text.",
          });
        }
      }
      const children = (section as { children?: Section[] }).children;
      if (children?.length) {
        const opaque =
          OPAQUE_CONTAINERS.has(section.type) || CLIENT_ONLY_CONTAINERS.has(section.type)
            ? section.type
            : null;
        walk(
          children,
          opaqueAncestor ?? opaque,
          deferredAncestor ?? (DEFERRED_CONTAINERS.has(section.type) ? section.type : null),
        );
      }
    }
  };
  walk(nodes ?? [], null, null);
  return issues;
}

/* ------------------------------ author metadata ---------------------------- */

/** Guides make claims, so they carry attribution. */
export const AUTHORED_WIDGETS = ["buying_guide", "how_to_use"] as const satisfies readonly SectionType[];

export const AUTHOR_KEYS = ["author", "authorRole", "reviewedBy", "reviewedOn"] as const;

export type GuideAuthor = {
  name: string;
  role: string;
  reviewedBy: string;
  reviewedOn: string;
};

export function readGuideAuthor(props: Record<string, unknown>): GuideAuthor {
  const s = (key: string) => String(props[key] ?? "").trim();
  return {
    name: s("author"),
    role: s("authorRole"),
    reviewedBy: s("reviewedBy"),
    reviewedOn: s("reviewedOn"),
  };
}

/** Trust-signal lint: missing attribution warns, a broken review date blocks. */
export function authorIssues(sections: Section[]): AnswerIssue[] {
  const authored = new Set<string>(AUTHORED_WIDGETS);
  const issues: AnswerIssue[] = [];
  for (const section of sections) {
    if (section.invalid || !authored.has(section.type)) continue;
    const author = readGuideAuthor(section.props);
    if (!author.name) {
      issues.push({
        level: "warn",
        sectionId: section.id,
        message: "Guide has no author — named expertise is a trust signal for readers and answer engines.",
      });
    } else if (!author.role) {
      issues.push({
        level: "warn",
        sectionId: section.id,
        message: "Guide author has no stated expertise (role or credential).",
      });
    }
    if (author.reviewedOn) {
      const ts = Date.parse(author.reviewedOn);
      if (Number.isNaN(ts)) {
        issues.push({
          level: "error",
          sectionId: section.id,
          message: "Review date is not a valid date.",
        });
      } else if (ts > Date.now() + 86_400_000) {
        issues.push({
          level: "error",
          sectionId: section.id,
          message: "Review date is in the future.",
        });
      }
    }
  }
  return issues;
}

/** The `author` / `reviewedBy` / `dateModified` fragment for a guide's JSON-LD. */
export function authorJsonLd(props: Record<string, unknown>): Record<string, unknown> {
  const a = readGuideAuthor(props);
  const out: Record<string, unknown> = {};
  if (a.name) {
    out["author"] = {
      "@type": "Person",
      name: a.name,
      ...(a.role ? { jobTitle: a.role } : {}),
    };
  }
  if (a.reviewedBy) {
    out["reviewedBy"] = { "@type": "Person", name: a.reviewedBy };
  }
  if (a.reviewedOn && !Number.isNaN(Date.parse(a.reviewedOn))) {
    out["dateModified"] = new Date(a.reviewedOn).toISOString().slice(0, 10);
  }
  return out;
}

/* ----------------------------- bilingual parity ---------------------------- */

/** Bengali block, including its digits and conjunct marks. */
export const BANGLA_RE = /[\u0980-\u09FF]/;

export function hasBangla(value: string): boolean {
  return BANGLA_RE.test(value);
}

/** Share of letters that are Bengali — English pasted into a `_bn` field is ~0. */
export function banglaShare(value: string): number {
  const letters = value.replace(/[^\p{L}\p{Nd}]/gu, "");
  if (!letters) return 0;
  let bn = 0;
  for (const ch of letters) if (BANGLA_RE.test(ch)) bn += 1;
  return bn / letters.length;
}

export type ParityField = { key: string; label: string; en: string; bn: string };

export type ParityFinding = { level: "warn" | "error"; key: string; message: string };

export type ParityReport = {
  total: number;
  translated: number;
  /** 0–100, rounded. */
  percent: number;
  /** True when coverage meets the merchant's threshold and no copy is fake-bn. */
  ok: boolean;
  findings: ParityFinding[];
};

/**
 * Parity for one indexed page. A `bn` page that falls back to English is worse
 * than an untranslated one: the crawler indexes the বাংলা URL and finds English.
 */
export function parityReport(fields: ParityField[], threshold = 90): ParityReport {
  const findings: ParityFinding[] = [];
  const scored = fields.filter((f) => f.en.trim() || f.bn.trim());
  let translated = 0;
  for (const field of scored) {
    const en = field.en.trim();
    const bn = field.bn.trim();
    if (!bn) {
      findings.push({ level: "error", key: field.key, message: `${field.label}: no বাংলা copy — the page falls back to English.` });
      continue;
    }
    if (!en) {
      findings.push({ level: "error", key: field.key, message: `${field.label}: English copy is missing.` });
      continue;
    }
    if (banglaShare(bn) < 0.3) {
      findings.push({
        level: "error",
        key: field.key,
        message: `${field.label}: বাংলা field holds English text — machine or copy-paste fallback, not a translation.`,
      });
      continue;
    }
    translated += 1;
  }
  const percent = scored.length ? Math.round((translated / scored.length) * 100) : 100;
  if (scored.length && percent < threshold) {
    findings.push({
      level: "warn",
      key: "_coverage",
      message: `বাংলা coverage is ${percent}% — below the ${threshold}% threshold for a bn-indexed page.`,
    });
  }
  return { total: scored.length, translated, percent, ok: findings.length === 0, findings };
}

/**
 * AST-level parity: a `_bn` prop that contains no Bengali at all is a fallback
 * masquerading as a translation, which the coverage lint alone cannot see.
 */
export function localeParityIssues(sections: Section[]): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  for (const section of sections) {
    if (section.invalid) continue;
    for (const [key, value] of Object.entries(section.props)) {
      if (!key.endsWith("_bn") || typeof value !== "string") continue;
      const bn = value.trim();
      if (!bn || bn.length < 3) continue;
      if (banglaShare(bn) >= 0.3) continue;
      issues.push({
        level: "warn",
        sectionId: section.id,
        message: `${key.slice(0, -3)}: বাংলা field contains no বাংলা script — a bn-indexed page would serve English.`,
      });
    }
  }
  return issues;
}

/* -------------------------- title/description templates -------------------- */

export type SeoTemplateVars = {
  store: string;
  title: string;
  category: string;
  brand: string;
  price: string;
  city: string;
};

export const SEO_TEMPLATE_VARS: (keyof SeoTemplateVars)[] = [
  "store",
  "title",
  "category",
  "brand",
  "price",
  "city",
];

const VAR_RE = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/** Unknown or malformed variables, reported before a template is saved. */
export function templateIssues(template: string): string[] {
  const issues: string[] = [];
  const known = new Set<string>(SEO_TEMPLATE_VARS);
  for (const match of template.matchAll(VAR_RE)) {
    if (!known.has(match[1]!)) issues.push(`Unknown variable {{${match[1]}}}.`);
  }
  const braces = (template.match(/\{/g)?.length ?? 0) + (template.match(/\}/g)?.length ?? 0);
  if (braces % 4 !== 0) issues.push("Unbalanced {{ }} in template.");
  return issues;
}

/**
 * Renders a template. Empty variables collapse together with their surrounding
 * separator, so a product with no brand never yields "Shirt |  | Store".
 */
export function renderSeoTemplate(
  template: string,
  vars: Partial<SeoTemplateVars>,
  max?: number,
): string {
  const filled = template.replace(VAR_RE, (_m, name: string) => {
    const value = (vars as Record<string, string | undefined>)[name];
    return (value ?? "").trim();
  });
  let out = filled
    .replace(/([|·–—-])(?:\s*\1)+/g, "$1")
    .replace(/^\s*[|·–—-]\s*/, "")
    .replace(/\s*[|·–—-]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (max && out.length > max) {
    out = `${out.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }
  return out;
}

/* ---------------------------------- llms.txt -------------------------------- */

export type LlmsEntry = { title: string; path: string; note?: string };

export type LlmsInput = {
  storeName: string;
  /** Absolute origin, no trailing slash. */
  origin: string;
  slug: string;
  tagline?: string;
  currency?: string;
  productCount?: number;
  collections?: LlmsEntry[];
  pages?: LlmsEntry[];
  guides?: LlmsEntry[];
  /** Locales the store actually publishes content in. */
  locales?: string[];
  contact?: string;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * The llms.txt body: a markdown map of what the catalogue contains and where it
 * lives, so an answer engine can orient without crawling every facet URL.
 * Rendered only for stores that opted AI crawlers in — the caller enforces it.
 */
export function renderLlmsTxt(input: LlmsInput): string {
  const origin = input.origin.replace(/\/+$/, "");
  const base = `${origin}/store/${input.slug}`;
  const abs = (path: string) => (path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? path : `/${path}`}`);
  const lines: string[] = [`# ${clean(input.storeName)}`, ""];
  if (input.tagline) lines.push(`> ${clean(input.tagline)}`, "");

  const facts: string[] = [`Storefront: ${base}`];
  if (typeof input.productCount === "number") facts.push(`Products listed: ${input.productCount}`);
  if (input.currency) facts.push(`Prices in ${input.currency}`);
  if (input.locales?.length) facts.push(`Content locales: ${input.locales.join(", ")}`);
  if (input.contact) facts.push(`Contact: ${clean(input.contact)}`);
  lines.push(...facts.map((f) => `- ${f}`), "");

  const section = (heading: string, entries: LlmsEntry[] | undefined) => {
    if (!entries?.length) return;
    lines.push(`## ${heading}`, "");
    for (const entry of entries) {
      lines.push(`- [${clean(entry.title)}](${abs(entry.path)})${entry.note ? `: ${clean(entry.note)}` : ""}`);
    }
    lines.push("");
  };
  section("Collections", input.collections);
  section("Guides and answers", input.guides);
  section("Pages", input.pages);

  lines.push("## Machine-readable", "");
  lines.push(`- [Sitemap index](${base}/sitemap.xml)`);
  lines.push(`- [Crawl policy](${base}/robots.txt)`);
  lines.push("");
  lines.push(
    "Product pages carry Product, Offer and AggregateRating structured data; guides carry HowTo/Article with author attribution. Prices and stock change often — re-fetch before quoting.",
  );
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
