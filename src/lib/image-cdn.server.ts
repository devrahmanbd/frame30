/**
 * Responsive image URLs for storefront surfaces — §4.4 edge transforms.
 *
 * Signing happens server-side (the HMAC secret never reaches a browser), so
 * loaders and server functions build the descriptors and components merely
 * render them. Every variant is snapped to the shared width ladder: an
 * unbounded `width` query param is how an image CDN bill explodes and how the
 * cache hit rate collapses.
 */
import { WIDTH_LADDER, snapWidth, type ResponsiveImage, type TransformSpec } from "./image-transform";
import { buildImageUrl } from "./image-transform.server";

export type { ResponsiveImage };

/** Widths we actually ship per surface — small ladders keep the cache hot. */
export const IMAGE_PRESETS = {
  thumb: { widths: [64, 128, 256], sizes: "64px", aspect: 1 },
  card: { widths: [256, 384, 512, 768], sizes: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px", aspect: 1 },
  hero: {
    widths: [512, 768, 1024, 1280, 1600],
    sizes: "(max-width: 768px) 100vw, 640px",
    aspect: 1,
  },
  banner: { widths: [768, 1280, 1920], sizes: "100vw", aspect: 3 },
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

/**
 * Builds a signed, immutably cacheable descriptor for one source image.
 * Returns `null` for a missing source so callers can render their own
 * placeholder instead of a broken `<img>`.
 */
export async function responsiveImage(
  source: string | null | undefined,
  preset: ImagePreset,
  overrides: Partial<TransformSpec> = {},
): Promise<ResponsiveImage | null> {
  if (!source) return null;
  const { widths, sizes, aspect } = IMAGE_PRESETS[preset];
  const ladder = [...new Set(widths.map(snapWidth))].sort((a, b) => a - b);

  const entries = await Promise.all(
    ladder.map(async (w) => {
      const url = await buildImageUrl(
        source,
        { ...overrides, width: w, height: Math.round(w / aspect), resize: overrides.resize ?? "cover" },
        "",
      );
      return `${url} ${w}w`;
    }),
  );

  const fallbackWidth = ladder[Math.min(ladder.length - 1, Math.max(0, Math.floor(ladder.length / 2)))]!;
  const src = (entries.find((e) => e.endsWith(` ${fallbackWidth}w`)) ?? entries[0]!).split(" ")[0]!;

  return {
    src,
    srcSet: entries.join(", "),
    sizes,
    width: fallbackWidth,
    height: Math.round(fallbackWidth / aspect),
  };
}

/** Convenience for lists: keeps ordering and tolerates missing images. */
export async function responsiveImages<T extends { image_url?: string | null }>(
  rows: T[],
  preset: ImagePreset,
): Promise<(T & { image: ResponsiveImage | null })[]> {
  return Promise.all(
    rows.map(async (row) => ({ ...row, image: await responsiveImage(row.image_url ?? null, preset) })),
  );
}

/** Widest variant available — used for og:image, where one absolute URL is needed. */
export async function socialImage(source: string | null | undefined, origin: string) {
  if (!source) return null;
  return buildImageUrl(source, { width: snapWidth(1200), height: 630, resize: "cover" }, origin);
}

export { WIDTH_LADDER };
