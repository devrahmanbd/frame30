/**
 * Phase 7 — weight discipline: the standing gate over everything the SEO
 * roadmap shipped.
 *
 * WordPress SEO plugins are not slow because metadata is expensive. They are
 * slow because the *admin* leaks into the front end: analysis bundles, score
 * widgets, schema builders and tag managers all end up reachable from a page a
 * shopper loads. This module encodes the four rules that stop that happening
 * here, as pure data and pure functions so the CI gate
 * (`scripts/seo-weight-gate.mjs`), the contract test and the merchant-facing
 * admin desk can never quote different numbers:
 *
 *   1. §7.1 head payload budget — metadata + JSON-LD for any page stays under
 *      8 kB gzipped, and a failure names the offending graph.
 *   2. §7.2 zero SEO JS on the storefront — no analysis/editor/score module may
 *      be reachable from a storefront route's import graph.
 *   3. §7.3 admin chunk budget — the SEO panel and editor route have their own
 *      budget entries and the analysis worker is lazily imported.
 *   4. §7.4/7.5 query + render-path discipline — every render-path read is one
 *      bounded query behind the `renderRead` contract.
 *
 * Client-safe on purpose: the admin desk renders this, and importing anything
 * server-only here would itself violate rule 2. Real gzip lives in
 * `seo-weight.server.ts`; this module ships a deterministic estimator so the
 * same check can run in a browser worker with no network.
 */
import type { HeadOutput, LinkTag, MetaTag, ScriptTag } from "./theme-seo";

/* ========================================================================== *
 * Budgets
 * ========================================================================== */

/**
 * Head payload budget for any single rendered page.
 *
 * `gzBytes` is the contract from the roadmap. The raw ceilings exist because a
 * pathological graph can compress beautifully and still cost parse time and
 * memory on a 2015 Android phone, which is the device this platform targets.
 */
export const HEAD_BUDGET = {
  /** metadata + JSON-LD, gzipped, per page. */
  gzBytes: 8 * 1024,
  /** Uncompressed ceiling for the same payload. */
  rawBytes: 48 * 1024,
  /** Uncompressed ceiling for all JSON-LD on the page. */
  jsonLdRawBytes: 24 * 1024,
  /** Uncompressed ceiling for a single graph — the "offending graph" rule. */
  graphRawBytes: 8 * 1024,
  /** Distinct `<script type="application/ld+json">` blocks allowed. */
  maxGraphs: 6,
  /** Sanity caps: past these, something is generating tags in a loop. */
  maxMetaTags: 40,
  maxLinkTags: 24,
} as const;

/**
 * Admin route budgets (gzipped JS). These are deliberately generous compared
 * with the storefront: the admin is an application, not a landing page. What
 * they buy is a *ratchet* — a new editor dependency has to be argued for.
 */
export const ADMIN_CHUNK_BUDGET: Record<string, number> = {
  "src/routes/_authenticated/admin/marketing/seo.tsx": 280 * 1024,
  "src/routes/_authenticated/admin/marketing/articles.tsx": 320 * 1024,
};

/** The analysis worker is allowed to exist, but only lazily and only this big. */
export const ANALYSIS_WORKER_BUDGET = { gzBytes: 40 * 1024, module: "src/lib/seo-analysis.worker.ts" };

/** Render-path reads must be bounded in both time and rows. */
export const RENDER_READ_CONTRACT = {
  maxTimeoutMs: 4_000,
  maxRowLimit: 5_000,
  requiredHelper: "renderRead",
  helperModule: "./render-read.server",
} as const;

/* ========================================================================== *
 * Findings
 * ========================================================================== */

export type WeightSeverity = "error" | "warn" | "info";

export type WeightFinding = {
  /** Stable machine code — dashboards and tests match on this, not on prose. */
  code: string;
  severity: WeightSeverity;
  /** What broke, in English and বাংলা: merchants read the admin in both. */
  message: string;
  messageBn: string;
  /** The thing to go and fix: a graph @type, a module path, a route. */
  offender?: string;
  /** Where it was measured. */
  scope?: string;
  /** Measured vs allowed, when the finding is a budget. */
  actual?: number;
  budget?: number;
};

const finding = (f: WeightFinding): WeightFinding => f;

export function isBlocking(findings: WeightFinding[]): boolean {
  return findings.some((f) => f.severity === "error");
}

/** 100 minus a weighted penalty; floored at 0. Advisory, like every score here. */
export function weightScore(findings: WeightFinding[]): number {
  const penalty = findings.reduce(
    (sum, f) => sum + (f.severity === "error" ? 25 : f.severity === "warn" ? 8 : 2),
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}

/* ========================================================================== *
 * §7.1 — head payload measurement
 * ========================================================================== */

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

/** Byte length of a string as UTF-8 — Bengali metadata is 3 bytes a character. */
export function byteLength(text: string): number {
  if (encoder) return encoder.encode(text).length;
  let bytes = 0;
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderMeta(tag: MetaTag): string {
  if (tag["title"] !== undefined) return `<title>${escapeAttr(String(tag["title"]))}</title>`;
  const attrs = Object.entries(tag)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(" ");
  return `<meta ${attrs}>`;
}

function renderLink(tag: LinkTag): string {
  const attrs = Object.entries(tag)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(" ");
  return `<link ${attrs}>`;
}

function renderScript(tag: ScriptTag): string {
  return `<script type="${escapeAttr(tag.type)}">${tag.children}</script>`;
}

/**
 * Exactly what the document ships in `<head>` for this page, in emission order.
 * Deterministic: the same head input always produces the same bytes, so a byte
 * delta in CI is a real regression and not a serialisation artefact.
 */
export function serializeHead(head: HeadOutput): string {
  return [
    ...head.meta.map(renderMeta),
    ...head.links.map(renderLink),
    ...head.scripts.map(renderScript),
  ].join("\n");
}

export type GraphMeasurement = {
  /** `@type` of the graph, or `unknown` when it does not declare one. */
  type: string;
  rawBytes: number;
  /** True when the JSON did not parse — a broken graph is worse than a big one. */
  invalid: boolean;
  /** Node count, a proxy for how much a crawler has to walk. */
  nodes: number;
};

export type HeadMeasurement = {
  route: string;
  html: string;
  rawBytes: number;
  gzBytes: number;
  metaBytes: number;
  linkBytes: number;
  jsonLdBytes: number;
  metaCount: number;
  linkCount: number;
  graphs: GraphMeasurement[];
};

function countNodes(value: unknown, depth = 0): number {
  if (depth > 12 || value === null || typeof value !== "object") return 0;
  if (Array.isArray(value)) {
    return (value as unknown[]).reduce<number>((n, v) => n + countNodes(v, depth + 1), 0);
  }
  const values: unknown[] = Object.values(value as Record<string, unknown>);
  return 1 + values.reduce<number>((n, v) => n + countNodes(v, depth + 1), 0);
}

export function measureGraph(script: ScriptTag): GraphMeasurement {
  const rawBytes = byteLength(script.children);
  try {
    const parsed = JSON.parse(script.children) as Record<string, unknown>;
    const type = parsed["@type"];
    return {
      type: typeof type === "string" ? type : Array.isArray(type) ? String(type[0] ?? "unknown") : "unknown",
      rawBytes,
      invalid: false,
      nodes: countNodes(parsed),
    };
  } catch {
    return { type: "unknown", rawBytes, invalid: true, nodes: 0 };
  }
}

/** Compressor injection point: node:zlib on the server, estimator elsewhere. */
export type Compressor = (text: string) => number;

/**
 * Deterministic gzip *estimate* for environments without zlib (the admin panel,
 * a worker). It models what DEFLATE actually does — an LZ77 pass over a 32 kB
 * window followed by entropy coding — instead of guessing a flat ratio, because
 * head payloads are extremely repetitive (`og:` prefixes, the same canonical
 * URL five times) and a flat ratio is wrong by 2× on exactly that shape.
 *
 * It is never used to *pass* a budget check on the server: `seo-weight.server`
 * always measures real gzip. It exists so the merchant-facing number in the
 * admin is close enough to be actionable offline.
 */
export function estimateGzipBytes(text: string): number {
  if (!text) return 20;
  const MIN_MATCH = 4;
  const WINDOW = 32 * 1024;
  const literals: number[] = [];
  let matches = 0;
  let i = 0;
  while (i < text.length) {
    const start = Math.max(0, i - WINDOW);
    let bestLen = 0;
    // Bounded greedy search: cost is capped so this stays sane on 48 kB heads.
    const probe = text.slice(i, i + MIN_MATCH);
    if (probe.length === MIN_MATCH) {
      let at = text.indexOf(probe, start);
      let guards = 0;
      while (at !== -1 && at < i && guards < 64) {
        let len = MIN_MATCH;
        while (len < 258 && i + len < text.length && text[at + len] === text[i + len]) len += 1;
        if (len > bestLen) bestLen = len;
        at = text.indexOf(probe, at + 1);
        guards += 1;
      }
    }
    if (bestLen >= MIN_MATCH) {
      matches += 1;
      i += bestLen;
    } else {
      literals.push(text.charCodeAt(i));
      i += 1;
    }
  }
  // Shannon entropy of the literal stream ≈ what Huffman achieves on it.
  const freq = new Map<number, number>();
  for (const code of literals) freq.set(code, (freq.get(code) ?? 0) + 1);
  let entropyBits = 0;
  for (const count of freq.values()) {
    const p = count / literals.length;
    entropyBits += -count * Math.log2(p);
  }
  // ~24 bits per length/distance pair, plus the gzip header and trailer.
  const bits = entropyBits + matches * 24;
  return Math.max(20, Math.round(bits / 8) + 18);
}

export function measureHead(route: string, head: HeadOutput, compress: Compressor = estimateGzipBytes): HeadMeasurement {
  const html = serializeHead(head);
  const metaBytes = head.meta.reduce((n, t) => n + byteLength(renderMeta(t)), 0);
  const linkBytes = head.links.reduce((n, t) => n + byteLength(renderLink(t)), 0);
  const graphs = head.scripts.map(measureGraph);
  return {
    route,
    html,
    rawBytes: byteLength(html),
    gzBytes: compress(html),
    metaBytes,
    linkBytes,
    jsonLdBytes: graphs.reduce((n, g) => n + g.rawBytes, 0),
    metaCount: head.meta.length,
    linkCount: head.links.length,
    graphs,
  };
}

/**
 * Budget verdict for one page. Every failure names the offender, because
 * "your head is too big" is not an action a merchant can take.
 */
export function checkHeadBudget(measurement: HeadMeasurement): WeightFinding[] {
  const out: WeightFinding[] = [];
  const scope = measurement.route;
  const heaviest = [...measurement.graphs].sort((a, b) => b.rawBytes - a.rawBytes)[0];

  if (measurement.gzBytes > HEAD_BUDGET.gzBytes) {
    out.push(
      finding({
        code: "head:gz_over_budget",
        severity: "error",
        scope,
        offender: heaviest ? `${heaviest.type} (${heaviest.rawBytes} B)` : "meta tags",
        actual: measurement.gzBytes,
        budget: HEAD_BUDGET.gzBytes,
        message: `Head payload is ${formatKb(measurement.gzBytes)} gzipped, over the ${formatKb(
          HEAD_BUDGET.gzBytes,
        )} budget. Heaviest graph: ${heaviest?.type ?? "none"}.`,
        messageBn: `হেড পেলোড ${formatKb(measurement.gzBytes)} (gzip), বাজেট ${formatKb(
          HEAD_BUDGET.gzBytes,
        )}. সবচেয়ে বড় গ্রাফ: ${heaviest?.type ?? "নেই"}।`,
      }),
    );
  }
  if (measurement.rawBytes > HEAD_BUDGET.rawBytes) {
    out.push(
      finding({
        code: "head:raw_over_budget",
        severity: "warn",
        scope,
        actual: measurement.rawBytes,
        budget: HEAD_BUDGET.rawBytes,
        message: `Uncompressed head is ${formatKb(measurement.rawBytes)}; parsing cost is paid even when it gzips well.`,
        messageBn: `আনকমপ্রেসড হেড ${formatKb(measurement.rawBytes)}; gzip ছোট হলেও পার্সিং খরচ থেকেই যায়।`,
      }),
    );
  }
  if (measurement.jsonLdBytes > HEAD_BUDGET.jsonLdRawBytes) {
    out.push(
      finding({
        code: "head:jsonld_over_budget",
        severity: "error",
        scope,
        offender: heaviest?.type,
        actual: measurement.jsonLdBytes,
        budget: HEAD_BUDGET.jsonLdRawBytes,
        message: `JSON-LD totals ${formatKb(measurement.jsonLdBytes)} across ${measurement.graphs.length} graphs.`,
        messageBn: `${measurement.graphs.length}টি গ্রাফে JSON-LD মোট ${formatKb(measurement.jsonLdBytes)}।`,
      }),
    );
  }
  for (const graph of measurement.graphs) {
    if (graph.invalid) {
      out.push(
        finding({
          code: "head:jsonld_invalid",
          severity: "error",
          scope,
          offender: graph.type,
          message: "A JSON-LD block is not valid JSON and will be dropped by every parser.",
          messageBn: "একটি JSON-LD ব্লক বৈধ JSON নয়; সব পার্সার এটি বাদ দেবে।",
        }),
      );
      continue;
    }
    if (graph.rawBytes > HEAD_BUDGET.graphRawBytes) {
      out.push(
        finding({
          code: "head:graph_over_budget",
          severity: "error",
          scope,
          offender: graph.type,
          actual: graph.rawBytes,
          budget: HEAD_BUDGET.graphRawBytes,
          message: `${graph.type} JSON-LD is ${formatKb(graph.rawBytes)} on its own — trim its item list.`,
          messageBn: `${graph.type} JSON-LD একাই ${formatKb(graph.rawBytes)} — আইটেম তালিকা ছোট করুন।`,
        }),
      );
    }
  }
  if (measurement.graphs.length > HEAD_BUDGET.maxGraphs) {
    out.push(
      finding({
        code: "head:too_many_graphs",
        severity: "warn",
        scope,
        actual: measurement.graphs.length,
        budget: HEAD_BUDGET.maxGraphs,
        message: `${measurement.graphs.length} JSON-LD graphs on one page; ${HEAD_BUDGET.maxGraphs} is the cap.`,
        messageBn: `একটি পেজে ${measurement.graphs.length}টি JSON-LD গ্রাফ; সীমা ${HEAD_BUDGET.maxGraphs}।`,
      }),
    );
  }
  if (measurement.metaCount > HEAD_BUDGET.maxMetaTags) {
    out.push(
      finding({
        code: "head:too_many_meta",
        severity: "warn",
        scope,
        actual: measurement.metaCount,
        budget: HEAD_BUDGET.maxMetaTags,
        message: `${measurement.metaCount} meta tags emitted — something is generating tags in a loop.`,
        messageBn: `${measurement.metaCount}টি মেটা ট্যাগ — কোথাও লুপে ট্যাগ তৈরি হচ্ছে।`,
      }),
    );
  }
  if (measurement.linkCount > HEAD_BUDGET.maxLinkTags) {
    out.push(
      finding({
        code: "head:too_many_links",
        severity: "warn",
        scope,
        actual: measurement.linkCount,
        budget: HEAD_BUDGET.maxLinkTags,
        message: `${measurement.linkCount} link tags emitted; preloads and alternates should be curated.`,
        messageBn: `${measurement.linkCount}টি লিংক ট্যাগ; প্রিলোড ও অল্টারনেট বাছাই করুন।`,
      }),
    );
  }
  return out;
}

/** Duplicate `@type` in one page: two Products confuse every consumer. */
export function checkGraphSingletons(measurement: HeadMeasurement): WeightFinding[] {
  const seen = new Map<string, number>();
  for (const graph of measurement.graphs) seen.set(graph.type, (seen.get(graph.type) ?? 0) + 1);
  return [...seen.entries()]
    .filter(([type, count]) => count > 1 && type !== "unknown")
    .map(([type, count]) =>
      finding({
        code: "head:graph_duplicated",
        severity: "error",
        scope: measurement.route,
        offender: type,
        actual: count,
        budget: 1,
        message: `${count} ${type} graphs on one page — emit a single graph per type.`,
        messageBn: `একটি পেজে ${count}টি ${type} গ্রাফ — প্রতি টাইপে একটিই রাখুন।`,
      }),
    );
}

function formatKb(bytes: number): string {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
}
export { formatKb as formatWeight };

/* ========================================================================== *
 * §7.2 — zero SEO JS on the storefront
 * ========================================================================== */

/**
 * Modules that must never be reachable from a storefront route.
 *
 * Each entry says *why*, because a blanket deny list rots: the next engineer
 * needs to know whether their new import is the same class of mistake.
 */
export const STOREFRONT_FORBIDDEN: { module: string; reason: string }[] = [
  { module: "seo-analysis", reason: "Rank-Math-class scoring; admin-only, ships a rules table." },
  { module: "seo-analysis.worker", reason: "Worker entry for the score; never on a shopper's page." },
  { module: "seo-weight", reason: "This audit itself — measuring the head must not enlarge it." },
  { module: "cms-lint", reason: "Editor lint rules." },
  { module: "content-health", reason: "Crawl/graph analysis for the admin desk." },
  { module: "seo-publish-gate", reason: "Publish-time gate; irrelevant at read time." },
  { module: "blog-editor", reason: "Classic-editor surface." },
  { module: "recharts", reason: "Dashboard charting; ~90 kB gzipped." },
  { module: "@/components/admin", reason: "Admin components must not be reachable from a storefront route." },
];

/** Storefront route files the rule is enforced against. */
export const STOREFRONT_ENTRYPOINTS = [
  "src/routes/store.$slug.index.tsx",
  "src/routes/store.$slug.p.$productSlug.tsx",
  "src/routes/store.$slug.pages.$pageSlug.tsx",
  "src/routes/store.$slug.track.tsx",
  "src/routes/blog.$slug.tsx",
];

export type ImportViolation = {
  entry: string;
  module: string;
  reason: string;
  /** How the storefront ends up importing it, entry first. */
  chain: string[];
};

/**
 * Static import extraction. Deliberately ignores `await import(...)`: a lazy
 * import is code-split out of the route chunk, which is exactly the escape
 * hatch the roadmap intends (the analysis worker uses it).
 */
export function staticImports(source: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*import\s+(?:[^'"]*?from\s*)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[1]!);
  const reExport = /(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g;
  while ((m = reExport.exec(source))) out.push(m[1]!);
  return out;
}

export function isForbiddenSpecifier(specifier: string): { module: string; reason: string } | null {
  for (const rule of STOREFRONT_FORBIDDEN) {
    const normalized = specifier.replace(/^@\//, "src/").replace(/^\.\//, "");
    if (
      normalized === rule.module ||
      normalized.endsWith(`/${rule.module}`) ||
      normalized.endsWith(`/${rule.module}.ts`) ||
      normalized.endsWith(`/${rule.module}.tsx`) ||
      normalized.startsWith(rule.module) ||
      normalized.includes(`${rule.module}/`)
    ) {
      return rule;
    }
  }
  return null;
}

/**
 * Walk the static import graph from every storefront entry and report the first
 * path to each forbidden module. `files` is a path → source map so this stays
 * pure: the test feeds it real files, the gate script feeds it the same.
 *
 * `resolve` maps a specifier to a key in `files`; unresolvable specifiers
 * (npm packages, virtual modules) are checked against the deny list and then
 * dropped rather than guessed at.
 */
export function auditImportGraph(
  files: Record<string, string>,
  resolve: (specifier: string, from: string) => string | null,
  entries: string[] = STOREFRONT_ENTRYPOINTS,
): ImportViolation[] {
  const violations: ImportViolation[] = [];
  const reported = new Set<string>();

  for (const entry of entries) {
    if (!(entry in files)) continue;
    const seen = new Set<string>([entry]);
    const queue: { file: string; chain: string[] }[] = [{ file: entry, chain: [entry] }];

    while (queue.length) {
      const { file, chain } = queue.shift()!;
      if (chain.length > 24) continue; // pathological graph guard
      for (const specifier of staticImports(files[file] ?? "")) {
        const rule = isForbiddenSpecifier(specifier);
        if (rule) {
          const key = `${entry}|${rule.module}`;
          if (!reported.has(key)) {
            reported.add(key);
            violations.push({ entry, module: rule.module, reason: rule.reason, chain: [...chain, specifier] });
          }
          continue;
        }
        const target = resolve(specifier, file);
        if (!target || seen.has(target) || !(target in files)) continue;
        seen.add(target);
        queue.push({ file: target, chain: [...chain, target] });
      }
    }
  }
  return violations;
}

export function importViolationFindings(violations: ImportViolation[]): WeightFinding[] {
  return violations.map((v) =>
    finding({
      code: "storefront:forbidden_import",
      severity: "error",
      scope: v.entry,
      offender: v.module,
      message: `${v.entry} can reach ${v.module} (${v.reason}). Path: ${v.chain.join(" → ")}`,
      messageBn: `${v.entry} থেকে ${v.module} পৌঁছানো যাচ্ছে (${v.reason})।`,
    }),
  );
}

/* ========================================================================== *
 * §7.3 — admin chunk budget
 * ========================================================================== */

export type ChunkMeasurement = { route: string; jsGzBytes: number };

export function checkAdminChunkBudget(measurements: ChunkMeasurement[]): WeightFinding[] {
  const out: WeightFinding[] = [];
  for (const m of measurements) {
    const budget = ADMIN_CHUNK_BUDGET[m.route];
    if (budget === undefined) {
      out.push(
        finding({
          code: "admin:unbudgeted_route",
          severity: "warn",
          scope: m.route,
          message: `${m.route} has no admin chunk budget entry; add one before it grows.`,
          messageBn: `${m.route} এর জন্য কোনো অ্যাডমিন চাংক বাজেট নেই।`,
        }),
      );
      continue;
    }
    if (m.jsGzBytes > budget) {
      out.push(
        finding({
          code: "admin:chunk_over_budget",
          severity: "error",
          scope: m.route,
          actual: m.jsGzBytes,
          budget,
          message: `${m.route} ships ${formatKb(m.jsGzBytes)} gzipped JS, over its ${formatKb(budget)} budget.`,
          messageBn: `${m.route} পাঠাচ্ছে ${formatKb(m.jsGzBytes)} gzip JS, বাজেট ${formatKb(budget)}।`,
        }),
      );
    }
  }
  return out;
}

/** The worker must be pulled in with a dynamic import, on first keystroke. */
export function checkWorkerLaziness(source: string, file: string): WeightFinding[] {
  const statics = staticImports(source);
  const eager = statics.some((s) => s.includes("seo-analysis.worker"));
  if (!eager) return [];
  return [
    finding({
      code: "admin:worker_eager",
      severity: "error",
      scope: file,
      offender: ANALYSIS_WORKER_BUDGET.module,
      message: `${file} imports the analysis worker statically; it must be lazily imported on first keystroke.`,
      messageBn: `${file} অ্যানালাইসিস ওয়ার্কার স্ট্যাটিকভাবে ইমপোর্ট করছে; প্রথম কীস্ট্রোকে লেজি ইমপোর্ট করুন।`,
    }),
  ];
}

/* ========================================================================== *
 * §7.4/7.5 — query and render-path discipline
 * ========================================================================== */

/** A read the storefront performs while rendering, and where it lives. */
export type RenderPathRead = { module: string; fn: string; note: string };

export const RENDER_PATH_READS: RenderPathRead[] = [
  { module: "src/lib/seo.server.ts", fn: "resolveSeo", note: "entity SEO override per rendered page" },
  { module: "src/lib/seo.server.ts", fn: "loadStoreRobotsPolicy", note: "robots.txt policy" },
  { module: "src/lib/seo.server.ts", fn: "loadSitemapByKind", note: "sitemap shard" },
  { module: "src/lib/seo.server.ts", fn: "loadStoreLlmsSummary", note: "llms.txt catalogue" },
  { module: "src/lib/template-seo.server.ts", fn: "loadTemplateSeoMap", note: "builder template SEO" },
  { module: "src/lib/url-lifecycle.server.ts", fn: "loadRedirectMap", note: "redirect map on a 404" },
  { module: "src/lib/custom-code.server.ts", fn: "publishedCustomCode", note: "merchant custom code" },
];

/** Extract the body of `export async function <name>(` up to its closing brace. */
export function functionBody(source: string, name: string): string | null {
  const signature = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*[(<]`);
  const match = signature.exec(source);
  if (!match) return null;
  const braceStart = source.indexOf("{", match.index + match[0].length - 1);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null;
}

/**
 * The §7.5 contract, checked as source text rather than at runtime: a render
 * path read either goes through `renderRead` (which owns cache + timeout +
 * fallback + counter) or it is a finding. Text-level checking is the point —
 * it fails in CI before the read ever reaches production.
 */
export function auditRenderPathRead(read: RenderPathRead, source: string): WeightFinding[] {
  const body = functionBody(source, read.fn);
  if (body === null) {
    return [
      finding({
        code: "render_read:missing",
        severity: "warn",
        scope: read.module,
        offender: read.fn,
        message: `${read.fn} is declared as a render-path read but was not found in ${read.module}.`,
        messageBn: `${read.fn} রেন্ডার-পাথ রিড হিসেবে ঘোষিত, কিন্তু ${read.module} এ পাওয়া যায়নি।`,
      }),
    ];
  }
  const out: WeightFinding[] = [];
  if (!body.includes(`${RENDER_READ_CONTRACT.requiredHelper}(`) && !body.includes(`${RENDER_READ_CONTRACT.requiredHelper}<`)) {
    out.push(
      finding({
        code: "render_read:uncontracted",
        severity: "error",
        scope: read.module,
        offender: read.fn,
        message: `${read.fn} (${read.note}) does not use renderRead — it is missing the cache/timeout/fallback contract.`,
        messageBn: `${read.fn} (${read.note}) renderRead ব্যবহার করছে না — ক্যাশ/টাইমআউট/ফলব্যাক চুক্তি নেই।`,
      }),
    );
  }
  if (!/fallback\s*:/.test(body)) {
    out.push(
      finding({
        code: "render_read:no_fallback",
        severity: "error",
        scope: read.module,
        offender: read.fn,
        message: `${read.fn} declares no fallback value; a dead table would throw into SSR.`,
        messageBn: `${read.fn} এ কোনো ফলব্যাক নেই; টেবিল ডাউন হলে SSR ভেঙে যাবে।`,
      }),
    );
  }
  if (!/key\s*:/.test(body) || !/\|/.test(body)) {
    out.push(
      finding({
        code: "render_read:untenanted_key",
        severity: "error",
        scope: read.module,
        offender: read.fn,
        message: `${read.fn} has no tenant-segmented cache key; a hit could cross stores.`,
        messageBn: `${read.fn} এর ক্যাশ কী-তে টেন্যান্ট নেই; এক স্টোরের ডেটা অন্যটিতে যেতে পারে।`,
      }),
    );
  }
  const timeout = /timeoutMs\s*:\s*([\d_]+)/.exec(body);
  if (timeout) {
    const ms = Number(timeout[1]!.replace(/_/g, ""));
    if (ms > RENDER_READ_CONTRACT.maxTimeoutMs) {
      out.push(
        finding({
          code: "render_read:timeout_too_long",
          severity: "warn",
          scope: read.module,
          offender: read.fn,
          actual: ms,
          budget: RENDER_READ_CONTRACT.maxTimeoutMs,
          message: `${read.fn} allows ${ms}ms inside SSR; the LCP budget is ${RENDER_READ_CONTRACT.maxTimeoutMs}ms of read time.`,
          messageBn: `${read.fn} SSR এ ${ms}ms সময় নিচ্ছে; সীমা ${RENDER_READ_CONTRACT.maxTimeoutMs}ms।`,
        }),
      );
    }
  }
  for (const raw of body.matchAll(/\.limit\(\s*([\d_]+)\s*\)/g)) {
    const rows = Number(raw[1]!.replace(/_/g, ""));
    if (rows > RENDER_READ_CONTRACT.maxRowLimit) {
      out.push(
        finding({
          code: "query:limit_too_high",
          severity: "warn",
          scope: read.module,
          offender: read.fn,
          actual: rows,
          budget: RENDER_READ_CONTRACT.maxRowLimit,
          message: `${read.fn} fetches up to ${rows} rows in one render-path query.`,
          messageBn: `${read.fn} একটি রেন্ডার-পাথ কুয়েরিতে ${rows} সারি আনছে।`,
        }),
      );
    }
  }
  return out;
}

/** N+1 detector: an awaited query inside a `for`/`while`/`.map(` body. */
export function auditQueryDiscipline(module: string, source: string): WeightFinding[] {
  const out: WeightFinding[] = [];
  const lines = source.split("\n");
  let loopDepth = 0;
  let loopBrace = 0;
  lines.forEach((line, index) => {
    if (loopDepth === 0 && /\b(for|while)\s*\(/.test(line)) {
      loopDepth = 1;
      loopBrace = 0;
    }
    if (loopDepth > 0) {
      loopBrace += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (/await\s+[^;]*\.(from|rpc)\(/.test(line)) {
        out.push(
          finding({
            code: "query:n_plus_one",
            severity: "warn",
            scope: module,
            offender: `line ${index + 1}`,
            message: `A database call runs inside a loop at ${module}:${index + 1}; batch it into one bounded query.`,
            messageBn: `${module}:${index + 1} এ লুপের ভিতরে ডাটাবেস কল হচ্ছে; একটি কুয়েরিতে ব্যাচ করুন।`,
          }),
        );
      }
      if (loopBrace <= 0 && /\}/.test(line)) loopDepth = 0;
    }
  });
  return out;
}

/* ========================================================================== *
 * Report
 * ========================================================================== */

export type WeightReport = {
  ok: boolean;
  score: number;
  findings: WeightFinding[];
  heads: HeadMeasurement[];
  generatedAt: string;
  /** Worst page, so the desk can lead with it. */
  heaviest: { route: string; gzBytes: number } | null;
};

export function composeWeightReport(input: {
  heads: HeadMeasurement[];
  extra?: WeightFinding[];
  generatedAt?: string;
}): WeightReport {
  const findings: WeightFinding[] = [];
  for (const head of input.heads) {
    findings.push(...checkHeadBudget(head), ...checkGraphSingletons(head));
  }
  findings.push(...(input.extra ?? []));
  const heaviest = [...input.heads].sort((a, b) => b.gzBytes - a.gzBytes)[0];
  return {
    ok: !isBlocking(findings),
    score: weightScore(findings),
    findings,
    heads: input.heads,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    heaviest: heaviest ? { route: heaviest.route, gzBytes: heaviest.gzBytes } : null,
  };
}
