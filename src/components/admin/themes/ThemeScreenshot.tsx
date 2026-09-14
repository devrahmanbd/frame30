/**
 * Phase 15 — the 16:10 screenshot plate every theme card and modal shares.
 *
 * A theme without an uploaded screenshot still needs a recognisable, stable
 * face, so we render a deterministic gradient plate with the theme's initials
 * rather than a grey box or a broken image icon.
 */
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
  const plate = screenshotPlate(seed);
  return (
    <div
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden rounded-fq-md border border-border bg-muted",
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
          className="grid size-full place-items-center"
          style={{
            backgroundImage: `linear-gradient(${plate.angle}deg, ${plate.from}, ${plate.to})`,
          }}
        >
          <span className="text-2xl font-semibold tracking-tight text-primary-foreground/90">
            {themeInitials(name)}
          </span>
        </div>
      )}
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
