/**
 * Local SVG product placeholder (neutral tokens).
 *
 * Demo catalogue products ship with `image_url NULL` and hotlinking stock
 * photography is banned, so imageless products render a deterministic
 * brand-toned monogram SVG served from `/api/public/ph/<seed>` — a real
 * image (works in `<img>`, og:image, no-JS, crawlers), not an empty box.
 *
 * Palette: heritage surface `#FAF8F5`, ink `#2D2A26`, terracotta `#C45D3E`.
 * Determinism: FNV-1a hash of the seed picks one of 4 weave motifs, so the
 * same product always renders the same tile. Output is static SVG — no
 * scripts, no event handlers, seeds are slug-sanitized.
 */

const BASE = "#FAF8F5";
const INK = "#2D2A26";
const ACCENT = "#C45D3E";
const SERIF = "Georgia, 'Times New Roman', serif";

export type DeptPalette = { base: string; ink: string; accent: string };

const DEFAULT_PALETTE: DeptPalette = { base: BASE, ink: INK, accent: ACCENT };

/**
 * Slice 3 — art direction per department. Keyword-matched against the
 * product's category slug, so every catalogue (not just heritage) gets
 * distinct tiles: 8 palettes × 4 motifs × 26 initials. Unknown or hostile
 * keys fall back to the heritage default — never throw, never reflect.
 */
/** Exact category slugs (heritage departments) — checked before keywords
 * so `womens` never matches the `mens` keyword rule. */
const DEPT_EXACT: Record<string, DeptPalette> = {
  womens: { base: "#FBF3EC", ink: "#5C1A1B", accent: "#B98A2F" },
  mens: { base: "#EFF1F7", ink: "#1F2A5C", accent: "#3E63C4" },
  kids: { base: "#F2F7F3", ink: "#134E4A", accent: "#D9A441" },
  living: { base: "#F5F1E8", ink: "#4A3F2A", accent: "#7D8C5C" },
  jewelry: { base: "#232120", ink: "#F0EDE8", accent: "#C9A227" },
};

const DEPT_KEYWORDS: Array<{ match: RegExp; palette: DeptPalette }> = [
  { match: /saree|jamdani|muslin|taant|bridal/, palette: DEPT_EXACT.womens! },
  { match: /panjab|kurta|sherwani|groom/, palette: DEPT_EXACT.mens! },
  { match: /kid|baby|newborn|teen|junior/, palette: DEPT_EXACT.kids! },
  {
    match: /living|home|decor|kantha|kitchen|cushion/,
    palette: DEPT_EXACT.living!,
  },
  {
    match: /jewel|accessor|bangle|necklace|earring|gold/,
    palette: DEPT_EXACT.jewelry!,
  },
  {
    match: /shawl|winter|jacket|sweater|stole|scarf/,
    palette: { base: "#F7EFE6", ink: "#7C2D12", accent: "#A34A24" },
  },
  {
    match: /wedding|festiv|eid|puja|gift/,
    palette: { base: "#FBEFEF", ink: "#7F1D1D", accent: "#C9A227" },
  },
  {
    match: /lawn|voile|cotton|fabric/,
    palette: { base: "#F0F6F4", ink: "#1E4D3F", accent: "#3E9B7A" },
  },
];

/** Resolve a department key to a palette. Unknown → heritage default. */
export function paletteForDept(raw: string | null | undefined): DeptPalette {
  const key = placeholderSeed(raw);
  if (key in DEPT_EXACT) return DEPT_EXACT[key]!;
  for (const { match, palette } of DEPT_KEYWORDS) {
    if (match.test(key)) return palette;
  }
  return DEFAULT_PALETTE;
}

/** URL-safe slug seed. Never empty (falls back to "product"). */
export function placeholderSeed(raw: string | null | undefined): string {
  const slug = (raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "product";
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Deterministic placeholder SVG for a product title or slug. */
export function placeholderSvg(
  title: string | null | undefined,
  dept: string | null | undefined = null,
): string {
  const seed = placeholderSeed(title);
  const pal = dept ? paletteForDept(dept) : DEFAULT_PALETTE;
  const PB = pal.base;
  const PI = pal.ink;
  const PA = pal.accent;
  const initial = escXml((seed[0] ?? "p").toUpperCase());
  const motif = hashSeed(seed) % 4;
  // All-over weave pattern: any crop (wide hero band, square tile,
  // portrait story) shows texture, never an empty field.
  const weave =
    `<pattern id="w" width="56" height="56" patternUnits="userSpaceOnUse">` +
    `<path d="M0 56 L56 0" stroke="${PA}" stroke-width="2" opacity="0.12"/>` +
    `</pattern><rect width="800" height="1000" fill="url(#w)"/>`;
  const motifs = [
    `<circle cx="640" cy="180" r="120" fill="none" stroke="${PA}" stroke-width="3" opacity="0.35"/>`,
    `<path d="M0 700 L800 420" stroke="${PA}" stroke-width="3" opacity="0.35"/>`,
    `<g opacity="0.3" fill="${PA}"><circle cx="120" cy="120" r="26"/><circle cx="200" cy="120" r="26"/><circle cx="120" cy="200" r="26"/><circle cx="200" cy="200" r="26"/></g>`,
    `<path d="M120 880 Q400 640 680 880" fill="none" stroke="${PA}" stroke-width="3" opacity="0.35"/>`,
  ];
  // Center-right badge: keeps the monogram compact and clear of left-set
  // copy so wide hero crops never blow it full-bleed over headlines.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" role="img">` +
    `<rect width="800" height="1000" fill="${PB}"/>` +
    weave +
    motifs[motif]! +
    `<circle cx="600" cy="500" r="100" fill="${PB}" stroke="${PA}" stroke-width="4"/>` +
    `<text x="600" y="536" text-anchor="middle" font-family="${SERIF}" font-size="110" fill="${PI}">${initial}</text>` +
    `</svg>`
  );
}
