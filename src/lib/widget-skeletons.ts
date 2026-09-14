/**
 * Phase 7.3 — skeleton parity for every data widget.
 *
 * `WidgetMeta.skeleton` says a widget MUST reserve its box while its rows are
 * in flight; this module says what that box looks like. Deriving the shape
 * from the widget's data source means a new data widget inherits a correct
 * placeholder the moment it is registered, and the test below the registry can
 * prove no data widget renders into an unreserved box.
 */
import type { SectionType } from "./builder-ast";
import { WIDGET_REGISTRY, type WidgetDataSource } from "./widget-registry";

export type SkeletonSpec = {
  /** Layout family the placeholder imitates. */
  kind: "cards" | "lines" | "table" | "media" | "chips";
  /** How many placeholder units to draw. */
  count: number;
  /** Tailwind aspect utility for card/media placeholders. */
  ratio?: string;
};

/** Default placeholder per data source — the shape those rows always render as. */
const BY_SOURCE: Record<WidgetDataSource, SkeletonSpec> = {
  collection: { kind: "cards", count: 4, ratio: "aspect-[3/4]" },
  manual: { kind: "cards", count: 4, ratio: "aspect-[3/4]" },
  recommendation: { kind: "cards", count: 4, ratio: "aspect-[3/4]" },
  product: { kind: "cards", count: 1, ratio: "aspect-square" },
  reviews: { kind: "lines", count: 3 },
  qna: { kind: "lines", count: 3 },
  order: { kind: "lines", count: 4 },
  finance: { kind: "lines", count: 3 },
  facets: { kind: "chips", count: 6 },
  taxonomy: { kind: "chips", count: 6 },
  variants: { kind: "chips", count: 4 },
  specs: { kind: "table", count: 5 },
};

/** Widgets whose real layout differs from their source default. */
const OVERRIDES: Partial<Record<SectionType, SkeletonSpec>> = {
  product_media: { kind: "media", count: 1, ratio: "aspect-square" },
};

/** The placeholder a widget must render while `pending`, or null if it needs none. */
export function skeletonSpec(type: SectionType): SkeletonSpec | null {
  const meta = WIDGET_REGISTRY[type];
  if (!meta?.skeleton) return null;
  const override = OVERRIDES[type];
  if (override) return override;
  return meta.data ? BY_SOURCE[meta.data.source] : { kind: "lines", count: 3 };
}
