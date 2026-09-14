/**
 * Phase 4.1 / 4.2 / 4.3 — the per-widget performance contract.
 *
 * `scripts/perf-budget.mjs` measures what the *bundler* produced; it cannot
 * tell a merchant which widget made the page heavy, and it cannot run before a
 * template is published. This module is the authoring-time half of the same
 * budget:
 *
 *  - every widget declares a **client JS weight** and a **hydration mode**;
 *  - a template's summed weight is checked against the route budget and the
 *    offenders are named, biggest first;
 *  - the hydration policy is *audited*, not documented: chrome must be eager,
 *    editorial must be static, rails/UGC visible, drawers/quick-view
 *    interaction. A mismatch is a gate failure, so `widget-hydration.ts` can
 *    never quietly drift from the policy the docs promise;
 *  - the image contract (dimensions or reserved aspect, `sizes`, lazy loading,
 *    exactly one `fetchpriority="high"` node per template) is decided from the
 *    AST, where it can still be fixed, instead of from a Lighthouse run.
 *
 * Pure data + pure functions: no React, no DB, no browser. The publish gate,
 * the CI script and the tests all read these same numbers.
 */
import {
  MAX_NODES_PER_TEMPLATE,
  imageKeysOf,
  type Section,
  type SectionType,
  type TemplateKey,
  type ThemeAst,
} from "./builder-ast";
import { hydrationMode, type HydrationMode } from "./widget-hydration";
import { WIDGET_REGISTRY, WIDGET_TYPES, type WidgetMeta } from "./widget-registry";
import { ASSET_BUDGET, formatBytes } from "./web-vitals";
import { skeletonSpec } from "./widget-skeletons";

/* ------------------------------------------------------------------ */
/* 1. Weight model                                                     */
/* ------------------------------------------------------------------ */

/**
 * Baseline client cost of waking one island, gzipped bytes. `static` is
 * exactly zero — a static widget never mounts, so it contributes markup only.
 *
 * These are *attributed* costs, not a promise that each widget ships its own
 * chunk: shared runtime lives in the shell reserve below. What matters for the
 * gate is that the ordering and the magnitudes match what the bundler reports,
 * which `phase4-perf.contract.test.ts` pins.
 */
export const WEIGHT_BASE: Record<HydrationMode, number> = {
  static: 0,
  interaction: 1_600,
  visible: 2_200,
  eager: 3_400,
};

/** A data widget pays for its fetch/normalise/skeleton path on top of the base. */
export const WEIGHT_DATA_SURCHARGE = 1_100;
/** A container recurses through the renderer, which is not free. */
export const WEIGHT_CONTAINER_SURCHARGE = 350;

/**
 * Widgets whose measured cost is dominated by their own logic rather than by
 * the island wrapper. Anything absent is derived; anything here is a
 * deliberate, reviewable number.
 */
export const WEIGHT_OVERRIDES: Partial<Record<SectionType, number>> = {
  // Third-party / merchant-controlled surfaces: the frame plus the bridge.
  plugin_block: 14_000,
  html: 1_500,
  video: 4_200,
  store_locator: 12_000,
  // Search and navigation carry an index and a keyboard model.
  search_command: 9_000,
  mega_menu: 6_000,
  facet_sidebar: 6_200,
  // Multi-step, stateful flows.
  quiz: 7_000,
  skin_quiz: 7_000,
  shade_finder: 6_500,
  routine_builder: 5_500,
  gift_builder: 5_500,
  bundle_builder: 6_000,
  checkout_steps: 6_000,
  trade_in: 4_200,
  // Numeric / charting widgets.
  emi_calculator: 5_000,
  price_sparkline: 6_000,
  compare_tray: 5_000,
  compare_table: 4_400,
  // Overlays and carousels.
  cart_drawer: 5_000,
  quick_view: 5_000,
  lookbook: 4_500,
  ugc_gallery: 5_000,
  before_after: 3_000,
  shoppable_image: 3_400,
  // Long lists with their own paging/sorting.
  review_list: 4_000,
  product_qna: 4_000,
  order_tracker: 4_500,
};

export type WidgetWeight = {
  type: SectionType;
  label: string;
  mode: HydrationMode;
  /** Attributed client JS, gzipped bytes. Zero for static widgets. */
  jsBytes: number;
  /** True when the widget costs nothing on a published page. */
  zeroJs: boolean;
  /** Why the number is what it is — surfaced in gate output. */
  reason: string;
};

function deriveWeight(meta: WidgetMeta, mode: HydrationMode): { bytes: number; reason: string } {
  const override = WEIGHT_OVERRIDES[meta.type];
  if (override !== undefined) {
    // A static widget cannot cost client JS, whatever the table says — the
    // island never mounts. Keeping this invariant here means an override can
    // never contradict the hydration policy.
    if (mode === "static") return { bytes: 0, reason: "static island — no client JS" };
    return { bytes: override, reason: "declared weight" };
  }
  if (mode === "static") return { bytes: 0, reason: "static island — no client JS" };
  let bytes = WEIGHT_BASE[mode];
  const parts = [`${mode} island`];
  if (meta.data) {
    bytes += WEIGHT_DATA_SURCHARGE;
    parts.push("data-bound");
  }
  if (meta.container) {
    bytes += WEIGHT_CONTAINER_SURCHARGE;
    parts.push("container");
  }
  return { bytes, reason: parts.join(" + ") };
}

const WEIGHTS: Record<SectionType, WidgetWeight> = Object.fromEntries(
  WIDGET_TYPES.map((type) => {
    const meta = WIDGET_REGISTRY[type];
    const mode = hydrationMode(type);
    const { bytes, reason } = deriveWeight(meta, mode);
    return [type, { type, label: meta.label, mode, jsBytes: bytes, zeroJs: bytes === 0, reason }];
  }),
) as Record<SectionType, WidgetWeight>;

export function widgetWeight(type: SectionType | string): WidgetWeight {
  return (
    WEIGHTS[type as SectionType] ?? {
      type: type as SectionType,
      label: String(type),
      mode: "visible",
      jsBytes: WEIGHT_BASE.visible,
      zeroJs: false,
      reason: "unknown widget — charged the default island cost",
    }
  );
}

/** The whole table, heaviest first. Used by docs, tests and the studio panel. */
export function weightTable(): WidgetWeight[] {
  return WIDGET_TYPES.map((t) => WEIGHTS[t]).sort((a, b) => b.jsBytes - a.jsBytes || a.type.localeCompare(b.type));
}

/* ------------------------------------------------------------------ */
/* 2. Route budgets                                                    */
/* ------------------------------------------------------------------ */

/**
 * The shell (router, React, theme runtime, cart context) is charged once per
 * route by `perf:budget`; what is left of the route's JS budget is what
 * merchant-authored widgets may spend.
 */
export const SHELL_RESERVE_GZ = 55 * 1024;

function widgetBudget(share: number): number {
  return Math.round((ASSET_BUDGET.jsGzBytes - SHELL_RESERVE_GZ) * share);
}

/**
 * Per-template widget JS budget, gzipped bytes. Checkout is deliberately the
 * tightest: it is the only route where a slow page costs a completed order.
 */
export const TEMPLATE_JS_BUDGET: Record<TemplateKey, number> = {
  index: widgetBudget(1),
  product: widgetBudget(1),
  collection: widgetBudget(0.9),
  search: widgetBudget(0.9),
  page: widgetBudget(0.7),
  blog: widgetBudget(0.7),
  cart: widgetBudget(0.8),
  checkout: widgetBudget(0.7),
};

export function templateBudget(template: TemplateKey | null | undefined): number {
  return template ? (TEMPLATE_JS_BUDGET[template] ?? widgetBudget(1)) : widgetBudget(1);
}

/* ------------------------------------------------------------------ */
/* 3. AST walking                                                      */
/* ------------------------------------------------------------------ */

export type WalkedNode = { node: Section; slot: keyof ThemeAst; depth: number; index: number };

/** Depth-first walk in render order: header, main, footer. */
export function walkAst(ast: ThemeAst): WalkedNode[] {
  const out: WalkedNode[] = [];
  const slots: (keyof ThemeAst)[] = ["header", "main", "footer"];
  for (const slot of slots) {
    let index = 0;
    const visit = (nodes: Section[] | undefined, depth: number) => {
      for (const node of nodes ?? []) {
        if (out.length >= MAX_NODES_PER_TEMPLATE) return;
        out.push({ node, slot, depth, index: index++ });
        if (node.children?.length) visit(node.children, depth + 1);
      }
    };
    visit(ast[slot], 0);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 4. Failures                                                         */
/* ------------------------------------------------------------------ */

export type PerfSeverity = "error" | "warn";

export type PerfFailure = {
  /** Stable machine code — CI prints these, tests assert on them. */
  code: string;
  message: string;
  severity: PerfSeverity;
  /** Node the merchant should open, when the failure has one. */
  nodeId?: string;
  type?: SectionType;
  actual?: number;
  budget?: number;
};

function err(f: Omit<PerfFailure, "severity">): PerfFailure {
  return { ...f, severity: "error" };
}
function warn(f: Omit<PerfFailure, "severity">): PerfFailure {
  return { ...f, severity: "warn" };
}

/* ------------------------------------------------------------------ */
/* 5. Per-template weight gate (§4.1)                                  */
/* ------------------------------------------------------------------ */

export type WeightOffender = {
  type: SectionType;
  label: string;
  count: number;
  eachBytes: number;
  totalBytes: number;
  mode: HydrationMode;
};

export type TemplateWeightReport = {
  template: TemplateKey | null;
  totalBytes: number;
  budgetBytes: number;
  overBytes: number;
  nodeCount: number;
  /** Share of nodes that ship no client JS at all. */
  staticShare: number;
  offenders: WeightOffender[];
  failures: PerfFailure[];
};

export function templateWeight(ast: ThemeAst, template: TemplateKey | null = null): TemplateWeightReport {
  const nodes = walkAst(ast);
  const byType = new Map<SectionType, WeightOffender>();
  let total = 0;
  let staticNodes = 0;

  for (const { node } of nodes) {
    const weight = widgetWeight(node.type);
    if (weight.zeroJs) staticNodes += 1;
    total += weight.jsBytes;
    const row = byType.get(node.type);
    if (row) {
      row.count += 1;
      row.totalBytes += weight.jsBytes;
    } else {
      byType.set(node.type, {
        type: node.type,
        label: weight.label,
        count: 1,
        eachBytes: weight.jsBytes,
        totalBytes: weight.jsBytes,
        mode: weight.mode,
      });
    }
  }

  const budgetBytes = templateBudget(template);
  const offenders = [...byType.values()]
    .filter((row) => row.totalBytes > 0)
    .sort((a, b) => b.totalBytes - a.totalBytes || a.type.localeCompare(b.type));

  const failures: PerfFailure[] = [];
  if (total > budgetBytes) {
    const worst = offenders.slice(0, 3).map((o) => `${o.label}×${o.count} (${formatBytes(o.totalBytes)})`);
    failures.push(
      err({
        code: "perf.weight",
        message:
          `weight: ${template ?? "template"} ships ${formatBytes(total)} gz of widget JS, over the ` +
          `${formatBytes(budgetBytes)} budget. Heaviest: ${worst.join(", ") || "—"}.`,
        actual: total,
        budget: budgetBytes,
      }),
    );
  } else if (total > budgetBytes * 0.85) {
    failures.push(
      warn({
        code: "perf.weight_near",
        message: `weight: ${template ?? "template"} is at ${Math.round((total / budgetBytes) * 100)}% of its widget JS budget.`,
        actual: total,
        budget: budgetBytes,
      }),
    );
  }

  // A single widget must never eat half the route on its own — that is the
  // shape of a regression nobody can bisect later.
  const cap = Math.round(budgetBytes * 0.5);
  for (const row of offenders) {
    if (row.totalBytes > cap) {
      failures.push(
        err({
          code: "perf.weight_single",
          message: `weight: ${row.label} alone is ${formatBytes(row.totalBytes)} gz — over half of this route's widget budget.`,
          type: row.type,
          actual: row.totalBytes,
          budget: cap,
        }),
      );
    }
  }

  return {
    template,
    totalBytes: total,
    budgetBytes,
    overBytes: Math.max(0, total - budgetBytes),
    nodeCount: nodes.length,
    staticShare: nodes.length ? staticNodes / nodes.length : 1,
    offenders,
    failures,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Hydration audit (§4.2)                                           */
/* ------------------------------------------------------------------ */

/**
 * The policy in prose ("chrome eager, editorial static, rails/UGC visible,
 * drawers/quick-view interaction") expressed as machine-checkable expectations.
 * `allowed` lists every mode a widget of that class may legitimately use; the
 * first entry is the preferred one, reported when a widget sits outside.
 */
export type HydrationClass =
  | "chrome"
  | "below_fold_chrome"
  | "editorial"
  | "buy_path"
  | "data"
  | "overlay";

export const HYDRATION_POLICY: Record<HydrationClass, { allowed: HydrationMode[]; why: string }> = {
  chrome: { allowed: ["eager"], why: "site chrome can be tapped before any scroll" },
  below_fold_chrome: {
    allowed: ["visible", "eager"],
    // A department strip, a sticky buy bar or a checkout stepper is chrome the
    // shopper only reaches after scrolling, so waking it on intersection is
    // correct and waking it eagerly is merely wasteful.
    why: "chrome that only becomes reachable after a scroll",
  },
  editorial: { allowed: ["static"], why: "editorial widgets have no state to wake" },
  buy_path: { allowed: ["eager"], why: "the buy path must respond to the first tap" },
  data: { allowed: ["visible", "interaction"], why: "data widgets may wait until they are on screen" },
  overlay: { allowed: ["interaction", "eager"], why: "a closed overlay is markup until it is reached" },
};

/** Widget → policy class. Anything unlisted is classified from the registry. */
const CLASS_OVERRIDES: Partial<Record<SectionType, HydrationClass>> = {
  announcement_bar: "chrome",
  utility_bar: "chrome",
  account_cart: "chrome",
  search_command: "chrome",
  mega_menu: "chrome",
  department_strip: "below_fold_chrome",
  footer_sitemap: "editorial",
  sticky_bar: "chrome",
  add_to_cart: "buy_path",
  buy_box: "buy_path",
  variant_picker: "buy_path",
  cart_summary: "buy_path",
  sticky_buy_bar: "below_fold_chrome",
  checkout_steps: "below_fold_chrome",
  html: "chrome",
  plugin_block: "chrome",
  countdown: "chrome",
  cart_drawer: "overlay",
  quick_view: "overlay",
  size_guide: "overlay",
  facet_sidebar: "overlay",
  compare_table: "overlay",
  newsletter: "overlay",
  accordion: "overlay",
  tabs: "overlay",
  faq: "overlay",
  quiz: "overlay",
  heading: "editorial",
  rich_text: "editorial",
  image: "editorial",
  hero: "editorial",
  banner: "editorial",
  divider: "editorial",
  spacer: "editorial",
  notice: "editorial",
  trust_bar: "editorial",
  payment_icons: "editorial",
  feature_row: "editorial",
  testimonial: "editorial",
  breadcrumb: "editorial",
  product_meta: "editorial",
  spec_table: "editorial",
  page_content: "editorial",
  container: "editorial",
  columns: "editorial",
};

export function hydrationClass(type: SectionType): HydrationClass {
  const explicit = CLASS_OVERRIDES[type];
  if (explicit) return explicit;
  return WIDGET_REGISTRY[type]?.data ? "data" : "data";
}

/**
 * Enforces the policy across the whole registry. Called by the release gate and
 * by the publish gate, so a new widget with a careless mode fails immediately
 * rather than after a Lighthouse regression in production.
 */
export function hydrationAudit(types: readonly SectionType[] = WIDGET_TYPES): PerfFailure[] {
  const failures: PerfFailure[] = [];
  for (const type of types) {
    const cls = hydrationClass(type);
    const policy = HYDRATION_POLICY[cls];
    const mode = hydrationMode(type);
    if (!policy.allowed.includes(mode)) {
      failures.push(
        err({
          code: "perf.hydration",
          message:
            `hydration: ${type} is ${cls} so it must be ${policy.allowed.join(" or ")} ` +
            `(${policy.why}) — it is "${mode}".`,
          type,
        }),
      );
      continue;
    }
    // A data widget that hydrates must reserve its box, or the rows land and
    // the page shifts. Skeleton parity itself is gated elsewhere; this catches
    // the combination the other gate cannot see.
    const meta = WIDGET_REGISTRY[type];
    if (meta?.data && mode !== "static" && !meta.skeleton) {
      failures.push(
        err({
          code: "perf.skeleton_missing",
          message: `hydration: ${type} resolves data at "${mode}" without a skeleton — the rows will shift the page.`,
          type,
        }),
      );
    }
  }
  return failures;
}

/* ------------------------------------------------------------------ */
/* 7. Image contract (§4.3)                                            */
/* ------------------------------------------------------------------ */

/** Prop keys widely used by media widgets for their aspect box. */
const RATIO_KEYS = ["ratio", "aspect", "media_ratio"] as const;
/** Prop key a merchant sets to nominate the LCP candidate. */
export const PRIORITY_PROP = "priority";

function hasImageValue(node: Section): boolean {
  const keys = imageKeysOf(node.type);
  return keys.some((key) => {
    const value = node.props[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function declaresRatio(node: Section): boolean {
  if (RATIO_KEYS.some((key) => typeof node.props[key] === "string" && String(node.props[key]).trim())) return true;
  const width = Number(node.props["width"]);
  const height = Number(node.props["height"]);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) return true;
  return Boolean(skeletonSpec(node.type)?.ratio);
}

export type ImageAuditReport = {
  /** Node the template treats as its LCP candidate, if any. */
  lcpNodeId: string | null;
  mediaNodes: number;
  priorityNodes: string[];
  failures: PerfFailure[];
};

/**
 * Decides the image contract from the AST:
 *
 *  - exactly one node may carry `fetchpriority="high"` (the LCP candidate);
 *  - every other media node lazy-loads, which the renderer does by default —
 *    so what we can check here is that nothing else claims priority;
 *  - every media node reserves a box (explicit width/height, a ratio prop, or
 *    a skeleton that declares one), otherwise the image resizes on load;
 *  - the LCP candidate lives above the fold: claiming priority from the footer
 *    or from a `hidden` node is always wrong.
 */
export function imageAudit(ast: ThemeAst): ImageAuditReport {
  const nodes = walkAst(ast);
  const failures: PerfFailure[] = [];
  const priority: string[] = [];
  let mediaNodes = 0;
  let firstMedia: WalkedNode | null = null;

  for (const walked of nodes) {
    const { node, slot } = walked;
    const isMedia = imageKeysOf(node.type).length > 0;
    if (!isMedia) {
      if (node.props[PRIORITY_PROP] === true) {
        failures.push(
          err({
            code: "img.priority_non_media",
            message: `images: ${node.type} claims fetchpriority="high" but renders no image.`,
            nodeId: node.id,
            type: node.type,
          }),
        );
        priority.push(node.id);
      }
      continue;
    }

    mediaNodes += 1;
    if (!firstMedia && slot !== "footer") firstMedia = walked;

    if (hasImageValue(node) && !declaresRatio(node)) {
      failures.push(
        err({
          code: "img.no_box",
          message: `images: ${node.type} renders media without width/height or an aspect ratio — the load will shift the page.`,
          nodeId: node.id,
          type: node.type,
        }),
      );
    }

    if (node.props[PRIORITY_PROP] === true) {
      priority.push(node.id);
      if (slot === "footer") {
        failures.push(
          err({
            code: "img.priority_below_fold",
            message: `images: ${node.type} in the footer claims fetchpriority="high" — it can never be the LCP element.`,
            nodeId: node.id,
            type: node.type,
          }),
        );
      }
      if (node.hidden?.length) {
        failures.push(
          err({
            code: "img.priority_hidden",
            message: `images: ${node.type} claims fetchpriority="high" but is hidden on ${node.hidden.join(", ")}.`,
            nodeId: node.id,
            type: node.type,
          }),
        );
      }
    }
  }

  if (priority.length > 1) {
    failures.push(
      err({
        code: "img.priority_multiple",
        message: `images: ${priority.length} nodes claim fetchpriority="high" — exactly one LCP candidate per template.`,
        actual: priority.length,
        budget: 1,
      }),
    );
  }

  if (priority.length === 0 && mediaNodes > 0 && firstMedia) {
    // Not fatal: the renderer promotes the first above-the-fold media node
    // automatically. Reported so a merchant knows which node it picked.
    failures.push(
      warn({
        code: "img.priority_implicit",
        message: `images: no explicit LCP candidate — the renderer will prioritise the first ${firstMedia.node.type}.`,
        nodeId: firstMedia.node.id,
        type: firstMedia.node.type,
      }),
    );
  }

  return {
    lcpNodeId: priority[0] ?? firstMedia?.node.id ?? null,
    mediaNodes,
    priorityNodes: priority,
    failures,
  };
}

/* ------------------------------------------------------------------ */
/* 8. Composed gate                                                    */
/* ------------------------------------------------------------------ */

export type PerfGateReport = {
  ok: boolean;
  /** Blocking failures only. */
  failures: PerfFailure[];
  /** Advisory rows — shown in the studio, never blocking. */
  warnings: PerfFailure[];
  weight: TemplateWeightReport;
  images: ImageAuditReport;
};

/**
 * One call the publish path and the studio panel share. `hydration: false`
 * skips the registry-wide audit for per-template checks that run on every
 * keystroke — the registry cannot change between them.
 */
export function perfGate(input: {
  ast: ThemeAst;
  template?: TemplateKey | null;
  hydration?: boolean;
}): PerfGateReport {
  const weight = templateWeight(input.ast, input.template ?? null);
  const images = imageAudit(input.ast);
  const all = [
    ...weight.failures,
    ...images.failures,
    ...(input.hydration === false ? [] : hydrationAudit()),
  ];
  const failures = all.filter((f) => f.severity === "error");
  return { ok: failures.length === 0, failures, warnings: all.filter((f) => f.severity === "warn"), weight, images };
}

/** Human summary for CI output and the studio footer. */
export function describePerf(report: PerfGateReport): string {
  const { weight } = report;
  return (
    `${formatBytes(weight.totalBytes)} / ${formatBytes(weight.budgetBytes)} gz widget JS · ` +
    `${weight.nodeCount} nodes · ${Math.round(weight.staticShare * 100)}% zero-JS · ` +
    `${report.failures.length} blocking, ${report.warnings.length} advisory`
  );
}
