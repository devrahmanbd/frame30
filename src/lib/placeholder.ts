/**
 * Local SVG product placeholder (clothing-heritage tokens).
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
export function placeholderSvg(title: string | null | undefined): string {
  const seed = placeholderSeed(title);
  const initial = escXml((seed[0] ?? "p").toUpperCase());
  const motif = hashSeed(seed) % 4;
  // All-over weave pattern: any crop (wide hero band, square tile,
  // portrait story) shows texture, never an empty field.
  const weave =
    `<pattern id="w" width="56" height="56" patternUnits="userSpaceOnUse">` +
    `<path d="M0 56 L56 0" stroke="${ACCENT}" stroke-width="2" opacity="0.12"/>` +
    `</pattern><rect width="800" height="1000" fill="url(#w)"/>`;
  const motifs = [
    `<circle cx="640" cy="180" r="120" fill="none" stroke="${ACCENT}" stroke-width="3" opacity="0.35"/>`,
    `<path d="M0 700 L800 420" stroke="${ACCENT}" stroke-width="3" opacity="0.35"/>`,
    `<g opacity="0.3" fill="${ACCENT}"><circle cx="120" cy="120" r="26"/><circle cx="200" cy="120" r="26"/><circle cx="120" cy="200" r="26"/><circle cx="200" cy="200" r="26"/></g>`,
    `<path d="M120 880 Q400 640 680 880" fill="none" stroke="${ACCENT}" stroke-width="3" opacity="0.35"/>`,
  ];
  // Center badge: keeps the monogram compact so wide crops never blow it
  // full-bleed. Badge center (400,500) sits inside every common crop band.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" role="img">` +
    `<rect width="800" height="1000" fill="${BASE}"/>` +
    weave +
    motifs[motif]! +
    `<circle cx="400" cy="500" r="130" fill="${BASE}" stroke="${ACCENT}" stroke-width="4"/>` +
    `<text x="400" y="548" text-anchor="middle" font-family="${SERIF}" font-size="140" fill="${INK}">${initial}</text>` +
    `</svg>`
  );
}
