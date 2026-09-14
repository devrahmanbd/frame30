/**
 * Phase 0.3 — the data-bound widget contract.
 *
 * Widgets never fetch. Instead, every data widget declares a `data.source`
 * plus parameter fields in the registry; this module walks an AST once,
 * turns every data node into a normalised request, and de-duplicates those
 * requests by content. The result is a single batch that one server call
 * resolves into a keyed map, which the renderer reads by node id.
 *
 * That is what kills N+1: ten `product_grid` nodes with identical params
 * produce one request, and a template with several distinct grids still
 * produces exactly one round trip.
 *
 * This module is pure and client-safe: no React, no database, no theme.
 */
import type { PropValue, Section, ThemeAst } from "./builder-ast";
import { flattenAst, flattenSections } from "./builder-ast";
import { WIDGET_REGISTRY, type WidgetDataSource } from "./widget-registry";

/** Hard ceiling on rows any single widget may request. */
export const MAX_WIDGET_ROWS = 48;
/** Hard ceiling on distinct requests one render may batch. */
export const MAX_WIDGET_REQUESTS = 24;

export type WidgetDataParams = Record<string, string | number | boolean>;

export type WidgetDataRequest = {
  /** Stable content hash: identical params across nodes collapse to one request. */
  key: string;
  source: WidgetDataSource;
  params: WidgetDataParams;
};

/**
 * Theme-neutral row shape. Widgets render these; no widget may depend on a
 * source-specific column, which is what keeps one renderer usable by every
 * theme.
 */
export type WidgetRow = {
  id: string;
  title: string;
  href?: string;
  subtitle?: string;
  imageUrl?: string | null;
  priceMinor?: number;
  compareAtMinor?: number;
  currency?: string;
  inStock?: boolean;
  count?: number;
  /** Phase 2.3: rating rows (0–5) and their review counts. */
  rating?: number;
  reviewCount?: number;
  /** Phase 2.3: review rows carry prose, verification and an ISO date. */
  body?: string;
  verified?: boolean;
  date?: string;
  /** Phase 2.3: variant rows carry their option path, e.g. `Red / M`. */
  options?: string;
  /** Phase 2.3: swatch value for the variant picker, `#rrggbb` or a URL. */
  swatch?: string;
  /** Phase 2.7: grouping label for spec rows ("Display", "Battery"…). */
  group?: string;
  /** Phase 2.7: unit suffix for a numeric spec ("mAh", "GB", "months"). */
  unit?: string;
  /** Phase 2.7: already-formatted value the widget prints verbatim. */
  valueText?: string;
  /** Phase 2.7: price-history series in minor units, oldest first. */
  points?: number[];
};

/** Resolved rows addressed by request key. */
export type WidgetDataMap = Record<string, WidgetRow[]>;

export type WidgetDataBundle = {
  /** De-duplicated requests — this is what goes over the wire. */
  requests: WidgetDataRequest[];
  /** node id → request key, so the renderer can read its own rows. */
  byNode: Record<string, string>;
};

export const EMPTY_BUNDLE: WidgetDataBundle = { requests: [], byNode: {} };

function stableParams(params: WidgetDataParams): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
}

export function requestKey(source: WidgetDataSource, params: WidgetDataParams): string {
  const tail = stableParams(params);
  return tail ? `${source}?${tail}` : source;
}

function coerce(kind: string, key: string, value: PropValue | undefined): string | number | boolean | undefined {
  if (kind === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    const clamped = Math.trunc(n);
    if (key === "limit") return Math.min(MAX_WIDGET_ROWS, Math.max(1, clamped));
    return clamped;
  }
  if (kind === "boolean") return value === true ? true : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 120);
  return trimmed === "" ? undefined : trimmed;
}

/** Build the request for a single node, or null when the widget is not data-bound. */
export function requestForSection(section: Section): WidgetDataRequest | null {
  if (section.invalid) return null;
  const meta = WIDGET_REGISTRY[section.type];
  if (!meta?.data) return null;
  const params: WidgetDataParams = {};
  for (const field of meta.data.params) {
    const value = coerce(field.kind, field.key, section.props[field.key]);
    if (value !== undefined) params[field.key] = value;
  }
  return { key: requestKey(meta.data.source, params), source: meta.data.source, params };
}

/**
 * Walk a template (or a section list) and collect every data request exactly
 * once. Nested children are included — containers hold data widgets too.
 */
export function collectWidgetRequests(input: ThemeAst | Section[]): WidgetDataBundle {
  const nodes = Array.isArray(input) ? flattenSections(input) : flattenAst(input);
  const byNode: Record<string, string> = {};
  const seen = new Map<string, WidgetDataRequest>();
  for (const node of nodes) {
    const request = requestForSection(node);
    if (!request) continue;
    byNode[node.id] = request.key;
    if (seen.has(request.key)) continue;
    if (seen.size >= MAX_WIDGET_REQUESTS) continue;
    seen.set(request.key, request);
  }
  return { requests: [...seen.values()], byNode };
}

export function bundleIsEmpty(bundle: WidgetDataBundle): boolean {
  return bundle.requests.length === 0;
}

/** Rows for one node, or undefined when nothing has been resolved for it. */
export function nodeRows(
  bundle: WidgetDataBundle,
  map: WidgetDataMap | null | undefined,
  nodeId: string,
): WidgetRow[] | undefined {
  const key = bundle.byNode[nodeId];
  if (!key || !map) return undefined;
  return map[key];
}
