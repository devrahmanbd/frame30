import { type ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MarketingPlaceholderImageProps {
  /**
   * Exact prompt to generate the target image using AI (Midjourney, DALL-E, Flux, Imagen).
   * Describes the subject, style, lighting, composition, and aspect ratio.
   */
  alt: string;
  badge?: string;
  aspect?: "16/9" | "4/3" | "21/9" | "3/2" | "square";
  caption?: string;
  className?: string;
  overlay?: ReactNode;
}

const ASPECT_CLASSES = {
  "16/9": "aspect-video",
  "4/3": "aspect-[4/3]",
  "21/9": "aspect-[21/9]",
  "3/2": "aspect-[3/2]",
  square: "aspect-square",
};

/**
 * MarketingPlaceholderImage — clean, professional interface and media visual component.
 *
 * Renders an intentional, elegant media container with accessible AI prompt metadata
 * preserved in the alt attribute, avoiding unsightly faux-watermarks or AI slop banners.
 */
export function MarketingPlaceholderImage({
  alt,
  badge,
  aspect = "16/9",
  caption,
  className,
  overlay,
}: MarketingPlaceholderImageProps) {
  // Sleek, minimal architectural interface canvas SVG that adapts cleanly
  const placeholderSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" fill="none"><rect width="960" height="540" fill="%231a181b"/><g opacity="0.15"><line x1="0" y1="90" x2="960" y2="90" stroke="%23ffffff" stroke-width="1"/><line x1="0" y1="180" x2="960" y2="180" stroke="%23ffffff" stroke-width="1"/><line x1="0" y1="270" x2="960" y2="270" stroke="%23ffffff" stroke-width="1"/><line x1="0" y1="360" x2="960" y2="360" stroke="%23ffffff" stroke-width="1"/><line x1="0" y1="450" x2="960" y2="450" stroke="%23ffffff" stroke-width="1"/><line x1="160" y1="0" x2="160" y2="540" stroke="%23ffffff" stroke-width="1"/><line x1="320" y1="0" x2="320" y2="540" stroke="%23ffffff" stroke-width="1"/><line x1="480" y1="0" x2="480" y2="540" stroke="%23ffffff" stroke-width="1"/><line x1="640" y1="0" x2="640" y2="540" stroke="%23ffffff" stroke-width="1"/><line x1="800" y1="0" x2="800" y2="540" stroke="%23ffffff" stroke-width="1"/></g><g opacity="0.35" transform="translate(430, 210)"><rect width="100" height="80" rx="12" stroke="%238a7c85" stroke-width="1.5" fill="%23242025"/><circle cx="35" cy="32" r="9" fill="%238a7c85"/><path d="M14 68 L42 42 L66 60 L80 48 L92 68 Z" fill="%23483f46"/></g></svg>`;

  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-fq-md border border-border/70 bg-card/60 shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-md",
        className,
      )}
    >
      <div className={cn("relative w-full overflow-hidden bg-muted/20", ASPECT_CLASSES[aspect])}>
        {overlay ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            {overlay}
          </div>
        ) : (
          <img
            src={placeholderSvg}
            alt={alt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.02] opacity-80"
          />
        )}

        {/* Ambient Tone Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent pointer-events-none" />

        {/* Floating Category/Status Badge */}
        {badge && (
          <div className="absolute top-3 left-3 z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/85 px-3 py-1 text-[11px] font-medium text-foreground backdrop-blur-md shadow-sm">
              <ImageIcon className="size-3 text-primary" />
              {badge}
            </span>
          </div>
        )}
      </div>

      {caption && (
        <figcaption className="border-t border-border/50 bg-card/90 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between">
          <span className="font-medium truncate">{caption}</span>
        </figcaption>
      )}
    </figure>
  );
}
