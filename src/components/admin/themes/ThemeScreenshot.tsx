/**
 * Appearance › Themes — dynamic 16:10 screenshot pipeline.
 *
 * Renders real uploaded screenshots when available; otherwise dynamically
 * generates a high-fidelity miniature storefront snapshot with theme brand tokens,
 * navigation chrome, hero section, and product grid — replacing static placeholder
 * color blocks with living theme preview assets.
 */
import { useMemo } from "react";
import { ShoppingBag, Search, Star, Sparkles } from "lucide-react";
import { screenshotPlate, themeInitials } from "@/lib/themes/appearance";
import { cn } from "@/lib/utils";

export function ThemeScreenshot({
  name,
  seed,
  url,
  className,
  dim = false,
}: {
  name: string;
  seed: string;
  url?: string | null;
  className?: string;
  /** Hover state on cards darkens the shot behind the details button. */
  dim?: boolean;
}) {
  const plate = useMemo(() => screenshotPlate(seed), [seed]);
  const brandColor = plate.from;
  const accentColor = plate.to;
  const surfaceColor = "#ffffff";
  const inkColor = "#18181b";

  return (
    <div
      className={cn(
        "relative aspect-[16/10] w-full select-none overflow-hidden rounded-fq-md border border-border bg-card",
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`${name} theme preview`}
          loading="lazy"
          className="size-full object-cover object-top"
        />
      ) : (
        <div
          aria-hidden
          className="flex size-full flex-col text-[10px] leading-tight"
          style={{ backgroundColor: surfaceColor, color: inkColor }}
        >
          {/* Top Browser / Announcement Bar */}
          <div
            className="flex h-5 shrink-0 items-center justify-between px-2.5 text-[9px] font-medium text-primary-foreground shadow-xs"
            style={{ backgroundColor: brandColor }}
          >
            <div className="flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-primary-foreground/70" />
              <span className="truncate max-w-[120px] tracking-tight">
                Free shipping nationwide · 24/7 Support
              </span>
            </div>
            <span className="opacity-90 font-mono text-[8px]">
              your-store.com
            </span>
          </div>

          {/* Mini Storefront Navigation Bar */}
          <div className="flex h-7 shrink-0 items-center justify-between border-b border-border/5 px-2.5 bg-card/60 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 font-bold tracking-tight">
              <span
                className="grid size-3.5 place-items-center rounded-[3px] text-[8px] font-black text-primary-foreground"
                style={{ backgroundColor: brandColor }}
              >
                {themeInitials(name)[0] ?? "F"}
              </span>
              <span className="truncate max-w-[80px] text-[10px] font-semibold">
                {name}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[9px] text-muted-foreground font-medium">
              <span className="text-foreground">Home</span>
              <span>Shop</span>
              <span>Collections</span>
              <span>About</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Search className="size-2.5" />
              <div className="relative">
                <ShoppingBag className="size-2.5" />
                <span
                  className="absolute -right-1 -top-1 grid size-2 place-items-center rounded-full text-[6px] font-bold text-primary-foreground"
                  style={{ backgroundColor: accentColor }}
                >
                  2
                </span>
              </div>
            </div>
          </div>

          {/* Mini Hero Banner */}
          <div
            className="relative flex flex-1 flex-col justify-center overflow-hidden px-3 py-2"
            style={{
              background: `linear-gradient(135deg, ${brandColor}15, ${accentColor}12, ${surfaceColor})`,
            }}
          >
            <div className="max-w-[70%] space-y-0.5">
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.2 text-[8px] font-semibold text-primary-foreground"
                style={{ backgroundColor: brandColor }}
              >
                <Sparkles className="size-2" />
                "New collection"
              </span>
              <h3 className="line-clamp-1 text-[13px] font-bold tracking-tight text-foreground">
                {name}
              </h3>
              <p className="line-clamp-1 text-[9px] text-muted-foreground">
                "Minimalist commerce aesthetics for modern brands."
              </p>
              <div className="pt-1">
                <span
                  className="inline-block rounded-fq-sm px-2 py-0.5 text-[8px] font-medium text-primary-foreground shadow-xs"
                  style={{ backgroundColor: brandColor }}
                >
                  Explore Catalog →
                </span>
              </div>
            </div>

            {/* Subtle decorative geometry */}
            <div
              className="absolute -right-3 -top-3 size-16 rounded-full opacity-20 blur-sm"
              style={{ backgroundColor: accentColor }}
            />
          </div>

          {/* Mini Product Cards Preview Shelf */}
          <div className="grid grid-cols-3 gap-1.5 border-t border-border/5 bg-muted/30 p-2">
            {[
              { label: "Classic Oxford", price: "৳ 1,850", rating: "4.9" },
              { label: "Leather Carrier", price: "৳ 3,400", rating: "5.0" },
              { label: "Minimalist Watch", price: "৳ 4,200", rating: "4.8" },
            ].map((prod, idx) => (
              <div
                key={idx}
                className="flex flex-col rounded-fq-sm border border-border/80 bg-card p-1 shadow-2xs"
              >
                <div
                  className="aspect-[4/3] w-full rounded-[3px] opacity-75"
                  style={{
                    background: `linear-gradient(${120 + idx * 40}deg, ${brandColor}20, ${accentColor}25)`,
                  }}
                />
                <div className="mt-1 flex items-center justify-between">
                  <span className="truncate text-[8px] font-medium text-foreground">
                    {prod.label}
                  </span>
                  <span className="flex items-center text-[7px] text-amber-500 font-mono">
                    <Star className="size-1.5 fill-current" />
                    {prod.rating}
                  </span>
                </div>
                <span className="text-[8px] font-bold text-foreground font-mono mt-0.5">
                  {prod.price}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hover Dim Overlay for Action Buttons */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-foreground/45 transition-opacity duration-200",
          dim ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
