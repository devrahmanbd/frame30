/**
 * Phase 15 — the "Add theme" install screen.
 *
 * Count badge, Popular / Latest / Favourites tabs, the feature-filter drawer,
 * the `Upload theme` toggle with a validated `.zip` drop-zone, and cards whose
 * hover shows `Install · Preview`. Installed themes swap Install for the
 * `Installed` badge plus `Activate`, exactly as WordPress does.
 */
import { useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, Filter, Search, Star, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATALOG_TABS,
  EMPTY_SELECTION,
  MAX_THEME_UPLOAD_BYTES,
  catalogView,
  formatBytes,
  selectionCount,
  validateThemeUpload,
  type CatalogTab,
  type CatalogTheme,
  type FeatureSelection,
} from "@/lib/themes/appearance";
import {
  EmptyState,
  InlineError,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/console/kit";
import { ThemeScreenshot } from "./ThemeScreenshot";
import { FeatureFilterDrawer } from "./FeatureFilterDrawer";

export function AddThemeScreen({
  catalogue,
  busyKey,
  onBack,
  onInstall,
  onActivate,
  onPreview,
  onToggleFavourite,
}: {
  catalogue: CatalogTheme[];
  busyKey: string | null;
  onBack: () => void;
  onInstall: (theme: CatalogTheme) => void;
  onActivate: (theme: CatalogTheme) => void;
  onPreview: (theme: CatalogTheme) => void;
  onToggleFavourite: (theme: CatalogTheme) => void;
}) {
  const [tab, setTab] = useState<CatalogTab>("popular");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<FeatureSelection>(EMPTY_SELECTION);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const view = useMemo(
    () => catalogView(catalogue, { query, selection, tab }),
    [catalogue, query, selection, tab],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnGhost} onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden /> Installed themes
        </button>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          Add theme
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium fq-sub">
            {catalogue.length}
          </span>
        </h2>
        <button
          type="button"
          className={cn(btnGhost, "ml-auto")}
          aria-expanded={uploadOpen}
          onClick={() => setUploadOpen((value) => !value)}
        >
          <UploadCloud className="size-4" aria-hidden /> Upload theme
        </button>
      </div>

      {uploadOpen ? <UploadDropzone /> : null}

      <div className="fq-edge-inner flex flex-wrap items-center gap-2 rounded-fq-lg border border-border bg-card/80 p-2 backdrop-blur">
        <div role="tablist" aria-label="Theme catalogue" className="flex items-center gap-1">
          {CATALOG_TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={cn(
                "min-h-11 rounded-full px-3.5 text-sm transition-colors",
                tab === entry.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={btnGhost}
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
        >
          <Filter className="size-4" aria-hidden /> Feature filter
          {selectionCount(selection) ? (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {selectionCount(selection)}
            </span>
          ) : null}
        </button>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search themes…"
            aria-label="Search themes"
            className={cn(inputClass, "min-h-11 pl-8")}
          />
        </div>
      </div>

      {view.length === 0 ? (
        <EmptyState
          title="No themes match those filters"
          description="Clear the feature filter or try a different search term."
          action={
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setSelection(EMPTY_SELECTION);
                setQuery("");
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {view.map((theme) => (
            <li key={theme.key}>
              <CatalogCard
                theme={theme}
                busy={busyKey === theme.key}
                onInstall={() => onInstall(theme)}
                onActivate={() => onActivate(theme)}
                onPreview={() => onPreview(theme)}
                onToggleFavourite={() => onToggleFavourite(theme)}
              />
            </li>
          ))}
        </ul>
      )}

      <FeatureFilterDrawer
        open={filtersOpen}
        selection={selection}
        onChange={setSelection}
        onClose={() => setFiltersOpen(false)}
      />
    </div>
  );
}

function CatalogCard({
  theme,
  busy,
  onInstall,
  onActivate,
  onPreview,
  onToggleFavourite,
}: {
  theme: CatalogTheme;
  busy: boolean;
  onInstall: () => void;
  onActivate: () => void;
  onPreview: () => void;
  onToggleFavourite: () => void;
}) {
  const [lifted, setLifted] = useState(false);
  return (
    <article
      className="fq-card group relative overflow-hidden rounded-fq-lg border border-border bg-card transition-shadow duration-200 hover:shadow-fq-md"
      onMouseEnter={() => setLifted(true)}
      onMouseLeave={() => setLifted(false)}
      onFocus={() => setLifted(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setLifted(false);
      }}
    >
      <div className="relative">
        <ThemeScreenshot
          name={theme.name}
          seed={theme.key}
          url={theme.screenshotUrl}
          dim={lifted}
        />
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 transition-opacity duration-200",
            lifted ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {theme.installed ? (
            <button
              type="button"
              className={cn(btnGhost, "min-h-11")}
              onClick={onActivate}
              disabled={theme.active || busy}
            >
              {theme.active ? "Active" : "Activate"}
            </button>
          ) : (
            <button
              type="button"
              className={cn(btnPrimary, "min-h-11")}
              onClick={onInstall}
              disabled={busy}
            >
              {busy ? "Installing…" : "Install"}
            </button>
          )}
          <button type="button" className={cn(btnGhost, "min-h-11")} onClick={onPreview}>
            Details &amp; preview
          </button>
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
        {theme.installed ? (
          <span className="absolute left-2 top-2 rounded-full bg-card/90 px-2 py-1 text-[11px] font-medium text-foreground backdrop-blur">
            Installed
          </span>
        ) : null}
      </div>
      <div className="space-y-1 px-3 py-2">
        <p className="truncate text-sm font-medium text-foreground">{theme.name}</p>
        <p className="line-clamp-2 text-xs fq-sub">{theme.summary}</p>
        <p className="flex items-center gap-1.5 text-xs fq-sub">
          <Star className="size-3.5 fill-current text-primary" aria-hidden />
          <span className="fq-num text-foreground/90">{theme.rating.toFixed(1)}</span>·
          <span className="fq-num">{theme.installs.toLocaleString("en-US")}</span> installs
        </p>
      </div>
    </article>
  );
}

/** Client-side `.zip` validation; packaging upload lands with the media library. */
function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [over, setOver] = useState(false);

  const accept = (file: File | undefined) => {
    if (!file) return;
    const check = validateThemeUpload(file);
    setState(
      check.ok
        ? {
            ok: true,
            message: `${check.name} (${formatBytes(file.size)}) is ready. Theme packaging installs land with the media library.`,
          }
        : { ok: false, message: check.reason },
    );
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    accept(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "grid place-items-center gap-2 rounded-fq-lg border border-dashed px-6 py-10 text-center transition-colors",
          over ? "border-primary bg-primary/5" : "border-border bg-card/40",
        )}
      >
        <UploadCloud className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">Drop your theme .zip here</p>
        <p className="text-xs fq-sub">Maximum size {formatBytes(MAX_THEME_UPLOAD_BYTES)}</p>
        <button type="button" className={btnGhost} onClick={() => inputRef.current?.click()}>
          Select file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="sr-only"
          aria-label="Theme package"
          onChange={(event) => accept(event.currentTarget.files?.[0] ?? undefined)}
        />
      </div>
      {state ? (
        state.ok ? (
          <p className="rounded-fq-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
            {state.message}
          </p>
        ) : (
          <InlineError message={state.message} />
        )
      ) : null}
    </div>
  );
}
