/**
 * Phase 15 — installed-theme card (WordPress Appearance › Themes behaviour).
 *
 * Hover darkens the screenshot and centres a `Theme details` plate. The active
 * card's footer becomes a signal bar with `Customize`; inactive cards reveal
 * `Activate` and `Live preview`. Everything is keyboard reachable: the card is
 * a button, and the footer actions are real buttons outside it.
 */
import { useState } from "react";
import { Check, Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstalledTheme } from "@/lib/themes/appearance";
import { btnGhost, btnPrimary } from "@/components/console/kit";
import { ThemeScreenshot } from "./ThemeScreenshot";

export function ThemeCard({
  theme,
  busy,
  onDetails,
  onActivate,
  onPreview,
  onCustomize,
  onToggleFavourite,
}: {
  theme: InstalledTheme;
  busy?: boolean;
  onDetails: () => void;
  onActivate: () => void;
  onPreview: () => void;
  onCustomize: () => void;
  onToggleFavourite: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const lifted = hover || focus;

  return (
    <article
      className="fq-card group relative overflow-hidden rounded-fq-lg border border-border bg-card transition-shadow duration-200 hover:shadow-fq-md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocus(false);
      }}
      data-active={theme.isActive ? "true" : "false"}
    >
      <div className="relative">
        <ThemeScreenshot
          name={theme.name}
          seed={theme.key ?? theme.id}
          url={theme.screenshotUrl}
          dim={lifted}
        />
        <div
          className={cn(
            "absolute inset-0 grid place-items-center gap-2 p-3 transition-opacity duration-200",
            lifted ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <button
            type="button"
            className={cn(btnGhost, "min-h-11 px-4 font-medium")}
            onClick={onDetails}
          >
            Theme details
          </button>
          {!theme.isActive && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className={cn(btnGhost, "min-h-11")}
                onClick={onActivate}
                disabled={busy}
              >
                Activate
              </button>
              <button type="button" className={cn(btnPrimary, "min-h-11")} onClick={onPreview}>
                Live preview
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-pressed={theme.favourite}
          aria-label={theme.favourite ? `Unstar ${theme.name}` : `Star ${theme.name}`}
          onClick={onToggleFavourite}
          className="absolute right-2 top-2 grid size-9 place-items-center rounded-full border border-border bg-card/90 text-muted-foreground backdrop-blur transition-colors hover:text-primary"
        >
          <Star
            className={cn("size-4", theme.favourite && "fill-current text-primary")}
            aria-hidden
          />
        </button>
        {theme.updateAvailable ? (
          <span className="absolute left-2 top-2 rounded-full border border-border bg-card/90 px-2 py-1 text-[11px] font-medium text-foreground backdrop-blur">
            Update to {theme.updateAvailable}
          </span>
        ) : null}
      </div>

      {theme.isActive ? (
        <div className="flex items-center justify-between gap-2 bg-primary px-3 py-2 text-primary-foreground">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <Check className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Active: {theme.name}</span>
          </span>
          <button
            type="button"
            onClick={onCustomize}
            className="min-h-9 rounded-fq-md border border-primary-foreground/70 px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/15"
          >
            Customize
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{theme.name}</p>
            <p className="truncate text-xs fq-sub">
              Version {theme.version} · {theme.author}
            </p>
          </div>
          <button type="button" className={cn(btnGhost, "shrink-0")} onClick={onDetails}>
            Details
          </button>
        </div>
      )}
    </article>
  );
}

/** Trailing dashed cell — the `+ Add theme` affordance from WordPress. */
export function AddThemeCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fq-dots grid min-h-[220px] w-full place-items-center gap-2 rounded-fq-lg border border-dashed border-border bg-card/40 p-6 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-full border border-current"
      >
        <Plus className="size-5" />
      </span>
      <span className="text-sm font-medium">Add theme</span>
    </button>
  );
}
