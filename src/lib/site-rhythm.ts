/**
 * Phase 10.3 — the visual rhythm contract for the `.fq-site` marketing surface.
 *
 * TODO §10.3 states four rules in prose. Prose does not survive contact with
 * nine routes and a copy edit six weeks later, so this module is the single
 * machine-readable definition of those rules, and everything that could drift
 * reads from it:
 *
 *   - `Band` derives its container width and section padding from `RHYTHM`,
 *     so the rhythm cannot be re-typed per page.
 *   - `BandSequence` audits the live surface order in development and reports
 *     the same coded findings the release gate reports.
 *   - `scripts/rhythm-gate.mjs` re-measures the rendered DOM in a browser at
 *     every supported width and re-runs these exact auditors on the numbers.
 *
 * Design notes that are easy to get wrong later:
 *
 *   1. The auditors are pure functions over plain records. The browser gate
 *      collects measurements and hands them here; that keeps every threshold
 *      unit-testable without Playwright and keeps one implementation of the
 *      rules rather than two that disagree.
 *   2. Every finding carries a stable `code`. Codes are the contract with CI
 *      and with the ignore list; messages are for humans and may be reworded.
 *   3. Layout engines round. Each numeric rule carries an explicit tolerance,
 *      because a gate that fails on 111.6px vs 112px gets muted within a week
 *      and then protects nothing.
 *   4. Findings are advisory (`warn`) when the rule is a judgement call under
 *      real content, and blocking (`error`) when the rule is a measurable
 *      invariant. The gate decides what to block on; this module never exits.
 */

/* -------------------------------------------------------------------------- */
/* Spec                                                                       */
/* -------------------------------------------------------------------------- */

/** The three legal band surfaces. Mirrors `BandSurface` in the band kit. */
export type RhythmSurface = "canvas" | "glass" | "aurora";

/** Container presets. `default` is the artboard width; the others are escapes. */
export type RhythmWidth = "default" | "narrow" | "wide";

/** Vertical rhythm presets a band may claim. */
export type RhythmDensity = "section" | "tight";

/**
 * Geometry. Pixel values are CSS px and are the *authored* values; measured
 * values are compared with `RHYTHM.tolerancePx` slack in both directions.
 */
export const RHYTHM = {
  /** TODO §10.3: "Container 1200px". */
  containerPx: 1200,
  /** Reading-measure container for legal/doc prose. */
  narrowPx: 768,
  /** Escape hatch for wide matrices and gallery rows. */
  widePx: 1440,
  /** TODO §10.3: "section rhythm 112px desktop / 72px mobile". */
  sectionDesktopPx: 112,
  sectionMobilePx: 72,
  /** Two bands that read as one unit may halve the rhythm, never less. */
  tightDesktopPx: 56,
  tightMobilePx: 40,
  /** Gutters keep the artboard off the bezel at 320px. */
  gutterMobilePx: 16,
  gutterDesktopPx: 24,
  /** The `md` breakpoint: at and above this width the desktop rhythm applies. */
  desktopMinWidthPx: 768,
  /** Sub-pixel and rounding slack for every geometry comparison. */
  tolerancePx: 2,
  /** Horizontal overflow slack, kept in sync with the responsive sweep. */
  overflowSlackPx: 1,
} as const;

/**
 * Chroma budget. The dark canvas only works because colour is rationed; the
 * failure mode in practice is not "too grey", it is "every band got a tile".
 */
export const CHROMA = {
  /** TODO §10.3: "at most one aurora tile per viewport". */
  maxAuroraPerViewport: 1,
  /** TODO §10.3: "one signal-blue element per band". */
  maxSignalPerBand: 1,
  /** ...and the inverse rule: "No greyscale-only page". */
  minChromaticElementsPerPage: 1,
  /**
   * Two aurora bands separated by fewer than this many bands will co-occur in
   * one viewport on a tall desktop screen. Adjacency alone is too weak a test.
   */
  minBandsBetweenAurora: 2,
} as const;

/** Type scale rules. Ratios, not classes, so clamps stay legal. */
export const TYPE = {
  /** TODO §10.3: "Manrope body at 17/1.6". */
  bodyPx: 17,
  bodyPxTolerance: 1,
  bodyLineHeight: 1.6,
  /** Display tracking is a percentage of size and must survive every clamp. */
  displayTrackingEm: -0.042,
  displayTrackingToleranceEm: 0.004,
  /**
   * Poster tracking is a *size-dependent* rule. Optical tightening only reads
   * as intentional above roughly 28px; a 20px card title tracked at -0.042em
   * looks cramped, so below the threshold the contract is only "never loose".
   */
  displayTrackingMinPx: 28,
  displayTrackingMaxEmSmall: 0.001,
  /** `lang="bn"` resets tracking to 0 and needs a taller line box. */
  bnTrackingEm: 0,
  bnTrackingToleranceEm: 0.002,
  bnMinLineHeight: 1.35,
  /**
   * Tailwind's `text-base` ships a 1.5 line-height, and a handful of bands use
   * it deliberately for dense captions. 1.5 is inside the tolerance so those do
   * not drown the report; anything tighter than 1.49 is still reported.
   */
  lineHeightTolerance: 0.11,
  /** Fonts we expect to resolve on the marketing surface. */
  displayFamily: "Space Grotesk",
  bodyFamily: "DM Sans",
  bnFamily: "Noto Sans Bengali",
} as const;

/** Elevation is edge-light, not shadow. */
export const ELEVATION = {
  /** TODO §10.3: "1px rgba(255,255,255,0.14) inner edge". */
  edgeAlpha: 0.14,
  edgeAlphaTolerance: 0.07,
  edgeWidthPx: 1,
  /**
   * A drop shadow is allowed only as a *depth cue under* the edge light, and
   * never as the only elevation signal. Above this blur the surface reads as
   * a Material card and loses the artboard look.
   */
  maxAmbientBlurPx: 96,
} as const;

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export type RhythmSeverity = "error" | "warn" | "info";

/**
 * Stable finding codes. Keep them append-only: CI configs, the gate's
 * `--allow` list and the security/design memory all reference these strings.
 */
export type RhythmCode =
  | "rhythm.container.too_wide"
  | "rhythm.container.unexpected_width"
  | "rhythm.section.padding_drift"
  | "rhythm.section.overflow"
  | "surface.glass_stacked"
  | "surface.aurora_crowded"
  | "surface.unknown"
  | "chroma.greyscale_page"
  | "chroma.signal_over_budget"
  | "type.body_size"
  | "type.body_line_height"
  | "type.display_tracking_lost"
  | "type.bn_tracking_not_reset"
  | "type.bn_line_box_tight"
  | "type.family_missing"
  | "elevation.edge_missing"
  | "elevation.edge_alpha"
  | "elevation.shadow_only";

export type RhythmFinding = {
  code: RhythmCode;
  severity: RhythmSeverity;
  /** Human-readable rule name, for grouped reports. */
  rule: string;
  /** What to fix, in one sentence, with the measured number in it. */
  message: string;
  /** Where it was found: route, band index, selector — whatever is known. */
  where: string;
  /** Machine-readable measurement, for trend reports. */
  actual?: number | string;
  expected?: number | string;
};

const finding = (
  code: RhythmCode,
  severity: RhythmSeverity,
  rule: string,
  where: string,
  message: string,
  actual?: number | string,
  expected?: number | string,
): RhythmFinding => ({ code, severity, rule, where, message, actual, expected });

const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
const px = (n: number) => `${Math.round(n * 10) / 10}px`;

/* -------------------------------------------------------------------------- */
/* Rule 1 — container and section rhythm                                     */
/* -------------------------------------------------------------------------- */

/** One band as the browser sees it. Produced by the gate, consumed here. */
export type BandMeasurement = {
  /** 0-based position in the page's band order. */
  index: number;
  /** Selector or heading text, used only in messages. */
  label: string;
  surface: RhythmSurface | "unknown";
  width: RhythmWidth | "custom";
  density: RhythmDensity;
  /** Measured width of the band's inner container, in CSS px. */
  containerWidthPx: number;
  paddingTopPx: number;
  paddingBottomPx: number;
  /** Scroll width of the band, to catch a single band overflowing the page. */
  scrollWidthPx: number;
  clientWidthPx: number;
  /** Count of aurora/spotlight tiles inside this band. */
  auroraCount: number;
  /** Count of elements painting signal blue inside this band. */
  signalCount: number;
};

/** Expected inner container width for a preset at a given viewport width. */
export function expectedContainerPx(width: RhythmWidth, viewportPx: number): number {
  const gutter =
    viewportPx >= RHYTHM.desktopMinWidthPx ? RHYTHM.gutterDesktopPx : RHYTHM.gutterMobilePx;
  const cap =
    width === "narrow" ? RHYTHM.narrowPx : width === "wide" ? RHYTHM.widePx : RHYTHM.containerPx;
  return Math.min(cap, Math.max(0, viewportPx - gutter * 2));
}

/** Expected vertical padding for a density at a given viewport width. */
export function expectedSectionPaddingPx(density: RhythmDensity, viewportPx: number): number {
  const desktop = viewportPx >= RHYTHM.desktopMinWidthPx;
  if (density === "tight") return desktop ? RHYTHM.tightDesktopPx : RHYTHM.tightMobilePx;
  return desktop ? RHYTHM.sectionDesktopPx : RHYTHM.sectionMobilePx;
}

/**
 * Geometry audit. Padding drift is a warning rather than an error because a
 * hero legitimately runs taller than the rhythm; a container wider than the
 * artboard is an error because it breaks the page's spine at every width.
 */
export function auditGeometry(
  bands: readonly BandMeasurement[],
  viewportPx: number,
  where = "page",
): RhythmFinding[] {
  const out: RhythmFinding[] = [];
  for (const band of bands) {
    const at = `${where} · band ${band.index} (${band.label})`;

    if (band.width !== "custom") {
      const want = expectedContainerPx(band.width, viewportPx);
      if (band.containerWidthPx > want + RHYTHM.tolerancePx) {
        out.push(
          finding(
            "rhythm.container.too_wide",
            "error",
            "Container 1200px",
            at,
            `Inner container measures ${px(band.containerWidthPx)} but the "${band.width}" preset caps at ${px(want)} on a ${viewportPx}px viewport.`,
            band.containerWidthPx,
            want,
          ),
        );
      } else if (!near(band.containerWidthPx, want, RHYTHM.tolerancePx + 2)) {
        out.push(
          finding(
            "rhythm.container.unexpected_width",
            "warn",
            "Container 1200px",
            at,
            `Inner container measures ${px(band.containerWidthPx)}, expected ${px(want)}. Usually an extra wrapper adding its own padding.`,
            band.containerWidthPx,
            want,
          ),
        );
      }
    }

    const wantPad = expectedSectionPaddingPx(band.density, viewportPx);
    for (const [edge, value] of [
      ["top", band.paddingTopPx],
      ["bottom", band.paddingBottomPx],
    ] as const) {
      // Bands may pad *more* than the rhythm deliberately (hero, final CTA);
      // padding under the rhythm is what collapses the page into a wall.
      if (value < wantPad - RHYTHM.tolerancePx) {
        out.push(
          finding(
            "rhythm.section.padding_drift",
            "warn",
            "Section rhythm 112/72",
            at,
            `padding-${edge} is ${px(value)}, below the ${px(wantPad)} rhythm for a "${band.density}" band at ${viewportPx}px.`,
            value,
            wantPad,
          ),
        );
      }
    }

    if (band.scrollWidthPx > band.clientWidthPx + RHYTHM.overflowSlackPx) {
      out.push(
        finding(
          "rhythm.section.overflow",
          "error",
          "No horizontal overflow",
          at,
          `Band scrolls ${px(band.scrollWidthPx - band.clientWidthPx)} wider than its box. Something inside is fixed-width.`,
          band.scrollWidthPx,
          band.clientWidthPx,
        ),
      );
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Rule 1b + 2 — surface order and the chroma budget                          */
/* -------------------------------------------------------------------------- */

/**
 * Surface-order audit: "never two glass surfaces stacked without a canvas
 * band between them", plus the aurora spacing that keeps one tile per
 * viewport, plus the inverse "no greyscale-only page" rule.
 *
 * Aurora counts as a glass-family surface for the stacking rule: two blurred
 * fields in a row read as one long smear with no edge between them, which is
 * exactly the failure the rule exists to prevent.
 */
export function auditSurfaceOrder(
  surfaces: readonly { surface: RhythmSurface | "unknown"; label: string }[],
  where = "page",
): RhythmFinding[] {
  const out: RhythmFinding[] = [];
  const isGlassFamily = (s: string) => s === "glass" || s === "aurora";

  surfaces.forEach((band, i) => {
    if (band.surface === "unknown") {
      out.push(
        finding(
          "surface.unknown",
          "warn",
          "Three legal surfaces",
          `${where} · band ${i} (${band.label})`,
          `Band declares no known surface. Use canvas, glass or aurora so the stacking rule can be checked.`,
          band.surface,
          "canvas|glass|aurora",
        ),
      );
      return;
    }
    const prev = surfaces[i - 1];
    if (prev && isGlassFamily(prev.surface) && isGlassFamily(band.surface)) {
      out.push(
        finding(
          "surface.glass_stacked",
          "error",
          "No two glass surfaces stacked",
          `${where} · bands ${i - 1}→${i} (${prev.label} → ${band.label})`,
          `"${prev.surface}" is followed directly by "${band.surface}". Insert a canvas band so the surfaces have an edge between them.`,
          `${prev.surface}+${band.surface}`,
          "canvas between",
        ),
      );
    }
  });

  const auroraAt = surfaces
    .map((b, i) => (b.surface === "aurora" ? i : -1))
    .filter((i) => i >= 0);
  for (let i = 1; i < auroraAt.length; i += 1) {
    const gap = auroraAt[i]! - auroraAt[i - 1]! - 1;
    if (gap < CHROMA.minBandsBetweenAurora) {
      out.push(
        finding(
          "surface.aurora_crowded",
          "warn",
          "One aurora tile per viewport",
          `${where} · bands ${auroraAt[i - 1]}→${auroraAt[i]}`,
          `Only ${gap} band(s) separate two aurora fields; ${CHROMA.minBandsBetweenAurora} are needed to keep one per viewport on a tall screen.`,
          gap,
          CHROMA.minBandsBetweenAurora,
        ),
      );
    }
  }

  return out;
}

/** Chroma budget over measured bands (needs paint counts, not just order). */
export function auditChroma(
  bands: readonly BandMeasurement[],
  where = "page",
): RhythmFinding[] {
  const out: RhythmFinding[] = [];
  let chromatic = 0;
  for (const band of bands) {
    chromatic += band.auroraCount + band.signalCount;
    if (band.signalCount > CHROMA.maxSignalPerBand) {
      out.push(
        finding(
          "chroma.signal_over_budget",
          "warn",
          "One signal-blue element per band",
          `${where} · band ${band.index} (${band.label})`,
          `${band.signalCount} signal-blue elements in one band; the budget is ${CHROMA.maxSignalPerBand}. Demote the extras to foreground or muted.`,
          band.signalCount,
          CHROMA.maxSignalPerBand,
        ),
      );
    }
  }
  if (bands.length > 0 && chromatic < CHROMA.minChromaticElementsPerPage) {
    out.push(
      finding(
        "chroma.greyscale_page",
        "warn",
        "No greyscale-only page",
        where,
        `No aurora field and no signal-blue element on the whole page. Give it one chromatic anchor.`,
        chromatic,
        CHROMA.minChromaticElementsPerPage,
      ),
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Rule 3 — type                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Roles, not guesses. The first paragraph in a band is as likely to be a card
 * caption or a stat numeral as it is body prose, so the band primitives declare
 * `data-type-role` and the gate measures what was declared. Sampling by tag
 * alone produced 53 "body copy renders at 12px" findings on correct markup —
 * a report nobody reads is the same as no report.
 */
export type TypeRole = "display" | "lead" | "body" | "caption" | "numeral";

/** Per-role size and line-box rules. `null` size means "no size rule". */
export const TYPE_ROLES: Record<TypeRole, { minPx: number | null; maxPx: number | null; minRatio: number }> = {
  // Display is governed by the tracking rule; clamps make a size rule useless.
  display: { minPx: null, maxPx: null, minRatio: 0.95 },
  // The hero sub-headline: bigger than body, still prose.
  lead: { minPx: 16, maxPx: 30, minRatio: 1.35 },
  // TODO §10.3: "Manrope body at 17/1.6".
  body: { minPx: TYPE.bodyPx - TYPE.bodyPxTolerance, maxPx: TYPE.bodyPx + TYPE.bodyPxTolerance, minRatio: TYPE.bodyLineHeight - TYPE.lineHeightTolerance },
  // Micro copy: labels, notes, table footnotes. Floor is legibility, not scale.
  caption: { minPx: 12, maxPx: 15, minRatio: 1.3 },
  // Stat values are display-scale numerals with a tight, deliberate line box.
  numeral: { minPx: 20, maxPx: null, minRatio: 0.95 },
};

export type TypeSample = {
  label: string;
  kind: TypeRole;
  /** Resolved `lang` of the nearest ancestor that sets it. */
  lang: string;
  fontFamily: string;
  fontSizePx: number;
  /** Computed line-height in px; `normal` should be resolved before this. */
  lineHeightPx: number;
  /** Computed letter-spacing in px (browsers report px, never em). */
  letterSpacingPx: number;
};

export function auditTypography(
  samples: readonly TypeSample[],
  where = "page",
): RhythmFinding[] {
  const out: RhythmFinding[] = [];
  for (const s of samples) {
    const at = `${where} · ${s.label}`;
    const bn = s.lang.toLowerCase().startsWith("bn");
    const ratio = s.fontSizePx > 0 ? s.lineHeightPx / s.fontSizePx : 0;
    const trackingEm = s.fontSizePx > 0 ? s.letterSpacingPx / s.fontSizePx : 0;
    const role = TYPE_ROLES[s.kind] ?? TYPE_ROLES.body;

    if (s.kind !== "display") {
      const tooSmall = role.minPx !== null && s.fontSizePx < role.minPx - 0.5;
      const tooLarge = role.maxPx !== null && s.fontSizePx > role.maxPx + 0.5;
      if (tooSmall || tooLarge) {
        out.push(
          finding(
            "type.body_size",
            "warn",
            "DM Sans body 17/1.6",
            at,
            `"${s.kind}" copy renders at ${px(s.fontSizePx)}; the ${s.kind} scale is ${role.minPx ?? "—"}–${role.maxPx ?? "∞"}px.`,
            s.fontSizePx,
            s.kind === "body" ? TYPE.bodyPx : `${role.minPx}-${role.maxPx}`,
          ),
        );
      }
      // Bangla always wins on the line box: matras need the taller box even in
      // a caption, and clipping them is a blocking defect, not a preference.
      const minRatio = bn ? TYPE.bnMinLineHeight : role.minRatio;
      if (ratio < minRatio - (bn ? TYPE.lineHeightTolerance : 0)) {
        out.push(
          finding(
            "type.body_line_height",
            bn ? "error" : "warn",
            bn ? "Bangla line box ≥ 1.35" : "DM Sans body 17/1.6",
            at,
            `Line-height ratio is ${ratio.toFixed(2)}, below ${minRatio.toFixed(2)}${bn ? " — matras clip at this line box" : ""}.`,
            Number(ratio.toFixed(3)),
            minRatio,
          ),
        );
      }
    }

    if (s.kind === "display") {
      if (bn) {
        if (Math.abs(trackingEm - TYPE.bnTrackingEm) > TYPE.bnTrackingToleranceEm) {
          out.push(
            finding(
              "type.bn_tracking_not_reset",
              "error",
              "Bangla resets tracking",
              at,
              `Bangla display keeps ${trackingEm.toFixed(3)}em tracking; it must reset to 0 or conjuncts break apart.`,
              Number(trackingEm.toFixed(4)),
              0,
            ),
          );
        }
        if (ratio < TYPE.bnMinLineHeight - TYPE.lineHeightTolerance) {
          out.push(
            finding(
              "type.bn_line_box_tight",
              "error",
              "Bangla line box ≥ 1.35",
              at,
              `Bangla display line box is ${ratio.toFixed(2)}; ${TYPE.bnMinLineHeight} is the floor for matras.`,
              Number(ratio.toFixed(3)),
              TYPE.bnMinLineHeight,
            ),
          );
        }
      } else if (
        s.fontSizePx < TYPE.displayTrackingMinPx
          ? trackingEm > TYPE.displayTrackingMaxEmSmall
          : Math.abs(trackingEm - TYPE.displayTrackingEm) > TYPE.displayTrackingToleranceEm
      ) {
        // The classic regression: a clamp() font-size with a px tracking value,
        // so the poster tracking evaporates at large sizes.
        out.push(
          finding(
            "type.display_tracking_lost",
            "warn",
            "Display tracking survives clamps",
            at,
            s.fontSizePx < TYPE.displayTrackingMinPx
              ? `Sub-display heading at ${px(s.fontSizePx)} tracks ${trackingEm.toFixed(3)}em; display type is never tracked loose.`
              : `Display tracking resolves to ${trackingEm.toFixed(3)}em, expected ${TYPE.displayTrackingEm}em. Track in em, never px.`,
            Number(trackingEm.toFixed(4)),
            TYPE.displayTrackingEm,
          ),
        );
      }
    }

    const wantFamily =
      bn ? TYPE.bnFamily : s.kind === "display" ? TYPE.displayFamily : TYPE.bodyFamily;
    if (!s.fontFamily.toLowerCase().includes(wantFamily.toLowerCase())) {
      out.push(
        finding(
          "type.family_missing",
          "info",
          "Space Grotesk display / DM Sans body",
          at,
          `Resolved family "${s.fontFamily}" does not list ${wantFamily}.`,
          s.fontFamily,
          wantFamily,
        ),
      );
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Rule 4 — elevation is edge-light                                           */
/* -------------------------------------------------------------------------- */

export type GlassSample = {
  label: string;
  /** Alpha of the 1px light edge, however it is painted (border or inset). */
  edgeAlpha: number | null;
  edgeWidthPx: number;
  /** Largest blur radius among non-inset shadows, 0 when there is none. */
  ambientBlurPx: number;
  hasInsetHighlight: boolean;
};

export function auditElevation(
  samples: readonly GlassSample[],
  where = "page",
): RhythmFinding[] {
  const out: RhythmFinding[] = [];
  for (const s of samples) {
    const at = `${where} · ${s.label}`;
    if (s.edgeAlpha === null || s.edgeWidthPx < ELEVATION.edgeWidthPx - 0.5) {
      out.push(
        finding(
          "elevation.edge_missing",
          "error",
          "Edge-light elevation",
          at,
          `Glass surface has no 1px light edge (${s.edgeWidthPx ? px(s.edgeWidthPx) : "no border"}). Elevation on this canvas is an edge, not a shadow.`,
          s.edgeWidthPx,
          ELEVATION.edgeWidthPx,
        ),
      );
    } else if (Math.abs(s.edgeAlpha - ELEVATION.edgeAlpha) > ELEVATION.edgeAlphaTolerance) {
      out.push(
        finding(
          "elevation.edge_alpha",
          "warn",
          "Edge-light elevation",
          at,
          `Edge alpha is ${s.edgeAlpha.toFixed(3)}; the spec edge is ${ELEVATION.edgeAlpha}.`,
          Number(s.edgeAlpha.toFixed(3)),
          ELEVATION.edgeAlpha,
        ),
      );
    }
    if (s.ambientBlurPx > ELEVATION.maxAmbientBlurPx && !s.hasInsetHighlight) {
      out.push(
        finding(
          "elevation.shadow_only",
          "warn",
          "Edge-light elevation",
          at,
          `Surface leans on a ${px(s.ambientBlurPx)} drop shadow with no inset highlight; it reads as a Material card.`,
          s.ambientBlurPx,
          ELEVATION.maxAmbientBlurPx,
        ),
      );
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                  */
/* -------------------------------------------------------------------------- */

export type PageMeasurement = {
  route: string;
  viewportPx: number;
  locale: string;
  bands: BandMeasurement[];
  type: TypeSample[];
  glass: GlassSample[];
};

export type RhythmReport = {
  route: string;
  viewportPx: number;
  locale: string;
  findings: RhythmFinding[];
  counts: Record<RhythmSeverity, number>;
  /** True when nothing blocking was found. */
  ok: boolean;
};

/** Runs every rule for one page at one viewport. Never throws, never exits. */
export function auditPage(page: PageMeasurement): RhythmReport {
  const where = `${page.route} @${page.viewportPx}/${page.locale}`;
  const findings = [
    ...auditGeometry(page.bands, page.viewportPx, where),
    ...auditSurfaceOrder(page.bands, where),
    ...auditChroma(page.bands, where),
    ...auditTypography(page.type, where),
    ...auditElevation(page.glass, where),
  ];
  return {
    route: page.route,
    viewportPx: page.viewportPx,
    locale: page.locale,
    findings,
    counts: countBySeverity(findings),
    ok: findings.every((f) => f.severity !== "error"),
  };
}

export function countBySeverity(findings: readonly RhythmFinding[]): Record<RhythmSeverity, number> {
  return findings.reduce(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { error: 0, warn: 0, info: 0 } as Record<RhythmSeverity, number>,
  );
}

/**
 * Collapses repeats across viewports and locales. One padding drift measured
 * at six widths is one problem, and a report that says so is a report someone
 * actually reads.
 */
export function dedupeFindings(findings: readonly RhythmFinding[]): RhythmFinding[] {
  const seen = new Map<string, RhythmFinding>();
  for (const f of findings) {
    const key = `${f.code}|${f.where.replace(/@\d+\/[a-z-]+/i, "@*")}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}

export function formatFinding(f: RhythmFinding): string {
  const tag = f.severity === "error" ? "FAIL" : f.severity === "warn" ? "WARN" : "INFO";
  return `${tag} [${f.code}] ${f.where}\n      ${f.message}`;
}
