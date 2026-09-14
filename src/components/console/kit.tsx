/**
 * Console kit — Phase 3 of the console UX redesign.
 *
 * One API, one density scale. Every `/admin` (and `/dashboard`) screen consumes
 * these primitives and nothing else: `Page`, `Card`, `DataTable`, `Field`,
 * `Badge`, `EmptyState`, `Toolbar`, `Drawer`, `ConfirmDialog`, `Skeleton`.
 *
 * Visual rules come from the Slate & Signal token layer (Phase 2):
 * hairline + micro shadow elevation (`fq-card`), exactly two text tones
 * (`text-foreground` / `fq-sub`), tabular numerals on data (`fq-num`),
 * radii 6 / 10 / 14, and the signal colour on focus only.
 *
 * `/root` is exempt by design and keeps its own components. Never import
 * anything from `src/components/root/*` here.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { AlertTriangle, Inbox, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ density */

export type Density = "compact" | "default";

const DensityContext = createContext<Density>("default");

export function DensityProvider({
  density,
  children,
}: {
  density: Density;
  children: ReactNode;
}) {
  return <DensityContext.Provider value={density}>{children}</DensityContext.Provider>;
}

export function useDensity(override?: Density): Density {
  const inherited = useContext(DensityContext);
  return override ?? inherited;
}

/** The single density scale — nothing in the console invents its own padding. */
const CELL_PAD: Record<Density, string> = {
  compact: "px-3 py-1.5",
  default: "px-3 py-2.5",
};

const BOX_PAD: Record<Density, string> = {
  compact: "p-3",
  default: "p-4",
};

/* -------------------------------------------------------------------- Page */

export function Page({
  title,
  description,
  actions,
  tabs,
  children,
  density = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Section tabs rendered under the title, above the content. */
  tabs?: ReactNode;
  children?: ReactNode;
  density?: Density;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  // Route-change focus reset: the heading is the landing point for AT users.
  useEffect(() => {
    ref.current?.focus();
  }, [title]);

  return (
    <DensityProvider density={density}>
      <div className="mx-auto w-full max-w-[1400px]">
        <header className="sticky top-14 z-10 mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 bg-background/95 py-3 backdrop-blur sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h1
              ref={ref}
              tabIndex={-1}
              className="truncate text-lg font-semibold text-foreground outline-none"
            >
              {title}
            </h1>
            {description ? <p className="mt-1 text-sm fq-sub">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
        {tabs ? <div className="mb-5">{tabs}</div> : null}
        {/* Keyed on the title so content settles in once per route, not per render. */}
        <div key={String(title)} className="fq-enter">
          {children}
        </div>
      </div>
    </DensityProvider>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  title,
  description,
  actions,
  footer,
  padded = true,
  className,
  children,
  density,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Turn off when the card hosts a table that owns its own padding. */
  padded?: boolean;
  className?: string;
  children?: ReactNode;
  density?: Density;
}) {
  const d = useDensity(density);
  return (
    <section className={cn("fq-card fq-beam fq-hover-spotlight fq-edge-inner overflow-hidden", className)}>
      {title || actions ? (
        <header
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 border-b border-border",
            d === "compact" ? "px-3 py-2" : "px-4 py-3",
          )}
        >
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs fq-sub">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? BOX_PAD[d] : undefined}>{children}</div>
      {footer ? (
        <footer
          className={cn(
            "border-t border-border text-xs fq-sub",
            d === "compact" ? "px-3 py-2" : "px-4 py-3",
          )}
        >
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------- Badge */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONE_INK: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  success: "text-[var(--fq-success)]",
  warning: "text-[var(--fq-warning)]",
  danger: "text-[var(--fq-danger)]",
  info: "text-primary",
  brand: "text-[var(--fq-brand)]",
};

/** Colour never carries the meaning alone — the label always says it too. */
export function Badge({
  children,
  tone = "neutral",
  dot = true,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "fq-status fq-edge-inner rounded-full px-2.5",
        TONE_INK[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      <span className="text-foreground/90">{children}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- Money/Num */

export function Money({
  minor,
  currency = "BDT",
  locale = "en-BD",
  className,
}: {
  minor: number | null | undefined;
  currency?: string;
  locale?: string;
  className?: string;
}) {
  if (minor === null || minor === undefined) {
    return <span className="fq-sub">—</span>;
  }
  const text = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return <span className={cn("fq-num", className)}>{text}</span>;
}

/* ------------------------------------------------------------------- Field */

export const inputClass =
  "fq-focus-glow w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none";

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Validation lives next to the field — never in a top-of-page dump. */
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span aria-hidden className="ml-0.5 text-[var(--fq-danger)]">*</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-[var(--fq-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs fq-sub">{hint}</p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Toolbar */

export function Toolbar({
  children,
  end,
  className,
  density,
}: {
  children?: ReactNode;
  end?: ReactNode;
  className?: string;
  density?: Density;
}) {
  const d = useDensity(density);
  return (
    <div
      className={cn(
        "fq-edge-inner mb-3 flex flex-wrap items-center gap-2 rounded-fq-lg border border-border bg-card/80 backdrop-blur",
        d === "compact" ? "p-1.5" : "p-2",
        className,
      )}
    >
      {children}
      {end ? <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div> : null}
    </div>
  );
}

export type SavedView = { id: string; label: string; count?: number };

export function SavedViews({
  views,
  activeId,
  onSelect,
}: {
  views: readonly SavedView[];
  activeId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Saved views">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={v.id === activeId}
          onClick={() => onSelect(v.id)}
          className={cn(
            // 44px thumb target on phones, compact pill from tablet up.
            "inline-flex min-h-11 items-center rounded-full px-3 py-1 text-xs font-medium transition-[color,background-color,box-shadow,transform] duration-150 md:min-h-0",

            v.id === activeId
              ? "fq-pill-active fq-shine"
              : "fq-sub hover:-translate-y-px hover:bg-muted hover:text-foreground",
          )}
        >
          {v.label}
          {typeof v.count === "number" ? (
            <span className="ml-1 fq-num opacity-70">{v.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}


export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children?: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="fq-card fq-beam fq-edge-inner fq-halo sticky bottom-3 z-10 mt-3 flex flex-wrap items-center gap-3 bg-card/90 px-3 py-2 backdrop-blur">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-xs fq-sub underline-offset-2 hover:underline"
      >
        Clear
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */

/**
 * Phase 9. Skeletons, never spinners: a spinner says "something is happening",
 * a skeleton says "this exact shape is coming", so nothing reflows on arrival.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div aria-hidden style={style} className={cn("fq-shimmer rounded-fq-sm bg-muted", className)} />
  );
}

/** Loading geometry mirrors loaded rows — no spinners on lists. */
export function TableSkeleton({
  rows = 6,
  cols = 4,
  density,
}: {
  rows?: number;
  cols?: number;
  density?: Density;
}) {
  const d = useDensity(density);
  return (
    <div aria-busy="true" aria-live="polite" className="fq-card divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className={cn("flex items-center gap-4", CELL_PAD[d])}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton
              key={c}
              // First column reads as the identifier, the rest as values.
              className={cn("h-4", c === 0 ? "w-40 shrink-0" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card grids (KPIs, summaries) reserve their own boxes. */
export function CardSkeleton({ count = 3, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="fq-card space-y-3 p-4">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: lines }).map((__, l) => (
            <Skeleton key={l} className={cn("h-5", l === 0 ? "w-32" : "w-20")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A chart reserves its full plot box so the page never shifts when data lands. */
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div aria-busy="true" className="fq-card p-4">
      <Skeleton className="mb-4 h-3 w-28" />
      <Skeleton className="w-full rounded-fq-md" style={{ height }} />
    </div>
  );
}

/** Two-column record editors, matching `DetailLayout`. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="fq-card space-y-3 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="fq-card space-y-3 p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="fq-card space-y-3 p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- EmptyState */

/**
 * Restrained illustration: a token-coloured plate, not a stock drawing, and
 * exactly one primary call to action so the next step is never ambiguous.
 */
export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="fq-enter fq-dots fq-hover-spotlight rounded-fq-lg border border-dashed border-border px-6 py-12 text-center">
      <div
        aria-hidden
        className="mx-auto mb-4 flex size-11 items-center justify-center rounded-fq-md border border-border bg-muted fq-sub"
      >
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm fq-sub">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Every failure is recoverable: it states what broke, offers the retry, and
 * keeps the surrounding page usable instead of replacing it with a crash page.
 */
export function InlineError({
  message,
  onRetry,
  detail,
}: {
  message: string;
  onRetry?: () => void;
  detail?: string;
}) {
  return (
    <div
      role="alert"
      className="fq-enter-fade flex flex-wrap items-start justify-between gap-3 rounded-fq-lg border border-[color-mix(in_oklab,var(--fq-danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--fq-danger)_8%,transparent)] p-4 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 text-[var(--fq-danger)]" />
        <div>
          <p className="text-[var(--fq-danger)]">{message}</p>
          {detail ? <p className="mt-1 text-xs fq-sub">{detail}</p> : null}
        </div>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={btnGhost}>
          <RotateCcw aria-hidden className="size-3.5" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Full-surface variant for when the whole screen failed to load. */
export function ErrorState({
  title = "We couldn't load this",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-5 text-[var(--fq-danger)]" />}
      title={title}
      description={message ?? "The request didn't complete. Nothing was changed."}
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className={btnPrimary}>
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : undefined
      }
    />
  );
}

/**
 * Optimistic write with a guaranteed rollback path. The caller applies the
 * change locally, we run the mutation, and on failure we call `rollback` and
 * surface a toast that names the action — silence after a failed optimistic
 * update is how merchants end up trusting stale UI.
 */
export async function optimistic<T>({
  label,
  apply,
  rollback,
  run,
  onDone,
}: {
  /** Human phrase for the toast, e.g. "Archive product". */
  label: string;
  apply: () => void;
  rollback: () => void;
  run: () => Promise<T>;
  onDone?: (result: T) => void;
}): Promise<T | null> {
  apply();
  try {
    const result = await run();
    onDone?.(result);
    return result;
  } catch (error) {
    rollback();
    toast.error(`${label} failed`, {
      description: error instanceof Error ? error.message : "Please try again.",
    });
    return null;
  }
}

/* ----------------------------------------------------------------- buttons */

export const btnPrimary =
  "fq-shine inline-flex min-h-9 items-center justify-center gap-1.5 rounded-fq-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-[0_1px_0_0_rgb(255_255_255/0.18)_inset,0_6px_16px_-10px_var(--fq-signal)] transition-[transform,box-shadow,opacity] duration-150 hover:-translate-y-px hover:opacity-95 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50";

export const btnGhost =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-fq-md border border-border bg-card px-2.5 text-sm text-foreground transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--fq-signal)_30%,var(--color-border))] hover:bg-muted active:translate-y-0 disabled:pointer-events-none disabled:opacity-50";

/* --------------------------------------------------------------- DataTable */

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: string;
  /** Right-aligned, tabular figures — money and counts. */
  numeric?: boolean;
  /** Makes the header a sort control; the key is handed back to `onSort`. */
  sortable?: boolean;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selected,
  onToggle,
  onToggleAll,
  onRowClick,
  rowActions,
  sort,
  dir,
  onSort,
  loading,
  empty,
  page,
  pageSize,
  total,
  onPage,
  density,
  expandedKey,
  renderExpanded,
  rowLabel,
  stickyHeader = true,
}: {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  selected?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  /** Header checkbox: selects or clears everything currently visible. */
  onToggleAll?: (next: boolean) => void;
  onRowClick?: (row: T) => void;
  /** Revealed on row hover / keyboard focus, right-aligned. */
  rowActions?: (row: T) => ReactNode;
  sort?: string;
  dir?: "asc" | "desc";
  onSort?: (key: string) => void;
  loading?: boolean;
  empty?: ReactNode;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number) => void;
  density?: Density;
  /**
   * WordPress Quick Edit: when a row's key matches, the row is *replaced* by a
   * single full-width cell rendered by `renderExpanded` (Phase 11).
   */
  expandedKey?: string | null;
  renderExpanded?: (row: T) => ReactNode;
  /** Accessible name for the row checkbox, e.g. the item title. */
  rowLabel?: (row: T) => string;
  stickyHeader?: boolean;
}) {
  const d = useDensity(density);
  const pages = useMemo(
    () => (total && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1),
    [total, pageSize],
  );

  if (loading) return <TableSkeleton cols={columns.length} density={d} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  const ids = rows.map(rowKey);
  const allChecked = ids.length > 0 && ids.every((id) => selected?.has(id));

  /** j/k-free, browser-native keyboard path: arrows move, space selects. */
  function onRowKeyDown(e: ReactKeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.currentTarget[
        e.key === "ArrowDown" ? "nextElementSibling" : "previousElementSibling"
      ] as HTMLElement | null;
      next?.focus();
    } else if (e.key === " " && onToggle) {
      e.preventDefault();
      onToggle(rowKey(row));
    } else if (e.key === "Enter" && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className="fq-card fq-edge-inner overflow-hidden">
      <div className={cn(stickyHeader ? "max-h-[70vh] overflow-auto" : "overflow-x-auto")}>
        <table className="w-full border-collapse text-sm">
          <thead className={cn("bg-card/95 backdrop-blur", stickyHeader && "sticky top-0 z-[1]")}>
            <tr className="border-b border-border">
              {onToggle ? (
                <th scope="col" className="w-10 px-3 py-2">
                  {onToggleAll ? (
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={allChecked}
                      onChange={(e) => onToggleAll(e.target.checked)}
                    />
                  ) : null}
                </th>
              ) : null}
              {columns.map((c) => {
                const active = sort === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={
                      active ? (dir === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "px-3 py-2 text-xs font-medium fq-sub",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    {c.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cn(
                          // Header sort control keeps a comfortable hit area on touch.
                          "inline-flex min-h-8 items-center gap-1 rounded-fq-sm py-1 transition-colors hover:text-foreground",

                          active && "text-foreground",
                        )}
                      >
                        {c.header}
                        <span aria-hidden className="text-[10px]">
                          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions ? <th scope="col" className="w-24 px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const id = rowKey(row);
              const isSelected = selected?.has(id) ?? false;
              if (expandedKey === id && renderExpanded) {
                const span = columns.length + (onToggle ? 1 : 0) + (rowActions ? 1 : 0);
                return (
                  <tr key={id} data-row-id={id} data-expanded="true" className="bg-muted/30">
                    <td colSpan={span} className="p-0">
                      {renderExpanded(row)}
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={id}
                  data-row-id={id}
                  tabIndex={0}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={(e) => onRowKeyDown(e, row)}
                  aria-selected={onToggle ? isSelected : undefined}
                  className={cn(
                    "group fq-tr-accent transition-colors duration-150 hover:bg-muted/50 focus:bg-muted/60 focus:outline-none",
                    isSelected && "bg-primary/[0.06]",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {onToggle ? (
                    <td className={cn(CELL_PAD[d], "align-top pt-3")}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${rowLabel ? rowLabel(row) : id}`}
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => onToggle(id)}
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "align-middle",
                        CELL_PAD[d],
                        c.numeric && "text-right fq-num",
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className={cn(CELL_PAD[d], "text-right")}>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100"
                      >
                        {rowActions(row)}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {onPage && page && pages > 1 ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs">
          <span className="fq-sub">
            Page <span className="fq-num">{page}</span> of <span className="fq-num">{pages}</span>
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className="rounded-fq-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
              className="rounded-fq-md border border-border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


/* ------------------------------------------------------------------ Drawer */

export function Drawer({
  open,
  title,
  description,
  footer,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-[var(--fq-scrim)] backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fq-edge-inner flex w-full max-w-md flex-col border-l border-border bg-card motion-safe:animate-in motion-safe:slide-in-from-right-4 motion-safe:fade-in motion-safe:duration-200"
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-xs fq-sub">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-fq-md p-1 hover:bg-muted"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- ConfirmDialog */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  requireReason,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Destructive actions capture a reason that lands in the audit trail. */
  requireReason?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const blocked = Boolean(requireReason) && reason.trim().length < 4;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--fq-scrim)] p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="fq-edge-inner fq-halo w-full max-w-sm rounded-fq-lg border border-border bg-card p-4 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:fade-in motion-safe:duration-150"
      >
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm fq-sub">{description}</p> : null}
        {requireReason ? (
          <div className="mt-3">
            <Field label="Reason" hint="Recorded in the audit trail.">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnGhost}>
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={blocked}
            onClick={() => onConfirm(reason.trim())}
            className={cn(
              btnPrimary,
              destructive &&
                "bg-[var(--fq-danger)] text-[var(--color-destructive-foreground,oklch(0.99_0_0))]",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Timeline */

export type TimelineEntry = {
  id: string;
  at: string;
  title: ReactNode;
  detail?: ReactNode;
};

export function Timeline({ entries }: { entries: readonly TimelineEntry[] }) {
  if (entries.length === 0) return <EmptyState title="No activity yet" />;
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span
            className="absolute -left-[1.35rem] top-1.5 size-2 rounded-full bg-primary"
            aria-hidden
          />
          <p className="text-sm font-medium">{e.title}</p>
          <p className="text-xs fq-sub fq-num">{new Date(e.at).toLocaleString()}</p>
          {e.detail ? <div className="mt-1 text-sm fq-sub">{e.detail}</div> : null}
        </li>
      ))}
    </ol>
  );
}

/* =================================================================== Phase 7
 * Detail & edit flows: two-column layout, autosave with an honest dirty/saved
 * indicator, contextual actions in an overflow menu, inline editing.
 * ======================================================================== */

/** Two-column detail: main content plus a sticky side panel. */
export function DetailLayout({
  children,
  side,
}: {
  children: ReactNode;
  side?: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0 space-y-4">{children}</div>
      {side ? <aside className="space-y-4 lg:sticky lg:top-[5.5rem]">{side}</aside> : null}
    </div>
  );
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_COPY: Record<SaveState, string> = {
  idle: "No changes",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

export function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        state === "error" ? "text-[var(--fq-danger)]" : "fq-sub",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          state === "saved" && "bg-[var(--fq-success)]",
          state === "dirty" && "bg-[var(--fq-warning)]",
          state === "saving" && "bg-primary motion-safe:animate-pulse",
          state === "error" && "bg-[var(--fq-danger)]",
          state === "idle" && "bg-border",
        )}
      />
      {SAVE_COPY[state]}
    </span>
  );
}

/**
 * Sticky save bar. It only appears once the record is dirty or in flight, so a
 * clean record shows no chrome at all.
 */
export function SaveBar({
  state,
  onSave,
  onDiscard,
  saveLabel = "Save",
  children,
}: {
  state: SaveState;
  onSave?: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  children?: ReactNode;
}) {
  const visible = state === "dirty" || state === "saving" || state === "error";
  if (!visible) return null;
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-fq-lg border border-border bg-card/95 px-3 py-2 shadow-[var(--fq-admin-shadow-overlay,0_8px_24px_rgba(0,0,0,0.12))] backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <SaveIndicator state={state} />
      <div className="ml-auto flex items-center gap-2">
        {children}
        {onDiscard ? (
          <button type="button" onClick={onDiscard} className={btnGhost}>
            Discard
          </button>
        ) : null}
        {onSave ? (
          <button
            type="button"
            onClick={onSave}
            disabled={state === "saving"}
            className={cn(btnPrimary, "disabled:opacity-60")}
          >
            {state === "saving" ? "Saving…" : saveLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type MenuAction = {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/** Contextual actions live behind one overflow menu, never as a button wall. */
export function ActionMenu({
  actions,
  label = "More actions",
}: {
  actions: readonly MenuAction[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(btnGhost, "px-2")}
      >
        <span aria-hidden>•••</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-44 rounded-fq-md border border-border bg-card p-1 shadow-[var(--fq-admin-shadow-overlay,0_8px_24px_rgba(0,0,0,0.12))]"
        >
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className={cn(
                "block w-full rounded-fq-sm px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40",
                a.destructive && "text-[var(--fq-danger)]",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Debounced autosave. `save` runs after the record has been quiet for
 * `delay` ms; the returned state drives `SaveBar` / `SaveIndicator`.
 */
export function useAutosave({
  dirty,
  enabled = true,
  delay = 1200,
  save,
}: {
  dirty: boolean;
  enabled?: boolean;
  delay?: number;
  save: () => Promise<void>;
}): { state: SaveState; saveNow: () => void } {
  const [state, setState] = useState<SaveState>("idle");
  const saveRef = useRef(save);
  saveRef.current = save;
  const running = useRef(false);

  const run = useMemo(
    () => async () => {
      if (running.current) return;
      running.current = true;
      setState("saving");
      try {
        await saveRef.current();
        setState("saved");
      } catch {
        setState("error");
      } finally {
        running.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!dirty) {
      setState((s) => (s === "dirty" ? "idle" : s));
      return;
    }
    setState("dirty");
    if (!enabled) return;
    const timer = setTimeout(() => void run(), delay);
    return () => clearTimeout(timer);
  }, [dirty, enabled, delay, run]);

  return { state, saveNow: () => void run() };
}

/** Click-to-edit text that commits on blur or Enter and reverts on Escape. */
export function InlineEdit({
  value,
  onCommit,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`${ariaLabel} — click to edit`}
        className={cn(
          "rounded-fq-sm px-1 py-0.5 text-left hover:bg-muted",
          !value && "fq-sub",
          className,
        )}
      >
        {value || placeholder || "—"}
      </button>
    );
  }
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={cn(inputClass, className)}
    />
  );
}
