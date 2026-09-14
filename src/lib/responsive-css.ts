/**
 * Phase 5 — the responsive style compiler.
 *
 * The studio lets a merchant override layout props per device layer
 * (`section.bp.mobile`, `section.bp.tablet`). Those layers used to exist only
 * in the editor: the storefront renders one HTML document for every viewport,
 * so `resolveProps(section, device)` had nothing to resolve against and the
 * overrides silently evaporated in production. This module closes that gap by
 * turning the layers into real, range-scoped CSS.
 *
 * Design rules, all of them deliberate:
 *
 *  - **Pure.** No DOM, no DB, no React. The renderer, the publish gate, the
 *    CI sweep and the tests all call the same function and get byte-identical
 *    output for the same AST.
 *  - **Closed vocabulary.** Every declaration is produced by a typed emitter
 *    from a clamped number or a fixed select value. A merchant string can
 *    never reach the stylesheet, so there is no CSS-injection surface.
 *  - **Deduplicated.** Nodes are keyed by a hash of their *responsive
 *    signature*, not by node id, so a page with forty identical cards emits
 *    one rule set. The class name is derived from the same pure hash, which is
 *    why the renderer can compute it per node without consulting the compiler.
 *  - **Budgeted.** A pathological theme cannot inflate the document: rules and
 *    bytes are capped, the overflow is dropped (never truncated mid-rule) and
 *    reported, so the caller can log and the gate can warn.
 *  - **Deterministic ordering.** Rules are emitted widest-range first
 *    (tablet, then mobile) so the narrow layer always wins the cascade without
 *    relying on `!important`.
 */
import type { Breakpoint, PropValue, Section, ThemeAst } from "./builder-ast";
import {
  BREAKPOINT_PX,
  RESPONSIVE_LAYOUT_KEYS,
  isResponsiveLayoutKey,
  layerMedia,
  type DeviceBucket,
} from "./responsive";

/* -------------------------------------------------------------- budgets */

export const RESPONSIVE_CSS_BUDGET = {
  /** Distinct rule blocks (one per signature × layer). */
  maxRules: 400,
  /** Serialised stylesheet size, bytes. Roughly 8 KB gzipped worst case. */
  maxBytes: 24_000,
  /** Declarations inside a single layer of a single node. */
  maxDeclsPerRule: 12,
} as const;

/** Where the desktop range starts — the complement of tablet + mobile. */
const DESKTOP_MIN_PX = BREAKPOINT_PX.xl;

/** Layers that can carry overrides, ordered so narrower wins by source order. */
const OVERRIDE_LAYERS: DeviceBucket[] = ["tablet", "mobile"];

/* ------------------------------------------------------------- emitters */

const num = (value: PropValue | undefined, min: number, max: number): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

const oneOf = <T extends string>(value: PropValue | undefined, allowed: readonly T[]): T | null => {
  const s = String(value ?? "");
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
};

type Decl = [property: string, value: string];

/**
 * One emitter per responsive layout key. Returning `[]` means "this value is
 * not expressible in CSS here" (auto, unknown vocabulary, unparseable number),
 * which is always safe: the node keeps its base-layer rendering.
 */
const EMITTERS: Record<string, (value: PropValue | undefined) => Decl[]> = {
  padY: (v) => {
    const n = num(v, 0, 160);
    return n === null ? [] : [["padding-block", `${n}px`]];
  },
  padX: (v) => {
    const n = num(v, 0, 96);
    return n === null ? [] : [["padding-inline", `${n}px`]];
  },
  gap: (v) => {
    const n = num(v, 0, 64);
    return n === null ? [] : [["gap", `${n}px`]];
  },
  order: (v) => {
    const n = num(v, -20, 20);
    return n === null ? [] : [["order", String(n)]];
  },
  span: (v) => {
    const n = num(v, 0, 12);
    if (n === null || n === 0) return [["grid-column", "1 / -1"]];
    return [["grid-column", `span ${n} / span ${n}`]];
  },
  columns: (v) => {
    const n = num(v, 1, 12);
    return n === null ? [] : [["grid-template-columns", `repeat(${n}, minmax(0, 1fr))`]];
  },
  cols: (v) => {
    const n = num(v, 1, 12);
    return n === null ? [] : [["grid-template-columns", `repeat(${n}, minmax(0, 1fr))`]];
  },
  align: (v) => {
    const a = oneOf(v, ["left", "center", "right"] as const);
    return a === null ? [] : [["text-align", a === "center" ? "center" : a === "right" ? "right" : "left"]];
  },
  maxW: (v) => {
    const w = oneOf(v, ["container", "narrow", "full"] as const);
    if (w === null) return [];
    if (w === "full") return [["max-width", "none"], ["width", "100%"]];
    if (w === "narrow") return [["max-width", "42rem"], ["margin-inline", "auto"]];
    return [["max-width", "72rem"], ["margin-inline", "auto"]];
  },
  ratio: (v) => {
    const r = oneOf(v, ["auto", "1-1", "4-3", "16-9"] as const);
    if (r === null) return [];
    if (r === "auto") return [["aspect-ratio", "auto"]];
    return [["aspect-ratio", r.replace("-", " / ")]];
  },
};

/* ---------------------------------------------------------------- hashing */

/** FNV-1a, base36. Stable across processes — the class name is part of the SSR payload. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export type ResponsiveSignature = {
  hidden: Breakpoint[];
  layers: Partial<Record<DeviceBucket, Record<string, PropValue>>>;
};

/**
 * The part of a node that affects responsive CSS, normalised: only known
 * layout keys, only layers that survive normalisation, keys sorted so two
 * nodes authored in a different order still share one rule.
 */
export function responsiveSignature(section: Section): ResponsiveSignature | null {
  const hidden = [...new Set(section.hidden ?? [])].sort() as Breakpoint[];
  const layers: ResponsiveSignature["layers"] = {};
  for (const layer of OVERRIDE_LAYERS) {
    const bag = section.bp?.[layer];
    if (!bag) continue;
    const out: Record<string, PropValue> = {};
    for (const key of Object.keys(bag).sort()) {
      if (!isResponsiveLayoutKey(key)) continue;
      if (EMITTERS[key]?.(bag[key]).length) out[key] = bag[key]!;
    }
    if (Object.keys(out).length) layers[layer] = out;
  }
  if (!hidden.length && !Object.keys(layers).length) return null;
  return { hidden, layers };
}

/** Canonical string form of a signature — the hash input and the dedupe key. */
export function signatureKey(sig: ResponsiveSignature): string {
  const layers = OVERRIDE_LAYERS.filter((l) => sig.layers[l])
    .map((l) => `${l}{${Object.entries(sig.layers[l]!).map(([k, v]) => `${k}:${String(v)}`).join(";")}}`)
    .join("|");
  return `h=${sig.hidden.join(",")}|${layers}`;
}

/**
 * The class a node must carry for its compiled rules to apply, or `null` when
 * the node has no responsive behaviour at all (the common case — we do not pay
 * a class for a node that does not need one).
 */
export function responsiveClassOf(section: Section): string | null {
  const sig = responsiveSignature(section);
  return sig ? `fq-r-${hash(signatureKey(sig))}` : null;
}

/* -------------------------------------------------------------- compiling */

export type CompiledResponsive = {
  /** The stylesheet. Empty string when nothing needed compiling. */
  css: string;
  /** Rule blocks actually emitted. */
  rules: number;
  /** Distinct signatures seen (before budgeting). */
  signatures: number;
  /** Nodes that carry a responsive class. */
  nodes: number;
  bytes: number;
  /** True when the budget dropped rules — the page still renders, wider. */
  truncated: boolean;
  /** Human-readable budget notes for logs and the publish gate. */
  warnings: string[];
};

const EMPTY: CompiledResponsive = {
  css: "",
  rules: 0,
  signatures: 0,
  nodes: 0,
  bytes: 0,
  truncated: false,
  warnings: [],
};

function walk(sections: Section[], visit: (s: Section) => void): void {
  for (const section of sections) {
    visit(section);
    if (section.children?.length) walk(section.children, visit);
  }
}

/** Every node of a template, header → main → footer, depth-first. */
export function astSections(ast: ThemeAst | null | undefined): Section[] {
  if (!ast) return [];
  const out: Section[] = [];
  walk([...ast.header, ...ast.main, ...ast.footer], (s) => out.push(s));
  return out;
}

function blockFor(selector: string, decls: Decl[]): string {
  const body = decls
    .slice(0, RESPONSIVE_CSS_BUDGET.maxDeclsPerRule)
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
  return `${selector}{${body}}`;
}

/**
 * Compile a set of nodes into one stylesheet.
 *
 * Emission order matters and is fixed: hidden rules first (visibility is a
 * coarser decision than layout), then tablet, then mobile, so the narrower
 * range wins on equal specificity without `!important`. Selectors are doubled
 * (`.fq-node.fq-r-x`) so an override beats the Tailwind utility the base layer
 * put on the same element.
 */
export function compileResponsiveCss(
  input: Section[] | ThemeAst | null | undefined,
  options: { budget?: Partial<Record<keyof typeof RESPONSIVE_CSS_BUDGET, number>> } = {},
): CompiledResponsive {
  const sections = Array.isArray(input) ? collect(input) : astSections(input);
  if (!sections.length) return EMPTY;
  const budget = { ...RESPONSIVE_CSS_BUDGET, ...options.budget };

  const seen = new Map<string, ResponsiveSignature>();
  let nodes = 0;
  for (const section of sections) {
    const sig = responsiveSignature(section);
    if (!sig) continue;
    nodes += 1;
    const key = signatureKey(sig);
    if (!seen.has(key)) seen.set(key, sig);
  }
  if (!seen.size) return { ...EMPTY, nodes };

  const warnings: string[] = [];
  const chunks: string[] = [];
  let rules = 0;
  let bytes = 0;
  let truncated = false;

  const push = (text: string): boolean => {
    if (rules >= budget.maxRules || bytes + text.length > budget.maxBytes) {
      truncated = true;
      return false;
    }
    chunks.push(text);
    rules += 1;
    bytes += text.length;
    return true;
  };

  // Deterministic order: sort by class name so two runs over the same AST
  // produce the same bytes (SSR/CSR parity, and a stable ETag upstream).
  const entries = [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  for (const [key, sig] of entries) {
    const cls = `fq-r-${hash(key)}`;
    const selector = `.fq-node.${cls}`;

    for (const layer of OVERRIDE_LAYERS) {
      if (!sig.hidden.includes(layer as Breakpoint)) continue;
      const media = layerMedia(layer);
      if (!media) continue;
      push(`${media}{${blockFor(selector, [["display", "none"]])}}`);
    }
    if (sig.hidden.includes("desktop")) {
      // Desktop is the base layer, so "hidden on desktop" is expressed as the
      // complement of the two narrow ranges rather than an unconditional rule.
      push(`@media (min-width: ${DESKTOP_MIN_PX}px){${blockFor(selector, [["display", "none"]])}}`);
    }

    for (const layer of OVERRIDE_LAYERS) {
      const bag = sig.layers[layer];
      if (!bag) continue;
      const decls: Decl[] = [];
      for (const prop of RESPONSIVE_LAYOUT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(bag, prop)) continue;
        decls.push(...(EMITTERS[prop]?.(bag[prop]) ?? []));
      }
      if (!decls.length) continue;
      if (decls.length > budget.maxDeclsPerRule) {
        warnings.push(`responsive: ${cls}/${layer} declares ${decls.length} properties — trimmed to ${budget.maxDeclsPerRule}.`);
      }
      const media = layerMedia(layer);
      const block = blockFor(selector, decls);
      push(media ? `${media}{${block}}` : block);
    }
  }

  if (truncated) {
    warnings.push(
      `responsive: stylesheet hit the budget (${budget.maxRules} rules / ${budget.maxBytes} bytes) — later overrides were dropped and those nodes render at their base layout.`,
    );
  }

  return {
    css: chunks.join("\n"),
    rules,
    signatures: seen.size,
    nodes,
    bytes,
    truncated,
    warnings,
  };
}

function collect(sections: Section[]): Section[] {
  const out: Section[] = [];
  walk(sections, (s) => out.push(s));
  return out;
}
