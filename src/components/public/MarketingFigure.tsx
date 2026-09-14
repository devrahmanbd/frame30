import { Reveal } from "@/components/public/motion";

/**
 * A single editorial photograph with an optional caption.
 *
 * Marketing bands used to be text-only below the hero; a photograph every few
 * screens gives the eye somewhere to rest and makes the claim concrete. The
 * frame is deliberately uniform (same radius, hairline and lift as the product
 * stills) so photography never competes with the UI captures.
 */
export function MarketingFigure({
  src,
  alt,
  caption,
  className,
  aspect = "wide",
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  aspect?: "wide" | "square";
}) {
  return (
    <Reveal direction="none" duration={800} className={className}>
      <figure className="w-full">
        <img
          src={src}
          alt={alt}
          width={1440}
          height={816}
          loading="lazy"
          decoding="async"
          className={`w-full rounded-fq-lg border border-border object-cover shadow-lift ${
            aspect === "square" ? "aspect-square" : "aspect-[16/9]"
          }`}
        />
        {caption ? (
          <figcaption className="mt-3 text-xs text-muted-foreground">{caption}</figcaption>
        ) : null}
      </figure>
    </Reveal>
  );
}
