/**
 * Phase 1.3 — CLS-safe media.
 *
 * Every image in a theme goes through here: an aspect-ratio box reserves space
 * before the bytes land, above-the-fold media opts into eager + high priority,
 * and everything else lazy-loads. This is the widget-side half of the INP/CLS
 * budget in `docs/14-operations/observability.md`.
 *
 * It also degrades: a signed transform URL that the proxy refuses (host not
 * allow-listed, missing signing secret, imgproxy down) falls back to the
 * original source once, and only then to the neutral placeholder. A
 * misconfigured transform must never blank out a shopper's product grid.
 */
import { useState } from "react";
import { decodeSource } from "@/lib/image-transform";
import { ProductTileArt, TILE_BASE } from "@/components/store/ProductTileArt";

export type MediaRatio = "square" | "portrait" | "landscape" | "wide" | "auto";

const RATIO_CLASS: Record<MediaRatio, string> = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
  wide: "aspect-[16/9]",
  auto: "",
};

/** `/api/public/img/:sig/:spec/:source` → the original absolute URL. */
function originalSource(src: string): string | null {
  const match = /\/api\/public\/img\/[^/]+\/[^/]+\/([^/?#]+)/.exec(src);
  if (!match?.[1]) return null;
  const decoded = decodeSource(match[1]);
  return decoded && /^https?:\/\//.test(decoded) ? decoded : null;
}

export function MediaFrame({
  src,
  alt,
  ratio = "landscape",
  eager = false,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  fit = "cover",
  className = "",
  children,
  artSeed,
}: {
  src: string | null | undefined;
  alt: string;
  ratio?: MediaRatio;
  /** True only for the LCP candidate; anything else must stay lazy. */
  eager?: boolean;
  sizes?: string;
  fit?: "cover" | "contain";
  className?: string;
  children?: React.ReactNode;
  /**
   * Opt-in to the deterministic product tile when `src` is null/empty.
   * Only product surfaces pass this (ProductCard, brand tiles); authored
   * content frames keep the neutral placeholder so a missing hero never
   * gains a product monogram.
   */
  artSeed?: string | null;
}) {
  // "given" → "original" → placeholder. One-way, so it can never loop.
  const [stage, setStage] = useState<"given" | "original" | "failed">("given");
  const shown =
    stage === "given"
      ? (src ?? null)
      : stage === "original"
        ? originalSource(src ?? "")
        : null;
  // Imageless product frames sit on the tile's ivory base, never grey: the
  // tile itself is opaque, so this only matters before hydration / at edges.
  const tiling = !shown && artSeed !== undefined;
  return (
    <div
      className={`relative overflow-hidden rounded-fq-md ${tiling ? "" : "bg-muted"} ${RATIO_CLASS[ratio]} ${className}`}
      {...(tiling ? { style: { backgroundColor: TILE_BASE } } : {})}
    >
      {shown ? (
        <img
          src={shown}
          alt={alt}
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          decoding={eager ? "sync" : "async"}
          fetchPriority={eager ? "high" : "auto"}
          className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
          onError={() =>
            setStage((current) =>
              current === "given" && originalSource(src ?? "")
                ? "original"
                : "failed",
            )
          }
        />
      ) : artSeed !== undefined ? (
        <ProductTileArt seed={artSeed ?? alt} title={alt} className="h-full w-full" />
      ) : (
        <div aria-hidden="true" className="h-full w-full bg-muted" />
      )}

      {children}
    </div>
  );
}
