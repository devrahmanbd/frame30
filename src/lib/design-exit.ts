/**
 * Phase 10.6 — the design exit gates for the `.fq-site` marketing surface.
 *
 * TODO §10.6 lists five conditions a marketing page must satisfy before it is
 * allowed to ship:
 *
 *   1. no hardcoded colour utility (`text-white`, `bg-[#…]`, `rgb(...)` inline)
 *      in any file that renders inside `.fq-site`;
 *   2. a contrast pass on the dark canvas for body text, muted text and every
 *      CTA state (rest / hover / focus / disabled);
 *   3. a responsive sweep from 320 to 1920 with no horizontal scroll and no
 *      clipped Bangla matra;
 *   4. LCP ≤ 2.0s on the home hero and CLS ≤ 0.05 while fonts swap;
 *   5. exactly one H1 per route, with heading levels never skipped.
 *
 * Like §10.3 and §10.4 before it, the prose is not the contract — this module
 * is. Everything that could drift reads from here:
 *
 *   - `scripts/design-gate.mjs` performs the static source scan and the browser
 *     measurement, then hands plain records to the auditors below;
 *   - `src/lib/design-exit.test.ts` exercises each auditor without a browser,
 *     so a threshold change is a visible, reviewable diff;
 *   - the shared finding shape (`code` / `severity` / `where`) matches the
 *     rhythm and motion gates, so CI reporting, `--allow` lists and JSON trend
 *     files are identical across all three phases.
 *
 * Design notes that are easy to get wrong later:
 *
 *   1. Auditors are pure. They never read the filesystem, never touch the DOM,
 *      never throw and never exit. Collection is the caller's problem.
 *   2. Contrast is computed over the *composited* colour. Half the text on this
 *      canvas is painted with an alpha (`text-fq-muted` is white at 62%), so
 *      comparing the declared colour against the token background overstates
 *      contrast by a wide margin and passes text nobody can read.
 *   3. Every numeric rule carries a tolerance, and every judgement call is a
 *      `warn`. A gate that fails on 4.49:1 against a 4.5:1 rule, or on a 1px
 *      rounding artefact, gets muted within a week and then protects nothing.
 *   4. Codes are the stable contract. Messages are for humans and may be
 *      reworded at any time.
 */

/* -------------------------------------------------------------------------- */
/* Shared finding shape                                                       */
/* -------------------------------------------------------------------------- */

export type DesignSeverity = "error" | "warn" | "info";

export type DesignFindingCode =
  // Rule 1 — colour discipline
  | "color.hardcoded_utility"
  | "color.arbitrary_value"
  | "color.inline_style"
  | "color.raw_hex"
  // Rule 2 — contrast
  | "contrast.body"
  | "contrast.muted"
  | "contrast.cta"
  | "contrast.focus_ring"
  | "contrast.unmeasurable"
  // Rule 3 — responsive
  | "responsive.horizontal_scroll"
  | "responsive.element_overflow"
  | "responsive.matra_clipped"
  | "responsive.tap_target"
  // Rule 4 — vitals
  | "vitals.lcp"
  | "vitals.cls"
  | "vitals.font_swap"
  | "vitals.missing"
  // Rule 5 — headings
  | "heading.h1_missing"
  | "heading.h1_duplicate"
  | "heading.level_skipped"
  | "heading.empty";

export type DesignFinding = {
  code: DesignFindingCode;
  severity: DesignSeverity;
  /** The human-readable rule this finding belongs to, for grouped reports. */
  rule: string;
  /** `route @width/locale · element` — dedupe strips the viewport segment. */
  where: string;
  message: string;
  /** Measured value, when the rule is numeric. */
  actual?: string | number;
  /** Spec value, when the rule is numeric. */
  expected?: string | number;
};

function finding(
  code: DesignFindingCode,
  severity: DesignSeverity,
  rule: string,
  where: string,
  message: string,
  actual?: string | number,
  expected?: string | number,
): DesignFinding {
  return { code, severity, rule, where, message, actual, expected };
}

/* -------------------------------------------------------------------------- */
/* Spec                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * WCAG 2.2 thresholds. `largeTextPx` is the 18.66px/24px boundary at which the
 * 3:1 ratio applies; we use the bold-agnostic 24px value for safety, because a
 * clamp can land a "large" heading at 19px on a 320px phone.
 */
export const CONTRAST = {
  /** Body and any text a visitor is expected to read end to end. */
  bodyMin: 4.5,
  /** Text at 24px or larger. */
  largeMin: 3,
  largeTextPx: 24,
  /** Non-text UI: borders that carry meaning, focus rings, icon-only marks. */
  nonTextMin: 3,
  /**
   * Muted copy is deliberately quieter than body. It is still content, so it
   * stays on the 4.5:1 rule — but a miss between 4.0 and 4.5 is a `warn`, not
   * a hard block, because the alternative is bleaching the whole page.
   */
  mutedWarnFloor: 4,
  /** Disabled controls are exempt from WCAG, but must remain perceivable. */
  disabledMin: 2.2,
  /** Rounding slack: browsers report colours as integers. */
  tolerance: 0.05,
} as const;

/** Core Web Vitals budgets from TODO §10.6, tightened past Google's "good". */
export const VITALS = {
  /** TODO §10.6: "LCP ≤ 2.0s on the home hero". Google's good bar is 2.5s. */
  lcpMs: 2000,
  /** A lab run on a warm dev server should be far under; this is the ceiling. */
  lcpWarnMs: 1600,
  /** TODO §10.6: "CLS ≤ 0.05 with fonts swapping". Google's good bar is 0.1. */
  cls: 0.05,
  clsWarnLevel: 0.02,
  /** Time to first byte, as context when LCP fails for server reasons. */
  ttfbWarnMs: 800,
  /**
   * A font swap that lands after this point shifts text the visitor has already
   * started reading. `font-display: swap` with a preloaded subset should land
   * well inside it.
   */
  fontSwapMs: 1200,
} as const;

/** Responsive sweep bounds. Kept in step with `scripts/responsive-sweep.mjs`. */
export const RESPONSIVE = {
  minWidthPx: 320,
  maxWidthPx: 1920,
  /** Scrollbar and sub-pixel rounding slack on document scroll width. */
  scrollSlackPx: 1,
  /** An element may exceed the viewport by this much before it is a finding. */
  elementSlackPx: 2,
  /**
   * Bangla matras (ি ী ু ূ ৃ ে ৈ ো ৌ ঁ) hang above and below the base line box.
   * A line box tighter than this ratio clips them even when nothing overflows
   * horizontally, and the clipping is invisible in an English-only review.
   */
  bnMinLineHeightRatio: 1.35,
  /**
   * A Bangla text node whose rendered height is under this fraction of its
   * line-height * line-count is being cut by an ancestor's fixed height or
   * `overflow: hidden`.
   */
  bnClipRatio: 0.94,
  /** WCAG 2.5.8 minimum target size, and the pointer-coarse bump we ship. */
  tapTargetPx: 24,
  tapTargetComfortablePx: 44,
} as const;

/* -------------------------------------------------------------------------- */
/* Rule 1 — colour discipline in source                                       */
/* -------------------------------------------------------------------------- */

/**
 * Tailwind utilities that paint a literal colour. These bypass the token layer
 * entirely: they do not respond to `.fq-site`, they do not theme, and they are
 * the single most common way a dark canvas grows a white rectangle.
 *
 * The list is the palette families Tailwind ships plus the two absolutes. It is
 * matched with a word boundary and an optional variant prefix, so `hover:` and
 * `md:` forms are caught, and `text-foreground` / `bg-fq-glass` are not.
 */
export const LITERAL_COLOR_FAMILIES = [
  "white",
  "black",
  "slate",
  "gray",
  "grey",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

/** Utility prefixes that take a colour. `ring-offset` and `from`/`via`/`to`. */
export const COLOR_UTILITY_PREFIXES = [
  "text",
  "bg",
  "border",
  "ring",
  "ring-offset",
  "outline",
  "divide",
  "decoration",
  "shadow",
  "accent",
  "caret",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "placeholder",
] as const;

/**
 * Escapes that are legitimate and must never be reported:
 *
 *  - `*-current` / `*-transparent` / `*-inherit` are keyword utilities and
 *    carry no palette value;
 *  - `bg-white/…` inside the *token definitions* themselves (`styles.css`) is
 *    how the tokens are built — the scanner never reads that file;
 *  - a component may opt out explicitly with a trailing comment, which forces
 *    the exception to be written down next to the code rather than argued in
 *    a pull request thread.
 */
export const COLOR_ESCAPE_COMMENT = "design-exit-allow: color";

const VARIANT = String.raw`(?:[a-z0-9@[\]:_.-]+:)*`;
const PREFIX_ALT = COLOR_UTILITY_PREFIXES.map((p) => p.replace(/-/g, "\\-")).join("|");
const FAMILY_ALT = LITERAL_COLOR_FAMILIES.join("|");

/** `text-white`, `hover:bg-slate-800/60`, `md:border-red-500`. */
const LITERAL_UTILITY_RE = new RegExp(
  String.raw`(?<![\w-])(${VARIANT})(${PREFIX_ALT})-(${FAMILY_ALT})(?:-(\d{2,3}))?(?:\/\d{1,3})?(?![\w-])`,
  "g",
);

/** `bg-[#0b0f14]`, `text-[rgb(255,255,255)]`, `border-[hsl(203_89%_53%)]`. */
const ARBITRARY_COLOR_RE = new RegExp(
  String.raw`(?<![\w-])(${VARIANT})(${PREFIX_ALT})-\[\s*(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^\]]*\))\s*\]`,
  "g",
);

/** `style={{ color: "#fff" }}` and friends. */
const INLINE_STYLE_COLOR_RE =
  /(?:color|background|backgroundColor|borderColor|fill|stroke|outlineColor|boxShadow)\s*:\s*["'`][^"'`]*(#[0-9a-fA-F]{3,8}|\b(?:rgba?|hsla?)\()/g;

/** A raw hex literal anywhere in a `.fq-site` component file. */
const RAW_HEX_RE = /(?<![\w&#])#[0-9a-fA-F]{6}\b/g;

export type SourceFile = {
  /** Repo-relative path, used verbatim in `where`. */
  path: string;
  contents: string;
};

/** Line number (1-based) of a character offset, for actionable findings. */
export function lineOf(contents: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < contents.length; i += 1) {
    if (contents.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function lineText(contents: string, index: number): string {
  const start = contents.lastIndexOf("\n", index) + 1;
  const end = contents.indexOf("\n", index);
  return contents.slice(start, end === -1 ? contents.length : end);
}

/**
 * Scans one file for literal colour. Returns findings, never throws.
 *
 * The scan is deliberately textual rather than AST-based: Tailwind classes are
 * frequently assembled inside `cn()`, template literals and `cva` variant maps,
 * where an AST buys nothing but costs a parser dependency and a class of
 * silent misses whenever syntax evolves.
 */
export function auditSourceColors(file: SourceFile): DesignFinding[] {
  const out: DesignFinding[] = [];
  const seen = new Set<string>();

  const push = (
    code: DesignFindingCode,
    severity: DesignSeverity,
    index: number,
    token: string,
    message: string,
  ) => {
    const line = lineOf(file.contents, index);
    const raw = lineText(file.contents, index);
    // An explicit, written-down exception on the same line.
    if (raw.includes(COLOR_ESCAPE_COMMENT)) return;
    const key = `${code}|${line}|${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(
      finding(code, severity, "No hardcoded colour", `${file.path}:${line}`, message, token, "semantic token"),
    );
  };

  for (const m of file.contents.matchAll(LITERAL_UTILITY_RE)) {
    const token = m[0];
    if (/-(current|transparent|inherit)\b/.test(token)) continue;
    push(
      "color.hardcoded_utility",
      "error",
      m.index ?? 0,
      token,
      `\`${token}\` paints a literal palette colour. Use a semantic token (\`text-fq-ink\`, \`bg-fq-surface-2\`, \`border-fq-edge\`) so the dark canvas and every future theme stay in one place.`,
    );
  }

  for (const m of file.contents.matchAll(ARBITRARY_COLOR_RE)) {
    push(
      "color.arbitrary_value",
      "error",
      m.index ?? 0,
      m[0],
      `\`${m[0]}\` inlines a colour value into a utility. Promote it to a token in \`src/styles.css\` and reference the token.`,
    );
  }

  for (const m of file.contents.matchAll(INLINE_STYLE_COLOR_RE)) {
    push(
      "color.inline_style",
      "error",
      m.index ?? 0,
      m[0].slice(0, 48),
      "Inline style paints a literal colour. Inline styles are exempt from the cascade, so this survives every theme change and every contrast fix.",
    );
  }

  for (const m of file.contents.matchAll(RAW_HEX_RE)) {
    const raw = lineText(file.contents, m.index ?? 0);
    // A hex inside an SVG `d`/`viewBox`, a URL, or an obvious id is noise.
    if (/https?:|url\(|viewBox|\bd=|#[0-9a-fA-F]{6}[0-9a-fA-F]{2,}/.test(raw)) continue;
    push(
      "color.raw_hex",
      "warn",
      m.index ?? 0,
      m[0],
      `Raw hex \`${m[0]}\` in a marketing surface file. Even in a comment or a data literal it tends to become a class within two edits.`,
    );
  }

  return out;
}

/** Scans a set of files. Sorted by path then line, so reports are stable. */
export function auditSourceTree(files: readonly SourceFile[]): DesignFinding[] {
  return files
    .flatMap((f) => auditSourceColors(f))
    .sort((a, b) => (a.where < b.where ? -1 : a.where > b.where ? 1 : 0));
}

/* -------------------------------------------------------------------------- */
/* Rule 2 — contrast on the dark canvas                                       */
/* -------------------------------------------------------------------------- */

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses `rgb()`, `rgba()`, `#rgb`, `#rrggbb`, `#rrggbbaa`. Null when opaque-unknown. */
export function parseColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    const expand = (s: string) => Number.parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
      return {
        r: expand(h[0]),
        g: expand(h[1]),
        b: expand(h[2]),
        a: h.length === 4 ? expand(h[3]) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const fn = value.match(/^rgba?\(([^)]+)\)$/);
  if (!fn) return null;
  const parts = fn[1]
    .split(/[,/\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (raw: string) =>
    raw.endsWith("%") ? (Number.parseFloat(raw) / 100) * 255 : Number.parseFloat(raw);
  const [r, g, b] = parts.slice(0, 3).map(channel);
  if (![r, g, b].every(Number.isFinite)) return null;
  const alphaRaw = parts[3];
  const a =
    alphaRaw === undefined
      ? 1
      : alphaRaw.endsWith("%")
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);
  return { r, g, b, a: Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1 };
}

/** Source-over composite of `fg` onto an opaque `bg`. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/**
 * Flattens a stack of possibly-translucent backdrop layers, outermost first,
 * onto an opaque base. This is what makes the numbers honest: a glass card at
 * 6% white over an aurora tile over the canvas is a genuinely different
 * background from `--fq-canvas`, and text that passes against one can fail
 * against the other.
 */
export function flattenBackdrop(layers: readonly Rgba[], base: Rgba): Rgba {
  return layers.reduce<Rgba>((acc, layer) => composite(layer, acc), { ...base, a: 1 });
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1–21, rounded to two decimals. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/** The role a measured sample plays, which decides its threshold. */
export type ContrastRole = "body" | "muted" | "cta" | "cta-disabled" | "focus-ring" | "non-text";

export type ContrastSample = {
  label: string;
  role: ContrastRole;
  /** CTA state, for the four-state pass. */
  state?: "rest" | "hover" | "focus" | "active" | "disabled";
  /** Declared foreground, exactly as `getComputedStyle` reported it. */
  color: string;
  /** Backdrop layers, outermost first, each as reported. */
  backdrop: readonly string[];
  /** Opaque page base, so a fully translucent stack still resolves. */
  base: string;
  fontSizePx: number;
  fontWeight: number;
  /** Sample text, truncated by the collector, for actionable messages. */
  text?: string;
};

function thresholdFor(sample: ContrastSample): { min: number; label: string } {
  if (sample.role === "cta-disabled" || sample.state === "disabled") {
    return { min: CONTRAST.disabledMin, label: "disabled" };
  }
  if (sample.role === "focus-ring" || sample.role === "non-text") {
    return { min: CONTRAST.nonTextMin, label: "non-text" };
  }
  const isLarge =
    sample.fontSizePx >= CONTRAST.largeTextPx ||
    (sample.fontSizePx >= 18.66 && sample.fontWeight >= 700);
  return isLarge
    ? { min: CONTRAST.largeMin, label: "large text" }
    : { min: CONTRAST.bodyMin, label: "text" };
}

function codeFor(role: ContrastRole): DesignFindingCode {
  switch (role) {
    case "muted":
      return "contrast.muted";
    case "cta":
    case "cta-disabled":
      return "contrast.cta";
    case "focus-ring":
      return "contrast.focus_ring";
    default:
      return "contrast.body";
  }
}

/**
 * Audits contrast for a page's samples.
 *
 * Severity policy, stated once so it is not re-litigated per finding:
 *  - body and CTA text below their threshold is an `error`: it is unreadable
 *    content on the primary conversion path;
 *  - muted text between `mutedWarnFloor` and the threshold is a `warn`: it is
 *    quiet by design and the fix is a token change with page-wide blast radius;
 *  - anything the collector could not resolve is `contrast.unmeasurable` at
 *    `warn` — silence there would let a whole component disappear from the
 *    gate by rendering its colour in a way we cannot parse.
 */
export function auditContrast(
  samples: readonly ContrastSample[],
  where = "page",
): DesignFinding[] {
  const out: DesignFinding[] = [];

  for (const sample of samples) {
    const at = `${where} · ${sample.label}`;
    const fg = parseColor(sample.color);
    const base = parseColor(sample.base) ?? { r: 0, g: 0, b: 0, a: 1 };
    if (!fg) {
      out.push(
        finding(
          "contrast.unmeasurable",
          "warn",
          "Contrast on dark",
          at,
          `Could not parse the foreground colour "${sample.color}"; this element is not under contract until it can be measured.`,
          sample.color,
        ),
      );
      continue;
    }
    if (fg.a === 0) continue; // Invisible by intent (screen-reader-only text).

    const layers = sample.backdrop
      .map(parseColor)
      .filter((c): c is Rgba => c !== null && c.a > 0);
    const backdrop = flattenBackdrop(layers, base);
    const painted = composite(fg, backdrop);
    const ratio = contrastRatio(painted, backdrop);
    const { min, label } = thresholdFor(sample);

    if (ratio + CONTRAST.tolerance >= min) continue;

    const soft = sample.role === "muted" && ratio >= CONTRAST.mutedWarnFloor;
    const stateSuffix = sample.state ? ` in its ${sample.state} state` : "";
    out.push(
      finding(
        codeFor(sample.role),
        soft ? "warn" : "error",
        "Contrast on dark",
        at,
        `${ratio.toFixed(2)}:1 against the composited backdrop${stateSuffix}, below the ${min}:1 ${label} threshold` +
          (fg.a < 1 ? ` (foreground alpha ${fg.a.toFixed(2)} was composited, not assumed opaque)` : "") +
          (sample.text ? ` — "${sample.text}"` : "") +
          ".",
        ratio,
        min,
      ),
    );
  }

  return out;
}

/**
 * A CTA must be legible in every state it can reach. Missing states are a
 * finding in their own right: an unmeasured `:focus-visible` is the state that
 * keyboard users live in, and it is the one nobody screenshots.
 */
export const REQUIRED_CTA_STATES = ["rest", "hover", "focus"] as const;

export function auditCtaStates(
  samples: readonly ContrastSample[],
  where = "page",
): DesignFinding[] {
  const ctas = samples.filter((s) => s.role === "cta" || s.role === "cta-disabled");
  if (ctas.length === 0) return [];
  const byLabel = new Map<string, Set<string>>();
  for (const s of ctas) {
    const key = s.label.replace(/\s*\[(rest|hover|focus|active|disabled)\]\s*$/i, "");
    byLabel.set(key, (byLabel.get(key) ?? new Set()).add(s.state ?? "rest"));
  }
  const out: DesignFinding[] = [];
  for (const [label, states] of byLabel) {
    const missing = REQUIRED_CTA_STATES.filter((s) => !states.has(s));
    if (missing.length === 0) continue;
    out.push(
      finding(
        "contrast.cta",
        "warn",
        "Contrast on dark",
        `${where} · ${label}`,
        `CTA was only measured in [${[...states].join(", ")}]; ${missing.join(", ")} never resolved. An unmeasured state is an unproven state.`,
        [...states].join(","),
        REQUIRED_CTA_STATES.join(","),
      ),
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Rule 3 — responsive sweep, 320 → 1920                                      */
/* -------------------------------------------------------------------------- */

export type OverflowSample = {
  label: string;
  /** Right edge of the element's border box, relative to the document. */
  rightPx: number;
  widthPx: number;
  /** Set when the element or an ancestor legitimately clips (carousels). */
  clipped: boolean;
};

export type BanglaSample = {
  label: string;
  /** Rendered height of the text box. */
  heightPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  lineCount: number;
  /** True when an ancestor sets `overflow: hidden`/`clip` on the block axis. */
  ancestorClipsY: boolean;
  text: string;
};

export type TapTargetSample = {
  label: string;
  widthPx: number;
  heightPx: number;
  /** Whether the target sits in a dense inline run (WCAG 2.5.8 exception). */
  inline: boolean;
};

export type ViewportMeasurement = {
  route: string;
  viewportPx: number;
  locale: string;
  documentScrollWidthPx: number;
  overflow: readonly OverflowSample[];
  bangla: readonly BanglaSample[];
  tapTargets: readonly TapTargetSample[];
};

export function auditResponsive(m: ViewportMeasurement): DesignFinding[] {
  const where = `${m.route} @${m.viewportPx}/${m.locale}`;
  const out: DesignFinding[] = [];

  const overshoot = m.documentScrollWidthPx - m.viewportPx;
  if (overshoot > RESPONSIVE.scrollSlackPx) {
    out.push(
      finding(
        "responsive.horizontal_scroll",
        "error",
        "No horizontal scroll 320→1920",
        where,
        `The document scrolls ${Math.round(overshoot)}px sideways at ${m.viewportPx}px. On a phone this reads as a broken page long before anyone reads the copy.`,
        Math.round(m.documentScrollWidthPx),
        m.viewportPx,
      ),
    );

    // Name the culprits, not just the symptom. Without this the finding is a
    // scavenger hunt across nine routes.
    const culprits = m.overflow
      .filter((o) => !o.clipped && o.rightPx - m.viewportPx > RESPONSIVE.elementSlackPx)
      .sort((a, b) => b.rightPx - a.rightPx)
      .slice(0, 5);
    for (const c of culprits) {
      out.push(
        finding(
          "responsive.element_overflow",
          "error",
          "No horizontal scroll 320→1920",
          `${where} · ${c.label}`,
          `Extends ${Math.round(c.rightPx - m.viewportPx)}px past the viewport (width ${Math.round(c.widthPx)}px) and nothing clips it.`,
          Math.round(c.rightPx),
          m.viewportPx,
        ),
      );
    }
  }

  for (const b of m.bangla) {
    const ratio = b.lineHeightPx / (b.fontSizePx || 1);
    if (ratio + 0.02 < RESPONSIVE.bnMinLineHeightRatio) {
      out.push(
        finding(
          "responsive.matra_clipped",
          "error",
          "No clipped matra",
          `${where} · ${b.label}`,
          `Bangla line box is ${ratio.toFixed(2)}× the font size (${b.lineHeightPx.toFixed(1)}px / ${b.fontSizePx.toFixed(1)}px); matras above and below the base clip below ${RESPONSIVE.bnMinLineHeightRatio}×. Text: "${b.text}"`,
          Number(ratio.toFixed(2)),
          RESPONSIVE.bnMinLineHeightRatio,
        ),
      );
      continue;
    }
    const expected = b.lineHeightPx * Math.max(1, b.lineCount);
    if (b.ancestorClipsY && b.heightPx < expected * RESPONSIVE.bnClipRatio) {
      out.push(
        finding(
          "responsive.matra_clipped",
          "error",
          "No clipped matra",
          `${where} · ${b.label}`,
          `Rendered height ${b.heightPx.toFixed(1)}px is short of the ${expected.toFixed(1)}px the ${b.lineCount} line(s) need, and an ancestor clips the block axis. Text: "${b.text}"`,
          Number(b.heightPx.toFixed(1)),
          Number(expected.toFixed(1)),
        ),
      );
    }
  }

  for (const t of m.tapTargets) {
    const min = Math.min(t.widthPx, t.heightPx);
    if (t.inline) continue; // WCAG 2.5.8 exempts targets inside a sentence.
    if (min + 0.5 < RESPONSIVE.tapTargetPx) {
      out.push(
        finding(
          "responsive.tap_target",
          "error",
          "Reachable targets",
          `${where} · ${t.label}`,
          `Target is ${Math.round(t.widthPx)}×${Math.round(t.heightPx)}px, under the WCAG 2.5.8 ${RESPONSIVE.tapTargetPx}px minimum.`,
          Math.round(min),
          RESPONSIVE.tapTargetPx,
        ),
      );
    } else if (min + 0.5 < RESPONSIVE.tapTargetComfortablePx && m.viewportPx < 768) {
      out.push(
        finding(
          "responsive.tap_target",
          "warn",
          "Reachable targets",
          `${where} · ${t.label}`,
          `Target is ${Math.round(t.widthPx)}×${Math.round(t.heightPx)}px on a touch-width viewport; the house rule is ${RESPONSIVE.tapTargetComfortablePx}px.`,
          Math.round(min),
          RESPONSIVE.tapTargetComfortablePx,
        ),
      );
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Rule 4 — LCP and CLS                                                       */
/* -------------------------------------------------------------------------- */

export type VitalsMeasurement = {
  route: string;
  viewportPx: number;
  locale: string;
  lcpMs: number | null;
  clsScore: number | null;
  ttfbMs: number | null;
  /** Element the browser picked as LCP, for actionable findings. */
  lcpElement?: string;
  /** When the last web font finished loading, relative to navigation start. */
  fontsReadyMs?: number | null;
  /** Largest single layout shift, and what moved. */
  worstShift?: { value: number; sources: string[] } | null;
};

/**
 * The vitals rule is stated for the home hero. Applying the same numbers to
 * every route would be dishonest — `/docs` legitimately paints a search box and
 * a table — so the LCP budget is scoped, and other routes get the same budget
 * as an advisory. CLS is universal: nothing on a marketing page has an excuse
 * to move.
 */
export function auditVitals(
  m: VitalsMeasurement,
  { lcpBudgetRoutes = ["home", "/"] }: { lcpBudgetRoutes?: readonly string[] } = {},
): DesignFinding[] {
  const where = `${m.route} @${m.viewportPx}/${m.locale}`;
  const out: DesignFinding[] = [];
  const budgeted = lcpBudgetRoutes.includes(m.route);

  if (m.lcpMs === null) {
    out.push(
      finding(
        "vitals.missing",
        "warn",
        "LCP ≤ 2.0s · CLS ≤ 0.05",
        where,
        "No LCP entry was reported. Either the page painted nothing large enough to qualify, or the observer was attached after paint — both mean this route is unmeasured, not fast.",
      ),
    );
  } else if (m.lcpMs > VITALS.lcpMs) {
    out.push(
      finding(
        "vitals.lcp",
        budgeted ? "error" : "warn",
        "LCP ≤ 2.0s · CLS ≤ 0.05",
        where,
        `LCP is ${Math.round(m.lcpMs)}ms (element: ${m.lcpElement ?? "unknown"})` +
          (m.ttfbMs !== null && m.ttfbMs !== undefined && m.ttfbMs > VITALS.ttfbWarnMs
            ? `, of which ${Math.round(m.ttfbMs)}ms was TTFB — the server, not the paint, is the cost here`
            : "") +
          ".",
        Math.round(m.lcpMs),
        VITALS.lcpMs,
      ),
    );
  } else if (m.lcpMs > VITALS.lcpWarnMs && budgeted) {
    out.push(
      finding(
        "vitals.lcp",
        "warn",
        "LCP ≤ 2.0s · CLS ≤ 0.05",
        where,
        `LCP is ${Math.round(m.lcpMs)}ms — inside budget, but with no headroom for a cold cache or a slow network.`,
        Math.round(m.lcpMs),
        VITALS.lcpWarnMs,
      ),
    );
  }

  if (m.clsScore === null) {
    out.push(
      finding(
        "vitals.missing",
        "warn",
        "LCP ≤ 2.0s · CLS ≤ 0.05",
        where,
        "No layout-shift score was reported; treat this route as unmeasured for CLS.",
      ),
    );
  } else if (m.clsScore > VITALS.cls) {
    const sources = m.worstShift?.sources?.slice(0, 3).join(", ");
    out.push(
      finding(
        "vitals.cls",
        "error",
        "LCP ≤ 2.0s · CLS ≤ 0.05",
        where,
        `CLS is ${m.clsScore.toFixed(3)}` +
          (sources ? `; the largest shift moved ${sources}` : "") +
          ". Reserve space with explicit dimensions or an aspect ratio; do not fix this by delaying the shift past the measurement window.",
        Number(m.clsScore.toFixed(3)),
        VITALS.cls,
      ),
    );
  } else if (m.clsScore > VITALS.clsWarnLevel) {
    out.push(
      finding(
        "vitals.cls",
        "warn",
        "LCP ≤ 2.0s · CLS ≤ 0.05",
        where,
        `CLS is ${m.clsScore.toFixed(3)}: inside budget but visibly moving.`,
        Number(m.clsScore.toFixed(3)),
        VITALS.clsWarnLevel,
      ),
    );
  }

  if (
    m.fontsReadyMs !== null &&
    m.fontsReadyMs !== undefined &&
    m.fontsReadyMs > VITALS.fontSwapMs
  ) {
    out.push(
      finding(
        "vitals.font_swap",
        "warn",
        "LCP ≤ 2.0s · CLS ≤ 0.05",
        where,
        `Web fonts settled at ${Math.round(m.fontsReadyMs)}ms. A swap after ${VITALS.fontSwapMs}ms reflows text the visitor is already reading; preload the subset used above the fold and keep the fallback metrics matched.`,
        Math.round(m.fontsReadyMs),
        VITALS.fontSwapMs,
      ),
    );
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Rule 5 — heading structure                                                 */
/* -------------------------------------------------------------------------- */

export type HeadingSample = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  /** True when the heading is visually hidden but still in the a11y tree. */
  visuallyHidden?: boolean;
};

export function auditHeadings(
  headings: readonly HeadingSample[],
  where = "page",
): DesignFinding[] {
  const out: DesignFinding[] = [];
  const h1s = headings.filter((h) => h.level === 1);

  if (h1s.length === 0) {
    out.push(
      finding(
        "heading.h1_missing",
        "error",
        "One H1 per route",
        where,
        "No H1. The page has no programmatic title for assistive tech or for search.",
        0,
        1,
      ),
    );
  } else if (h1s.length > 1) {
    out.push(
      finding(
        "heading.h1_duplicate",
        "error",
        "One H1 per route",
        where,
        `${h1s.length} H1 elements: ${h1s.map((h) => `"${h.text.slice(0, 32)}"`).join(", ")}. Demote all but the page title to H2.`,
        h1s.length,
        1,
      ),
    );
  }

  let previous = 0;
  for (const h of headings) {
    if (!h.text.trim()) {
      out.push(
        finding(
          "heading.empty",
          "warn",
          "Heading order",
          `${where} · h${h.level}`,
          "Heading has no accessible text; it becomes an empty entry in the document outline.",
        ),
      );
      // The heading still occupies its level in the outline: an empty h2
      // between an h1 and an h3 is one problem (no text), not two (no text
      // plus a skipped level). Advance the cursor before bailing out.
      previous = h.level;
      continue;
    }
    if (previous !== 0 && h.level > previous + 1) {
      out.push(
        finding(
          "heading.level_skipped",
          "error",
          "Heading order",
          `${where} · "${h.text.slice(0, 40)}"`,
          `Jumps from h${previous} to h${h.level}. Levels describe nesting, not size — restyle the heading instead of skipping a level.`,
          `h${h.level}`,
          `h${previous + 1}`,
        ),
      );
    }
    previous = h.level;
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                  */
/* -------------------------------------------------------------------------- */

export type ExitMeasurement = ViewportMeasurement & {
  contrast: readonly ContrastSample[];
  headings: readonly HeadingSample[];
  vitals: VitalsMeasurement;
};

export type ExitReport = {
  route: string;
  viewportPx: number;
  locale: string;
  findings: DesignFinding[];
  counts: Record<DesignSeverity, number>;
  ok: boolean;
};

/** Runs every browser-side rule for one page at one viewport. Never throws. */
export function auditExitPage(m: ExitMeasurement): ExitReport {
  const where = `${m.route} @${m.viewportPx}/${m.locale}`;
  const findings = [
    ...auditResponsive(m),
    ...auditContrast(m.contrast, where),
    ...auditCtaStates(m.contrast, where),
    ...auditHeadings(m.headings, where),
    ...auditVitals(m.vitals),
  ];
  return {
    route: m.route,
    viewportPx: m.viewportPx,
    locale: m.locale,
    findings,
    counts: countBySeverity(findings),
    ok: findings.every((f) => f.severity !== "error"),
  };
}

export function countBySeverity(
  findings: readonly DesignFinding[],
): Record<DesignSeverity, number> {
  return findings.reduce(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { error: 0, warn: 0, info: 0 } as Record<DesignSeverity, number>,
  );
}

/**
 * Collapses the same finding reported at several viewports or locales into one
 * line. A report with the same 12 findings repeated 40 times gets skimmed and
 * then ignored, which is the same as not running the gate.
 */
export function dedupeFindings(findings: readonly DesignFinding[]): DesignFinding[] {
  const seen = new Map<string, DesignFinding>();
  for (const f of findings) {
    const key = `${f.code}|${f.where.replace(/@\d+\/[a-z-]+/i, "@*")}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}

export function formatFinding(f: DesignFinding): string {
  const tag = f.severity === "error" ? "FAIL" : f.severity === "warn" ? "WARN" : "INFO";
  return `${tag} [${f.code}] ${f.where}\n      ${f.message}`;
}

export function errorsOnly(findings: readonly DesignFinding[]): DesignFinding[] {
  return findings.filter((f) => f.severity === "error");
}
