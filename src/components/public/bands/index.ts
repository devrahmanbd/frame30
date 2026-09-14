/**
 * Phase 1 of the design plan (TODO §10.1) — the shared marketing band kit.
 *
 * A marketing page is an ordered list of bands. No route invents a one-off
 * layout, no band writes a colour utility, and every surface, radius and
 * rhythm value resolves from the `.fq-site` token scope in `src/styles.css`.
 *
 * Import from this barrel only.
 */
export {
  Band,
  BandHeading,
  BandSequence,
  Chip,
  type BandProps,
  type BandHeadingProps,
  type BandSurface,
} from "./Band";
export { HeroBand, type HeroBandProps } from "./HeroBand";
export { MarqueeBand, type MarqueeBandProps, type MarqueeMark } from "./MarqueeBand";
export { ZRow, type ZRowProps } from "./ZRow";
export { CardGrid, type CardGridProps, type BandCard } from "./CardGrid";
export {
  MatrixTable,
  InfographicCard,
  type MatrixTableProps,
  type MatrixColumn,
  type MatrixRow,
  type InfographicCardProps,
} from "./MatrixTable";
export { StatBand, type StatBandProps, type BandStat } from "./StatBand";
export { SpotlightBand, type SpotlightBandProps } from "./SpotlightBand";
export { FaqBand, type FaqBandProps, type FaqEntry } from "./FaqBand";
export { CtaBand, type CtaBandProps } from "./CtaBand";
