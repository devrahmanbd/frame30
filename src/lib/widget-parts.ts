/**
 * Frame30 — the composable parts contract.
 *
 * **The one thing this module is.** A widget's *interior* — the ordered parts
 * a row is made of — becomes authorable: the merchant says which parts a
 * widget shows and in which order, and the widget's own renderer draws them.
 *
 * **Why a list of KEYS and never a list of values.** A part key names a part
 * of the widget; the part's VALUE always comes from the server (the quote,
 * the RPC, the session). A theme can therefore reorder a cart line or drop a
 * VAT row, and it can never author a price. The vocabulary is **closed**: a
 * key outside a widget's own list is dropped, never rendered.
 *
 * **The convention.** The platform already has one for an ordered list of
 * tokens in a widget prop — `category_header.subnav` and `payment_icons.marks`
 * both carry comma-separated lists (`parsePickedHandles`,
 * `src/lib/builder-ast.ts:685`). This module reuses that convention, so the
 * parts prop needs **no new inspector field kind** and no change to
 * `src/components/builder/SchemaControls.tsx`.
 *
 * **The compatibility rule.** `defaultParts(type)` is **today's order**, byte
 * for byte. A stored AST written before the prop existed carries no `parts`
 * key, so `parseSection` falls back to the catalogue's default, and the widget
 * renders exactly what it rendered before this module existed. That is the
 * plan's rule (A9): *a change is compatible when a stored AST written before
 * it renders byte-identically after it.*
 *
 * Pure module: no React, no DOM, no database, no server access.
 */
import type { SectionType } from "./builder-ast";

/** The one prop key. Every composable widget carries this field. */
export const PART_PROP_KEY = "parts";

/**
 * The closed part vocabulary, per widget type.
 *
 * Each list is the widget's parts in **today's order** — the order the
 * platform's renderer draws them today — so the default reproduces the
 * current markup exactly. A type that is not listed has no parts.
 */
export const WIDGET_PART_VOCABULARY: Partial<
  Record<SectionType, readonly string[]>
> = {
  cart_lines: [
    "title",
    "variant",
    "unitPrice",
    "quantity",
    "lineTotal",
    "remove",
  ],
  cart_summary: ["subtotal", "discount", "shipping", "cod", "vat", "total"],
  /**
   * `legend` is the ONE document-order exception in the vocabulary.
   *
   * HTML requires a `<legend>` to be the FIRST child of its `<fieldset>`;
   * a legend placed after the controls is invalid markup and browsers hoist
   * it anyway. The renderer therefore always draws the legend first and
   * filters it out of the authored order — the authored order is honoured
   * for every OTHER part. The exception is documented here, not silently
   * applied: a merchant who writes `groups,legend,options` gets
   * `legend,groups,options`, and the suite pins that exact behaviour.
   */
  payment_methods: ["legend", "groups", "options", "note"],
  checkout_steps: ["labels", "active", "links"],
  orders_list: ["number", "date", "status", "total"],
  profile_card: ["avatar", "name", "email", "phone"],
  /**
   * The account's placeable orders panel — the same four fields the
   * `orders_list` widget's rows carry, in the same order. The panel is the
   * theme-placed twin of the dashboard's own orders tab: the row's
   * interior is authorable, the row's VALUES are the server's.
   */
  account_orders: ["number", "date", "status", "total"],
};

/**
 * Parses the author's comma-separated part list.
 *
 * - splits on commas and trims each token;
 * - lowercases **nothing** (the keys are camelCase and the vocabulary is
 *   closed, so `unitprice` is a different key from `unitPrice` — and it is
 *   simply not a key);
 * - drops any token outside `allowed` — an unknown part is never rendered;
 * - drops a repeat — the same part appears once;
 * - caps the length at `allowed.length` — the list can never be longer than
 *   the vocabulary;
 * - returns `[]` for an empty, blank or wholly-unknown value, so the caller
 *   falls back to `defaultParts(type)`.
 *
 * It never throws.
 */
export function parseOrderedParts(
  raw: unknown,
  allowed: readonly string[],
): string[] {
  if (typeof raw !== "string" || allowed.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(",")) {
    const key = token.trim();
    if (!key) continue;
    if (!allowed.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= allowed.length) break;
  }
  return out;
}

/**
 * The widget's default part order — today's order, byte for byte.
 *
 * Returns a fresh array every call, so a caller can never mutate the shared
 * vocabulary.
 */
export function defaultParts(type: SectionType): readonly string[] {
  return [...(WIDGET_PART_VOCABULARY[type] ?? [])];
}

/**
 * The effective order: the author's list when it is usable, otherwise the
 * widget's default order.
 *
 * "Usable" means the parsed list is non-empty — and `parseOrderedParts` has
 * already dropped every key outside the vocabulary, so a list that survives
 * it is known by construction. An empty, blank or wholly-unknown value falls
 * back to `defaultParts(type)`, which is what makes a stored AST written
 * before the prop existed render exactly as it did.
 */
export function partOrder(raw: unknown, type: SectionType): string[] {
  const allowed = WIDGET_PART_VOCABULARY[type] ?? [];
  const parsed = parseOrderedParts(raw, allowed);
  return parsed.length > 0 ? parsed : [...allowed];
}

/**
 * True when the widget type has a part vocabulary at all. A type without one
 * renders exactly as it did before this contract existed.
 */
export function hasParts(type: SectionType): boolean {
  return (WIDGET_PART_VOCABULARY[type] ?? []).length > 0;
}
