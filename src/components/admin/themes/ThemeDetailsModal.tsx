/**
 * Phase 15 — the full-screen theme details modal.
 *
 * WordPress' behaviour: big screenshot left, metadata right, `‹ ›` to move
 * between themes without closing, activation and preview in the footer, delete
 * pushed far right in the danger tone. Escape closes; the arrows are keyboard
 * bound too, which is how the WP modal behaves.
 */
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstalledTheme } from "@/lib/themes/appearance";
import { btnGhost, btnPrimary } from "@/components/console/kit";
import { ThemeScreenshot } from "./ThemeScreenshot";

export function ThemeDetailsModal({
  theme,
  busy,
  onClose,
  onStep,
  onActivate,
  onPreview,
  onCustomize,
  onDelete,
  onToggleAutoUpdate,
}: {
  theme: InstalledTheme;
  busy?: boolean;
  onClose: () => void;
  onStep: (direction: -1 | 1) => void;
  onActivate: () => void;
  onPreview: () => void;
  onCustomize: () => void;
  onDelete: () => void;
  onToggleAutoUpdate: (next: boolean) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onStep(-1);
      if (event.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--fq-scrim)] p-0 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${theme.name} theme details`}
        className="fq-edge-inner mx-auto flex max-h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-none border border-border bg-card sm:rounded-fq-lg motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-1">
            <IconButton label="Previous theme" onClick={() => onStep(-1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </IconButton>
            <IconButton label="Next theme" onClick={() => onStep(1)}>
              <ChevronRight className="size-4" aria-hidden />
            </IconButton>
          </div>
          <IconButton label="Close theme details" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </header>

        <div className="grid flex-1 gap-6 overflow-auto p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:p-6">
          <ThemeScreenshot
            name={theme.name}
            seed={theme.key ?? theme.id}
            url={theme.screenshotUrl}
            className="aspect-[16/10] h-fit"
          />
          <div className="min-w-0 space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{theme.name}</h2>
              <p className="mt-1 text-sm fq-sub">
                Version {theme.version} · By {theme.author}
              </p>
              {theme.isActive ? (
                <span className="mt-2 inline-flex rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                  Active theme
                </span>
              ) : null}
            </div>

            <p className="text-sm text-foreground/90">
              {theme.description || "No description was supplied with this theme."}
            </p>

            {theme.updateAvailable ? (
              <p className="rounded-fq-md border border-border bg-muted px-3 py-2 text-sm">
                Version {theme.updateAvailable} is available in the catalogue.
              </p>
            ) : null}

            <label className="flex items-start gap-3 rounded-fq-md border border-border bg-card p-3">
              <input
                type="checkbox"
                checked={theme.autoUpdate}
                onChange={(event) => onToggleAutoUpdate(event.currentTarget.checked)}
                className="mt-0.5 size-5 accent-[var(--fq-signal)]"
              />
              <span className="text-sm">
                <span className="font-medium text-foreground">Automatic updates</span>
                <span className="mt-0.5 block text-xs fq-sub">
                  Install catalogue updates for this theme as soon as they ship.
                </span>
              </span>
            </label>

            {theme.tags.length ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide fq-sub">Tags</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {theme.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground/90"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {theme.isActive ? (
            <button type="button" className={btnPrimary} onClick={onCustomize}>
              Customize
            </button>
          ) : (
            <>
              <button type="button" className={btnPrimary} onClick={onActivate} disabled={busy}>
                Activate
              </button>
              <button type="button" className={btnGhost} onClick={onPreview}>
                Live preview
              </button>
            </>
          )}
          {!theme.isActive ? (
            <button
              type="button"
              onClick={onDelete}
              className={cn(
                btnGhost,
                "ml-auto border-[color-mix(in_oklab,var(--fq-danger)_35%,var(--color-border))] text-[var(--fq-danger)] hover:bg-[color-mix(in_oklab,var(--fq-danger)_10%,transparent)]",
              )}
            >
              Delete
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-fq-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
