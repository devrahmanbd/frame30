/**
 * Deterministic image-free product tile.
 *
 * Demo catalogue products ship with `image_url NULL`, so every surface that
 * renders product media (builder `ProductCard`/`MediaFrame`, `StoreImage`
 * grids, the conversion `ProductRail`) would otherwise show a giant empty
 * grey box. Per honest-copy rules nothing here hotlinks stock photography or
 * invents product imagery: the tile is typographic, not photographic.
 *
 * Design: an initial-letter monogram in roman display type over a faint
 * ingredient-motif accent (petal, leaf, drop, rings, wash, dots). Colours are
 * the Rupaboti blueprint tokens from `src/lib/theme-blueprints.ts` — ivory
 * surface `#FFF7FA`, deep plum ink `#3F1D2E`, rose-plum brand `#9D174D`,
 * rose-clay accent `#B45309` — never competing hues.
 *
 * Determinism: the motif variant is an FNV-1a hash of the product id/slug, so
 * the same product always renders the same tile with no per-render randomness.
 * The tile is a single static SVG (`preserveAspectRatio="slice"`) so it fills
 * any square media frame and scales without layout shift. No animation, so it
 * is reduced-motion safe by construction. Decorative only (`aria-hidden`): the
 * product title next to the tile remains the accessible name.
 */

/** Rupaboti blueprint tokens (see `rupaboti()` in theme-blueprints.ts). */
export const TILE_BASE = "#FFF7FA";
export const TILE_INK = "#3F1D2E";
export const TILE_BRAND = "#9D174D";
export const TILE_CLAY = "#B45309";

const ROMAN_DISPLAY = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

/** Number of motif variants. Bump only with a new motif below. */
export const TILE_VARIANTS = 6;

/** FNV-1a 32-bit hash. Stable across renders, runtimes and processes. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Motif variant for a seed. `null`/empty still resolves to a stable variant. */
export function tileVariantFor(seed: string | null | undefined): number {
  return hashSeed(seed ?? "") % TILE_VARIANTS;
}

/**
 * Monogram letter for a title. First Latin alphanumeric, upper-cased; falls
 * back to "R" (Rupaboti) for empty, null or non-Latin titles so the tile type
 * stays roman display only.
 */
export function monogramOf(title: string | null | undefined): string {
  const match = /[A-Za-z0-9]/.exec(title ?? "");
  return (match?.[0] ?? "R").toUpperCase();
}

function Motif({ variant }: { variant: number }) {
  switch (variant) {
    case 0:
      // Petal arcs, upper right.
      return (
        <g fill="none">
          <circle cx={318} cy={82} r={120} fill={TILE_BRAND} opacity={0.07} stroke="none" />
          <ellipse cx={310} cy={110} rx={86} ry={46} transform="rotate(-24 310 110)" stroke={TILE_BRAND} strokeWidth={3} opacity={0.35} />
          <ellipse cx={310} cy={110} rx={58} ry={30} transform="rotate(-24 310 110)" fill={TILE_BRAND} opacity={0.08} stroke="none" />
          <ellipse cx={268} cy={160} rx={52} ry={26} transform="rotate(-24 268 160)" stroke={TILE_CLAY} strokeWidth={2.5} opacity={0.35} />
        </g>
      );
    case 1:
      // Leaf sprig, lower left.
      return (
        <g fill="none">
          <circle cx={70} cy={330} r={110} fill={TILE_CLAY} opacity={0.07} stroke="none" />
          <path d="M60 360 C 90 300, 130 260, 190 240" stroke={TILE_CLAY} strokeWidth={3} opacity={0.4} />
          <ellipse cx={105} cy={305} rx={40} ry={20} transform="rotate(-38 105 305)" fill={TILE_BRAND} opacity={0.1} stroke={TILE_BRAND} strokeWidth={2.5} />
          <ellipse cx={152} cy={270} rx={32} ry={16} transform="rotate(-30 152 270)" fill={TILE_CLAY} opacity={0.12} stroke={TILE_CLAY} strokeWidth={2.5} />
        </g>
      );
    case 2:
      // Serum drop, upper centre.
      return (
        <g fill="none">
          <circle cx={200} cy={70} r={100} fill={TILE_BRAND} opacity={0.06} stroke="none" />
          <path
            d="M200 30 C 236 84, 258 116, 258 152 A 58 58 0 0 1 142 152 C 142 116, 164 84, 200 30 Z"
            fill={TILE_CLAY}
            opacity={0.08}
            stroke={TILE_BRAND}
            strokeWidth={3}
          />
          <path d="M178 150 a 26 26 0 0 0 18 24" stroke={TILE_BRAND} strokeWidth={3} strokeLinecap="round" opacity={0.4} />
        </g>
      );
    case 3:
      // Concentric rings, lower right.
      return (
        <g fill="none">
          <circle cx={330} cy={330} r={130} stroke={TILE_BRAND} strokeWidth={3} opacity={0.22} />
          <circle cx={330} cy={330} r={96} stroke={TILE_CLAY} strokeWidth={2.5} opacity={0.3} />
          <circle cx={330} cy={330} r={62} fill={TILE_BRAND} opacity={0.07} stroke={TILE_BRAND} strokeWidth={2.5} />
          <circle cx={70} cy={70} r={54} fill={TILE_CLAY} opacity={0.07} stroke="none" />
        </g>
      );
    case 4:
      // Diagonal wash band.
      return (
        <g>
          <polygon points="0,300 400,140 400,210 0,370" fill={TILE_CLAY} opacity={0.07} />
          <line x1={0} y1={292} x2={400} y2={132} stroke={TILE_BRAND} strokeWidth={3} opacity={0.3} />
          <line x1={0} y1={378} x2={400} y2={218} stroke={TILE_CLAY} strokeWidth={2.5} opacity={0.35} />
          <circle cx={90} cy={90} r={46} fill={TILE_BRAND} opacity={0.07} />
        </g>
      );
    default:
      // Dot field (powder/pearl), upper left.
      return (
        <g fill={TILE_BRAND}>
          {[
            [56, 56], [104, 56], [152, 56], [56, 104], [104, 104],
            [152, 104], [200, 56], [56, 152], [104, 152], [152, 152],
            [200, 104], [56, 200], [104, 200],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 8 : 5.5} opacity={i % 4 === 0 ? 0.22 : 0.14} />
          ))}
          <circle cx={336} cy={320} r={72} fill={TILE_CLAY} opacity={0.07} />
        </g>
      );
  }
}

export function ProductTileArt({
  seed,
  title,
  className = "",
}: {
  /** Stable product key (id or slug). Same seed always renders the same tile. */
  seed: string | null | undefined;
  /** Product title. Supplies the monogram letter; never rendered as words. */
  title?: string | null;
  className?: string;
}) {
  const key = seed ?? title ?? "";
  const variant = tileVariantFor(key);
  const monogram = monogramOf(title ?? (typeof key === "string" ? key : ""));
  return (
    <div
      role="presentation"
      aria-hidden="true"
      data-tile-art={variant}
      data-monogram={monogram}
      className={`relative block overflow-hidden ${className}`}
      style={{ backgroundColor: TILE_BASE }}
    >
      <svg
        viewBox="0 0 400 400"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      >
        <rect x={0} y={0} width={400} height={400} fill={TILE_BASE} />
        <Motif variant={variant} />
        <circle cx={200} cy={200} r={122} fill="none" stroke={TILE_INK} strokeWidth={2} opacity={0.18} />
        <text
          x={200}
          y={204}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={ROMAN_DISPLAY}
          fontSize={148}
          fontWeight={400}
          fill={TILE_INK}
        >
          {monogram}
        </text>
        <rect x={34} y={352} width={14} height={14} transform="rotate(45 41 359)" fill={TILE_CLAY} opacity={0.85} />
        <rect x={1} y={1} width={398} height={398} fill="none" stroke={TILE_INK} strokeWidth={2} opacity={0.08} />
      </svg>
    </div>
  );
}
