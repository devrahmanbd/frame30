/**
 * Pixel metrics for search snippets (Phase 2).
 *
 * Google truncates a snippet by rendered pixel width, not by character count,
 * so `iiiiiiiiii` and `WWWWWWWWWW` are not the same title even though both are
 * ten characters. A canvas measurement is unavailable on the server and would
 * make the score non-deterministic across devices, so we use a measured
 * per-character-class approximation of Arial — accurate to a few percent, which
 * is all a truncation preview and a length check need.
 *
 * This module is deliberately dependency-free: the builder drawer, the admin
 * SEO desk, the Web Worker and the server scoring path all import it, and none
 * of them may drag an AST or a Supabase type along for the ride.
 */

/** Desktop SERP line widths, in CSS pixels, as Google renders them today. */
export const SERP_DESKTOP = { titlePx: 580, descriptionPx: 990 } as const;
/** Mobile SERP is narrower and wraps the description over three lines. */
export const SERP_MOBILE = { titlePx: 460, descriptionPx: 830 } as const;

/** Font sizes the SERP uses for each field, needed to turn units into pixels. */
export const SERP_FONT = { title: 16, description: 13 } as const;

const WIDE = new Set("mwMWQ@—".split(""));
const NARROW = new Set("iljtfIr.,:;'|!()[]".split(""));

/** Approximate rendered width of `text` at `fontSize`, in CSS pixels. */
export function pixelWidth(text: string, fontSize = 16): number {
  let units = 0;
  for (const char of text) {
    if (NARROW.has(char)) units += 0.34;
    else if (WIDE.has(char)) units += 0.92;
    else if (char === " ") units += 0.28;
    else if (/[A-Z0-9]/.test(char)) units += 0.68;
    else if (/[\u0980-\u09FF]/.test(char)) units += 0.62; // বাংলা conjuncts run wide
    else units += 0.52;
  }
  return Math.round(units * fontSize);
}

/**
 * Truncates on a word boundary at the pixel budget and appends an ellipsis,
 * exactly the way a SERP line is clipped. Returns the original string when it
 * already fits, so a preview never shows a phantom ellipsis.
 */
export function truncateToPixels(text: string, budgetPx: number, fontSize: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || pixelWidth(clean, fontSize) <= budgetPx) return clean;
  const ellipsisPx = pixelWidth("…", fontSize);
  const words = clean.split(" ");
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (pixelWidth(next, fontSize) + ellipsisPx > budgetPx) break;
    out = next;
  }
  if (!out) {
    // A single unbreakable token wider than the line: clip by character.
    for (const char of clean) {
      if (pixelWidth(out + char, fontSize) + ellipsisPx > budgetPx) break;
      out += char;
    }
  }
  return `${out}…`;
}

export type SnippetMetrics = {
  /** What the SERP line will actually show. */
  shown: string;
  px: number;
  budgetPx: number;
  truncated: boolean;
  /** 0–1 fill ratio, for the progress bar under the field. */
  fill: number;
};

export function snippetMetrics(
  text: string,
  budgetPx: number,
  fontSize: number,
): SnippetMetrics {
  const clean = text.replace(/\s+/g, " ").trim();
  const px = pixelWidth(clean, fontSize);
  return {
    shown: truncateToPixels(clean, budgetPx, fontSize),
    px,
    budgetPx,
    truncated: px > budgetPx,
    fill: budgetPx === 0 ? 0 : Math.min(1, px / budgetPx),
  };
}

export type SerpDevice = "desktop" | "mobile";

/** Both snippet lines measured for one device. */
export function serpMetrics(
  input: { title: string; description: string },
  device: SerpDevice = "desktop",
): { title: SnippetMetrics; description: SnippetMetrics; device: SerpDevice } {
  const budget = device === "mobile" ? SERP_MOBILE : SERP_DESKTOP;
  return {
    device,
    title: snippetMetrics(input.title, budget.titlePx, SERP_FONT.title),
    description: snippetMetrics(input.description, budget.descriptionPx, SERP_FONT.description),
  };
}
