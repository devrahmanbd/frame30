/**
 * Phase 8 — island hydration policy.
 *
 * Pure module: a widget type maps to one hydration mode, and the renderer
 * (`WidgetIsland`) is the only place that acts on it. Keeping the policy here
 * means the same answer is available to tests, docs and perf budgets without
 * importing React.
 *
 *  - `static`      — server-rendered markup only; the island never hydrates, so
 *                    the widget costs zero client JS on a published page.
 *  - `eager`       — hydrates with the page: chrome and buy-path widgets whose
 *                    first interaction may come before any scroll.
 *  - `visible`     — hydrates when it scrolls into view (default for data and
 *                    below-the-fold widgets).
 *  - `interaction` — hydrates on the first pointer/focus/touch on the node:
 *                    disclosure-style widgets whose closed state is pure markup.
 */
import type { SectionType } from "./builder-ast";

export type HydrationMode = "static" | "eager" | "visible" | "interaction";

/** Markup-only widgets: no state, no browser API, nothing to wake up. */
const STATIC: ReadonlySet<string> = new Set([
  "container",
  "columns",
  "divider",
  "spacer",
  "heading",
  "rich_text",
  "image",
  "banner",
  "feature_row",
  "testimonial",
  "trust_bar",
  "payment_icons",
  "footer_sitemap",
  "breadcrumb",
  "notice",
  "product_meta",
  "spec_table",
  "page_content",
  "hero",
]);

/** Above-the-fold or buy-path widgets: correctness beats byte savings. */
const EAGER: ReadonlySet<string> = new Set([
  "announcement_bar",
  "utility_bar",
  "account_cart",
  "search_command",
  "mega_menu",
  "sticky_bar",
  "add_to_cart",
  "buy_box",
  "variant_picker",
  "cart_summary",
  "html",
  "plugin_block",
  "countdown",
]);

/** Closed-by-default widgets: the shut state is markup, so wake on touch. */
const INTERACTION: ReadonlySet<string> = new Set([
  "accordion",
  "faq",
  "tabs",
  "quiz",
  "quick_view",
  // Phase 7 — overlay-style widgets: the closed state is markup, and the
  // OverlayHost only matters once the shopper reaches for it.
  "cart_drawer",
  "size_guide",
  "facet_sidebar",
  "compare_table",
  "newsletter",
]);

export function hydrationMode(type: SectionType | string): HydrationMode {
  if (STATIC.has(type)) return "static";
  if (EAGER.has(type)) return "eager";
  if (INTERACTION.has(type)) return "interaction";
  return "visible";
}

/** True when a published page ships no client JS for this widget. */
export function isZeroJsWidget(type: SectionType | string): boolean {
  return hydrationMode(type) === "static";
}

/** Share of a layout's widgets that stay markup-only, for the perf budget. */
export function hydrationProfile(types: readonly (SectionType | string)[]) {
  const counts: Record<HydrationMode, number> = { static: 0, eager: 0, visible: 0, interaction: 0 };
  for (const type of types) counts[hydrationMode(type)] += 1;
  const total = types.length || 1;
  return { counts, staticShare: counts.static / total, deferredShare: (counts.static + counts.visible + counts.interaction) / total };
}
