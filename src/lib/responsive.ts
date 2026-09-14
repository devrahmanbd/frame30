/**
 * Phase 6 — the platform responsive contract.
 *
 * One module owns breakpoints, the grid, device presets, touch metrics and the
 * lint vocabulary that keeps merchant-authored layouts fluid. The editor, the
 * renderer, the lint pass and the tests all import from here, so the studio's
 * device frames can never drift from production media queries.
 */

/** Fixed platform-wide breakpoints (px, min-width). Never per-theme. */
export const BREAKPOINT_PX = {
  base: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type BreakpointName = keyof typeof BREAKPOINT_PX;
export const BREAKPOINT_NAMES = Object.keys(BREAKPOINT_PX) as BreakpointName[];

/** Editing buckets the inspector writes overrides into. */
export type DeviceBucket = "mobile" | "tablet" | "desktop";

/**
 * Which editing bucket a CSS breakpoint belongs to. Mobile-first authoring:
 * `base`/`sm` is the source of truth, `md`/`lg` and up are overrides only.
 */
export const BUCKET_OF_BREAKPOINT: Record<BreakpointName, DeviceBucket> = {
  base: "mobile",
  sm: "mobile",
  md: "tablet",
  lg: "tablet",
  xl: "desktop",
  "2xl": "desktop",
};

/** Columns available per bucket, with a fixed gutter. */
export const GRID_COLS: Record<DeviceBucket, number> = { mobile: 4, tablet: 8, desktop: 12 };
export const GRID_GUTTER_PX = 16;

/** Minimum interactive target, both axes. */
export const MIN_TOUCH_PX = 44;

/** Smallest width the storefront must render without horizontal overflow. */
export const MIN_SUPPORTED_WIDTH_PX = 320;

/**
 * Studio device frames. Each width maps onto the bucket the inspector edits,
 * so "preview at 375" and "edit the mobile layer" are one gesture.
 */
export const DEVICE_PRESETS = [
  { width: 320, label: "320", bp: "mobile" },
  { width: 375, label: "375", bp: "mobile" },
  { width: 768, label: "768", bp: "tablet" },
  { width: 1024, label: "1024", bp: "tablet" },
  { width: 1440, label: "1440", bp: "desktop" },
] as const satisfies readonly { width: number; label: string; bp: DeviceBucket }[];

/** The bucket a viewport width resolves to, using the platform breakpoints. */
export function bucketForWidth(width: number): DeviceBucket {
  if (width >= BREAKPOINT_PX.xl) return "desktop";
  if (width >= BREAKPOINT_PX.md) return "tablet";
  return "mobile";
}

/** Column spans a widget may claim, per bucket. `0` = auto (full flow width). */
export function clampSpan(value: unknown, bucket: DeviceBucket = "desktop"): number {
  const n = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, GRID_COLS[bucket]);
}

/**
 * Static class map — Tailwind never sees a computed class name. Spans are
 * expressed against the 12-column desktop grid; narrower buckets clamp, so a
 * span of 12 fills the row everywhere.
 */
const SPAN_CLASS: Record<number, string> = {
  1: "fq-span-1",
  2: "fq-span-2",
  3: "fq-span-3",
  4: "fq-span-4",
  5: "fq-span-5",
  6: "fq-span-6",
  7: "fq-span-7",
  8: "fq-span-8",
  9: "fq-span-9",
  10: "fq-span-10",
  11: "fq-span-11",
  12: "fq-span-12",
};

export function spanClass(value: unknown): string {
  const n = clampSpan(value);
  return n ? (SPAN_CLASS[n] ?? "") : "";
}

/**
 * Fixed pixel widths are a Bangla-hostile pattern: বাংলা strings run 15–30%
 * longer than English, so any hard width clips the label. Publish-blocking.
 */
const FIXED_WIDTH_PATTERNS = [
  /\bw-\[\s*\d+(?:px|rem|em)\s*\]/i,
  /\bmin-w-\[\s*\d{3,}px\s*\]/i,
  /(?:^|[;{\s])width\s*:\s*\d+(?:px|rem|em)/i,
];

export function hasFixedWidth(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return FIXED_WIDTH_PATTERNS.some((re) => re.test(value));
}

/**
 * Text that must never be uppercased. Bangla has no case, and
 * `text-transform: uppercase` on a বাংলা string mangles conjuncts.
 */
export function isUppercaseHostile(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

/* ==========================================================================
 * Phase 5 — the authoring layer model
 *
 * The editor writes overrides into three layers. `desktop` is the base layer
 * (it lives in `section.props`), `tablet` and `mobile` are override layers in
 * `section.bp`. Authoring is therefore desktop-down, while the emitted CSS is
 * range-scoped so a narrow layer never leaks upward.
 * ==========================================================================
 */

/** Hard floor the storefront must survive without horizontal overflow. */
export const MIN_FLOOR_WIDTH_PX = 320;
/** The width the responsive sweep treats as the realistic small phone. */
export const MIN_PREFERRED_WIDTH_PX = 360;

/**
 * Media range each authoring layer owns. `desktop` is unconditional (it is the
 * base cascade), the other two are bounded so their rules cannot escape their
 * device class.
 */
export const LAYER_RANGE: Record<DeviceBucket, { min: number | null; max: number | null }> = {
  desktop: { min: null, max: null },
  tablet: { min: BREAKPOINT_PX.md, max: BREAKPOINT_PX.xl - 0.02 },
  mobile: { min: null, max: BREAKPOINT_PX.md - 0.02 },
};

/** Narrow-to-wide cascade order. A mobile value falls back to tablet, then base. */
export const LAYER_CASCADE: Record<DeviceBucket, DeviceBucket[]> = {
  desktop: ["desktop"],
  tablet: ["tablet", "desktop"],
  mobile: ["mobile", "tablet", "desktop"],
};

/** The media query text for a layer, or `null` when the layer is the base. */
export function layerMedia(bucket: DeviceBucket): string | null {
  const range = LAYER_RANGE[bucket];
  const parts: string[] = [];
  if (range.min !== null) parts.push(`(min-width: ${range.min}px)`);
  if (range.max !== null) parts.push(`(max-width: ${range.max}px)`);
  return parts.length ? `@media ${parts.join(" and ")}` : null;
}

/**
 * Layout props a merchant may override per device. Everything outside this
 * set is a single-value decision (radius, shadow, reveal) — allowing a
 * per-device override there buys nothing and doubles the emitted CSS.
 */
export const RESPONSIVE_LAYOUT_KEYS = [
  "span",
  "columns",
  "cols",
  "gap",
  "order",
  "align",
  "padY",
  "padX",
  "maxW",
  "ratio",
] as const;
export type ResponsiveLayoutKey = (typeof RESPONSIVE_LAYOUT_KEYS)[number];

const RESPONSIVE_KEY_SET = new Set<string>(RESPONSIVE_LAYOUT_KEYS);
export function isResponsiveLayoutKey(key: string): key is ResponsiveLayoutKey {
  return RESPONSIVE_KEY_SET.has(key);
}

export type LayerSource = DeviceBucket | "default";

export type Inheritance<V = unknown> = {
  /** The value this device actually renders with. */
  value: V | undefined;
  /** Which layer supplied it. */
  source: LayerSource;
  /** True when the value comes from a wider layer than the one being edited. */
  inherited: boolean;
  /** True when this exact layer declares the key (so "reset" is meaningful). */
  overridden: boolean;
};

/**
 * Where the value on screen came from. The inspector renders this verbatim:
 * "inherited from desktop" plus a reset action only when `overridden`.
 */
export function inheritanceOf<V = unknown>(
  input: {
    props: Record<string, unknown>;
    bp?: Partial<Record<DeviceBucket, Record<string, unknown>>> | undefined;
  },
  key: string,
  bucket: DeviceBucket,
): Inheritance<V> {
  const chain = LAYER_CASCADE[bucket];
  for (const layer of chain) {
    const bag = layer === "desktop" ? input.props : input.bp?.[layer];
    if (bag && Object.prototype.hasOwnProperty.call(bag, key)) {
      return {
        value: bag[key] as V,
        source: layer,
        inherited: layer !== bucket,
        overridden: layer === bucket,
      };
    }
  }
  return { value: undefined, source: "default", inherited: bucket !== "desktop", overridden: false };
}
