import { useState } from "react";
import { decodeSource, type ResponsiveImage } from "@/lib/image-transform";

/**
 * The signed variant URL carries the original source, so the raw retry works
 * even when the caller passed no explicit fallback.
 */
function originalOf(variantUrl: string | null): string | null {
  if (!variantUrl) return null;
  const match = /\/api\/public\/img\/[^/]+\/[^/]+\/([^/?#]+)/.exec(variantUrl);
  const decoded = match?.[1] ? decodeSource(match[1]) : null;
  return decoded && /^https?:\/\//.test(decoded) ? decoded : null;
}

/**
 * Storefront image. Renders a signed, responsive variant when the server
 * supplied one, and degrades to the raw source (or a neutral placeholder)
 * otherwise — a misconfigured transform secret must never blank out a
 * shopper's product grid.
 *
 * The degradation is also runtime: if the signed variant fails to load (the
 * transform refuses an un-allow-listed host, imgproxy is down), the raw source
 * is retried once and only then does the placeholder show.
 */
export function StoreImage({
  image,
  fallbackSrc,
  alt,
  className,
  priority = false,
  sizes,
}: {
  image: ResponsiveImage | null | undefined;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  /** Above-the-fold hero: eager + high priority, everything else lazy. */
  priority?: boolean;
  sizes?: string;
}) {
  const transformed = image?.src ?? null;
  const raw = fallbackSrc ?? originalOf(transformed);
  // "transformed" → "raw" → placeholder. Never loops: each step is one-way.
  const [stage, setStage] = useState<"transformed" | "raw" | "failed">(
    transformed ? "transformed" : raw ? "raw" : "failed",
  );
  const degrade = () => setStage((current) => (current === "transformed" && raw ? "raw" : "failed"));
  // A server-rendered image can fail *before* React attaches its handler, so
  // the load state is re-checked once the element is in the DOM; otherwise the
  // whole product grid stays blank behind a listener that never fires.
  const check = (node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) degrade();
  };

  const src = stage === "transformed" ? transformed : stage === "raw" ? raw : null;
  if (!src) {
    return <div className={className} role="presentation" aria-hidden data-placeholder="image" />;
  }

  const useVariant = stage === "transformed" && image;

  return (
    <img
      ref={check}
      src={src}
      {...(useVariant ? { srcSet: image.srcSet, sizes: sizes ?? image.sizes } : sizes ? { sizes } : {})}
      alt={alt}
      width={image?.width ?? 600}
      height={image?.height ?? 600}
      loading={priority ? "eager" : "lazy"}
      // eslint-disable-next-line react/no-unknown-property
      fetchPriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
      className={className}
      onError={degrade}
    />
  );
}
