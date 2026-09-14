/**
 * Phase 14 — container model.
 *
 * Elementor 4 replaced the fixed section→column pair with a single
 * **Container** that is either Flexbox or Grid. The 12 layout presets below
 * are the ones the "Which layout would you like to use?" dialog offers.
 */
import type { CSSProperties } from "react";
import { resolveResponsive, type DeviceKey, type Maybe } from "./responsive";

export type ContainerLayout = "flex" | "grid";
export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type Justify = "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
export type AlignItems = "flex-start" | "center" | "flex-end" | "stretch";
export type Wrap = "nowrap" | "wrap";
export type ContentWidth = "boxed" | "full";

export type ContainerSettings = {
  layout?: Maybe<ContainerLayout>;
  direction?: Maybe<FlexDirection>;
  justify?: Maybe<Justify>;
  align?: Maybe<AlignItems>;
  wrap?: Maybe<Wrap>;
  gap?: Maybe<number>;
  columns?: Maybe<number>;
  rows?: Maybe<number>;
  autoFlow?: Maybe<"row" | "column">;
  contentWidth?: Maybe<ContentWidth>;
  maxWidth?: Maybe<number>;
  minHeight?: Maybe<number>;
  /** Flex basis, in %, when this container sits inside another flex container. */
  basis?: Maybe<number>;
};

export const FLEX_DEFAULTS: ContainerSettings = {
  layout: "flex",
  direction: "column",
  justify: "flex-start",
  align: "stretch",
  wrap: "nowrap",
  gap: 20,
  contentWidth: "boxed",
  maxWidth: 1140,
};

export const GRID_DEFAULTS: ContainerSettings = {
  layout: "grid",
  columns: 3,
  rows: 1,
  autoFlow: "row",
  gap: 20,
  justify: "flex-start",
  align: "stretch",
  contentWidth: "boxed",
  maxWidth: 1140,
};

/**
 * The 12 presets, keyed exactly as the roadmap lists them. `basis` values are
 * percentages of the parent row; a single `100` means one full-width child.
 */
export type LayoutPreset = {
  key: string;
  label: string;
  layout: ContainerLayout;
  /** One entry per child container; the numbers are flex-basis percentages. */
  rows: number[][];
};

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { key: "c100", label: "Full width", layout: "flex", rows: [[100]] },
  { key: "r100", label: "Row, full width", layout: "flex", rows: [[100]] },
  { key: "50-50", label: "Two equal", layout: "flex", rows: [[50, 50]] },
  { key: "33-66", label: "One third / two thirds", layout: "flex", rows: [[33, 66]] },
  { key: "25-25-25-25", label: "Four equal", layout: "flex", rows: [[25, 25, 25, 25]] },
  { key: "25-50-25", label: "Narrow / wide / narrow", layout: "flex", rows: [[25, 50, 25]] },
  { key: "50-50-50-50", label: "Two by two", layout: "flex", rows: [[50, 50], [50, 50]] },
  { key: "50-50-100", label: "Two up, one full", layout: "flex", rows: [[50, 50], [100]] },
  { key: "c100-c50-50", label: "Full then two", layout: "flex", rows: [[100], [50, 50]] },
  { key: "33x6", label: "Six thirds", layout: "grid", rows: [[33, 33, 33], [33, 33, 33]] },
  { key: "33x4+66", label: "Four thirds and a wide", layout: "grid", rows: [[33, 33, 33], [33, 66]] },
  { key: "66-33-33-66", label: "Wide / narrow, narrow / wide", layout: "flex", rows: [[66, 33], [33, 66]] },
];

export function presetByKey(key: string): LayoutPreset | undefined {
  return LAYOUT_PRESETS.find((p) => p.key === key);
}

/** Total number of child containers a preset creates. */
export function presetChildCount(preset: LayoutPreset): number {
  return preset.rows.reduce((sum, row) => sum + row.length, 0);
}

/** Flatten a preset to the flex-basis list, row by row. */
export function presetBases(preset: LayoutPreset): number[] {
  return preset.rows.flat();
}

export function containerCss(
  settings: ContainerSettings,
  device: DeviceKey = "desktop",
): CSSProperties {
  const layout = resolveResponsive(settings.layout, device) ?? "flex";
  const gap = resolveResponsive(settings.gap, device) ?? 20;
  const justify = resolveResponsive(settings.justify, device);
  const align = resolveResponsive(settings.align, device);
  const contentWidth = resolveResponsive(settings.contentWidth, device) ?? "boxed";
  const maxWidth = resolveResponsive(settings.maxWidth, device) ?? 1140;
  const minHeight = resolveResponsive(settings.minHeight, device);

  const base: CSSProperties = {
    gap,
    justifyContent: justify,
    alignItems: align,
    width: "100%",
    maxWidth: contentWidth === "full" ? "none" : maxWidth,
    marginInline: contentWidth === "full" ? undefined : "auto",
    minHeight,
  };

  if (layout === "grid") {
    const columns = resolveResponsive(settings.columns, device) ?? 3;
    const rows = resolveResponsive(settings.rows, device);
    return {
      ...base,
      display: "grid",
      gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`,
      gridAutoRows: rows && rows > 0 ? "minmax(0, auto)" : undefined,
      gridAutoFlow: resolveResponsive(settings.autoFlow, device),
    };
  }

  return {
    ...base,
    display: "flex",
    flexDirection: resolveResponsive(settings.direction, device) ?? "column",
    flexWrap: resolveResponsive(settings.wrap, device) ?? "nowrap",
  };
}

/** Style applied to a container that is itself a child of a flex container. */
export function childBasisCss(basis: Maybe<number>, device: DeviceKey = "desktop"): CSSProperties {
  const value = resolveResponsive(basis, device);
  if (value === undefined) return {};
  return { flexBasis: `${value}%`, flexGrow: 0, flexShrink: 1, minWidth: 0 };
}
