/**
 * Phase 10 — console polish, accessibility and verification.
 *
 * The console's a11y contract is expressed here as data so three consumers can
 * never drift apart: this module (unit-tested), `scripts/console-gate.mjs`
 * (browser sweep) and `docs/02-merchant/console-ux-checklist.md` (the written
 * checklist future pages are reviewed against).
 *
 * Everything is derived from `src/styles.css` at test time — no colour value is
 * duplicated here — so changing a token immediately re-runs the contrast maths.
 */
import { readFileSync } from "node:fs";

/**
 * WCAG floors the console holds itself to — plus a comfort ceiling.
 *
 * Contrast has two failure modes, not one: below `text` copy stops being
 * readable, above `comfortMax` a near-white ink on a near-black canvas halates
 * and becomes an eye sore in a long console session. Body ink therefore lives
 * in a band, not above a floor.
 */
export const CONSOLE_CONTRAST = { text: 4.5, largeText: 3, ui: 3, comfortMax: 13.5 } as const;

/** The responsive sweep widths every console surface must survive. */
export const CONSOLE_BREAKPOINTS = [390, 768, 1280, 1920] as const;

/** Console motion budget (mirrors the `--fq-dur*` tokens). */
export const CONSOLE_MOTION_MS = { fast: 120, base: 160, slow: 240 } as const;

/** Minimum tap target for a primary control on touch widths. */
export const MIN_TAP_TARGET_PX = 44;

export type Scheme = "light" | "dark";

/* --------------------------------------------------------------------- *
 * Colour maths — oklch() -> sRGB -> relative luminance -> contrast ratio.
 * --------------------------------------------------------------------- */

export function parseOklch(value: string): [number, number, number] | null {
  const m = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (!m) return null;
  const l = m[1].endsWith("%") ? Number.parseFloat(m[1]) / 100 : Number.parseFloat(m[1]);
  return [l, Number.parseFloat(m[2]), Number.parseFloat(m[3])];
}

function oklchToSrgb([L, C, hDeg]: [number, number, number]): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

function luminance(linear: [number, number, number]): number {
  const [r, g, b] = linear;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseOklch(a);
  const cb = parseOklch(b);
  if (!ca || !cb) return 0;
  const la = luminance(oklchToSrgb(ca));
  const lb = luminance(oklchToSrgb(cb));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return Number((((hi + 0.05) / (lo + 0.05)) as number).toFixed(2));
}

/* --------------------------------------------------------------------- *
 * Token extraction from src/styles.css
 * --------------------------------------------------------------------- */

function block(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}

export function consoleTokens(scheme: Scheme, css = readFileSync("src/styles.css", "utf8")) {
  const light = block(css, "\n.fq-admin {");
  const dark = block(css, "\n.fq-admin.dark,");
  const source = scheme === "light" ? light : light + dark; // dark overrides light
  const tokens: Record<string, string> = {};
  for (const m of source.matchAll(/(--[\w-]+):\s*(oklch\([^)]*\))/g)) tokens[m[1]] = m[2];
  return tokens;
}

/** Every ink/surface pair the console actually renders, with its floor. */
const PAIRS: Array<{ name: string; fg: string; bg: string; floor: number }> = [
  { name: "body on canvas", fg: "--color-foreground", bg: "--color-background", floor: CONSOLE_CONTRAST.text },
  { name: "body on card", fg: "--color-foreground", bg: "--color-card", floor: CONSOLE_CONTRAST.text },
  { name: "muted on canvas", fg: "--color-muted-foreground", bg: "--color-background", floor: CONSOLE_CONTRAST.text },
  { name: "muted on card", fg: "--color-muted-foreground", bg: "--color-card", floor: CONSOLE_CONTRAST.text },
  { name: "primary label", fg: "--color-primary-foreground", bg: "--color-primary", floor: CONSOLE_CONTRAST.text },
  { name: "accent label", fg: "--color-accent-foreground", bg: "--color-accent", floor: CONSOLE_CONTRAST.text },
  { name: "signal on canvas", fg: "--fq-signal", bg: "--color-background", floor: CONSOLE_CONTRAST.ui },
  { name: "focus ring on card", fg: "--color-ring", bg: "--color-card", floor: CONSOLE_CONTRAST.ui },
  { name: "brand ink on card", fg: "--fq-brand-ink", bg: "--color-card", floor: CONSOLE_CONTRAST.text },
  { name: "danger on card", fg: "--fq-danger", bg: "--color-card", floor: CONSOLE_CONTRAST.ui },
  { name: "success on card", fg: "--fq-success", bg: "--color-card", floor: CONSOLE_CONTRAST.ui },
];

export interface ContrastRow {
  scheme: Scheme;
  name: string;
  ratio: number;
  floor: number;
  /** Comfort ceiling for text pairs; Infinity for UI pairs. */
  ceiling: number;
  ok: boolean;
}

export function consoleContrastReport(css?: string): ContrastRow[] {
  const rows: ContrastRow[] = [];
  for (const scheme of ["light", "dark"] as const) {
    const tokens = consoleTokens(scheme, css);
    for (const pair of PAIRS) {
      const fg = tokens[pair.fg];
      const bg = tokens[pair.bg];
      const ratio = fg && bg ? contrastRatio(fg, bg) : 0;
      const ceiling = pair.floor === CONSOLE_CONTRAST.text ? CONSOLE_CONTRAST.comfortMax : Infinity;
      rows.push({
        scheme,
        name: pair.name,
        ratio,
        floor: pair.floor,
        ceiling,
        ok: ratio >= pair.floor && ratio <= ceiling,
      });
    }
  }
  return rows;
}

export function consoleContrastFailures(css?: string): string[] {
  return consoleContrastReport(css)
    .filter((r) => !r.ok)
    .map((r) =>
      r.ratio < r.floor
        ? `${r.scheme}: ${r.name} is ${r.ratio}:1 (needs ${r.floor}:1)`
        : `${r.scheme}: ${r.name} is ${r.ratio}:1 (above the ${r.ceiling}:1 comfort ceiling — glare)`,
    );
}

/* --------------------------------------------------------------------- *
 * Source invariants — cheap rules that keep new pages on the token layer.
 * --------------------------------------------------------------------- */

/** Colour utilities that bypass the token layer and break dark mode. */
export const FORBIDDEN_COLOR_UTILITIES =
  /\b(?:text|bg|border)-(?:white|black|gray-\d{2,3}|slate-\d{2,3}|zinc-\d{2,3}|neutral-\d{2,3})\b/;

export function hardcodedColorHits(files: Array<{ path: string; source: string }>): string[] {
  const hits: string[] = [];
  for (const file of files) {
    file.source.split("\n").forEach((line, i) => {
      if (FORBIDDEN_COLOR_UTILITIES.test(line)) hits.push(`${file.path}:${i + 1} ${line.trim()}`);
    });
  }
  return hits;
}
