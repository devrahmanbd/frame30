/**
 * MatrixTable — modern responsive comparison and capability matrix.
 *
 * Rebuilt according to DESIGN.md and Hallmark standards:
 * - On mobile & tablet viewports: Renders as touch-friendly, visual Infographic Cards
 *   (grid-cols-1 md:grid-cols-2) without forced horizontal window scrollbars or min-w-[680px].
 * - On desktop viewports: Renders as a clean, container-free modern comparison table
 *   (w-full) with subtle hairline dividers, zero fake window chrome, and full accessibility.
 */
import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/public/motion";

export type MatrixColumn = {
  id: string;
  label: ReactNode;
  /** Emphasised column — our column in a comparison table. */
  highlight?: boolean;
  align?: "left" | "right";
};

export type MatrixRow = {
  id: string;
  /** Row header — rendered as `<th scope="row">`. */
  label: ReactNode;
  cells: Record<string, ReactNode>;
  badge?: ReactNode;
};

export type MatrixTableProps = {
  /** Screen-reader caption. Required: a table without one is an unlabelled grid. */
  caption: string;
  columns: MatrixColumn[];
  rows: MatrixRow[];
  /** Footnote under the table — assumptions, sources, "as of" dates. */
  note?: ReactNode;
  stickyHeader?: boolean;
  /** Layout style: auto (cards on mobile, table on desktop), cards, or clean */
  layout?: "auto" | "cards" | "clean";
  className?: string;
};

export function MatrixTable({
  caption,
  columns,
  rows,
  note,
  stickyHeader = true,
  layout = "auto",
  className,
}: MatrixTableProps) {
  const forceCards = layout === "cards";

  return (
    <Reveal className={cn("w-full", className)}>
      {/* Mobile & Tablet: Visual Infographic Cards (No horizontal window scroll) */}
      <div
        className={cn(
          forceCards ? "grid" : "grid lg:hidden",
          "grid-cols-1 sm:grid-cols-2 gap-4",
        )}
        role="region"
        aria-label={caption}
      >
        {rows.map((row) => {
          const highlightCol = columns.find((c) => c.highlight);
          const otherCols = columns.filter((c) => !c.highlight);

          return (
            <div
              key={row.id}
              className="rounded-fq-lg border border-border/80 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
                  <h4 className="font-semibold text-foreground text-sm sm:text-base leading-snug">
                    {row.label}
                  </h4>
                  {row.badge && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {row.badge}
                    </span>
                  )}
                </div>

                {/* Primary/Featured highlight if present */}
                {highlightCol && (
                  <div className="mt-3.5 rounded-fq-md border border-primary/30 bg-primary/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                      {highlightCol.label}
                    </p>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {row.cells[highlightCol.id] ?? <Minus className="size-4 text-muted-foreground inline" />}
                    </div>
                  </div>
                )}

                {/* Other columns */}
                {otherCols.length > 0 && (
                  <div className="mt-3 divide-y divide-border/40">
                    {otherCols.map((column) => (
                      <div
                        key={column.id}
                        className="flex items-center justify-between py-2 text-xs sm:text-sm"
                      >
                        <span className="text-muted-foreground font-medium pr-2">
                          {column.label}
                        </span>
                        <span
                          className={cn(
                            "font-medium text-right",
                            column.align === "right" && "tabular-nums",
                          )}
                        >
                          {row.cells[column.id] ?? "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop View: Container-free, Airy Modern Grid Table */}
      {!forceCards && (
        <div
          className="hidden lg:block w-full overflow-hidden rounded-fq-lg border border-border/70 bg-card"
          role="region"
          aria-label={caption}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className={cn(stickyHeader && "sticky top-16 z-10 bg-card/95 backdrop-blur-sm")}>
              <tr className="border-b border-border/80 bg-muted/20">
                <th scope="col" className="px-5 py-3.5 font-semibold text-muted-foreground">
                  Feature / Dimension
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(
                      "px-5 py-3.5 font-semibold",
                      column.align === "right" && "text-right",
                      column.highlight
                        ? "bg-primary/10 text-primary font-bold border-x border-primary/20"
                        : "text-muted-foreground",
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-muted/10 group"
                >
                  <th scope="row" className="px-5 py-4 font-medium text-foreground align-middle">
                    <div className="flex items-center gap-2">
                      <span>{row.label}</span>
                      {row.badge && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {row.badge}
                        </span>
                      )}
                    </div>
                  </th>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "px-5 py-4 align-middle",
                        column.align === "right" && "text-right tabular-nums",
                        column.highlight
                          ? "bg-primary/[0.03] font-semibold text-foreground border-x border-primary/20"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.cells[column.id] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {note ? (
        <p
          data-type-role="caption"
          className="mt-3 text-xs text-muted-foreground"
        >
          {note}
        </p>
      ) : null}
    </Reveal>
  );
}

/**
 * VisualInfographicDeck — Helper for presenting comparison cards or stats as visual infographics
 */
export type InfographicCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  points?: ReactNode[];
  highlight?: boolean;
  className?: string;
};

export function InfographicCard({
  title,
  subtitle,
  value,
  icon,
  badge,
  points,
  highlight,
  className,
}: InfographicCardProps) {
  return (
    <div
      className={cn(
        "rounded-fq-lg border p-6 transition-all flex flex-col justify-between",
        highlight
          ? "border-primary/40 bg-card shadow-lift-lg ring-1 ring-primary/20"
          : "border-border/70 bg-card/80 hover:border-border hover:shadow-sm",
        className,
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          {icon && (
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-fq-md shrink-0",
                highlight ? "bg-primary text-primary-foreground" : "bg-muted/40 text-foreground",
              )}
            >
              {icon}
            </div>
          )}
          {badge && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ml-auto",
                highlight
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {badge}
            </span>
          )}
        </div>

        <h3 className="fq-display text-lg font-bold text-foreground mt-4">{title}</h3>
        {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1">{subtitle}</p>}

        {value && (
          <div className="mt-4 border-t border-border/50 pt-3">
            <span className="fq-display text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums">
              {value}
            </span>
          </div>
        )}

        {points && points.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-border/50 pt-3">
            {points.map((pt, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                <Check className="size-4 text-primary shrink-0 mt-0.5" />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

