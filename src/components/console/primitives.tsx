/**
 * Legacy names for the console kit.
 *
 * Phase 3 moved the real implementations to `@/components/console/kit`. This
 * module stays as a thin alias layer so screens written before the rebuild keep
 * compiling; new code should import from `kit` directly.
 */

import type { ReactNode } from "react";
import {
  Badge,
  Card,
  DataTable,
  Drawer,
  ConfirmDialog,
  Money,
  Toolbar,
  type Column,
  type Tone,
} from "./kit";

export {
  BulkBar,
  Card,
  CardSkeleton,
  ChartSkeleton,
  DataTable,
  DetailSkeleton,
  Drawer,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Money,
  optimistic,
  Page,
  SavedViews,
  Skeleton,
  TableSkeleton,
  Timeline,
  Toolbar,
  Badge,
  btnGhost,
  btnPrimary,
  inputClass,
} from "./kit";
export type { Column, Density, SavedView, TimelineEntry, Tone } from "./kit";

/** @deprecated use `Page` */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm fq-sub">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** @deprecated use `Badge` */
export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <Badge tone={tone}>{children}</Badge>;
}

/** @deprecated use `Money` */
export const MoneyCell = Money;

/** @deprecated use `Toolbar` */
export const FilterBar = Toolbar;

/** @deprecated use `DataTable` */
export const ConsoleTable = DataTable as <T>(
  props: Parameters<typeof DataTable<T>>[0],
) => ReturnType<typeof DataTable<T>>;

/** @deprecated use `Drawer` */
export const ConsoleDrawer = Drawer;

/** @deprecated use `ConfirmDialog` */
export const ConsoleConfirm = ConfirmDialog;

export type { Column as ConsoleColumn };
export { Card as ConsoleCard };
